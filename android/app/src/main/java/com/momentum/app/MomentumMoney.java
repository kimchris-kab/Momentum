package com.momentum.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.NumberFormat;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;

/**
 * Logging money without opening the app.
 *
 * Two ways in, both ending in the same place. A quiet notification you can type into ("lunch 12") is read here and kept; and the messages
 * a bank or mobile-money service sends, read by {@link MoneySmsReceiver} and {@link MoneyListenerService}, become a notification
 * with the amount and a guess at the category, saved with one tap. What is kept is a short list of payments waiting for the app,
 * which collects them the next time it opens (src/lib/capture.js). Nothing here needs the app to be running.
 *
 * The words are read by {@link MoneyParse}, the phone's copy of the app's own parser, using the person's payees as the app last wrote them.
 * The same class is the receiver for the reply box, the Save and Undo buttons, and the phone restarting.
 */
public class MomentumMoney extends BroadcastReceiver {

    private static final String PREFS = "CapacitorStorage";
    /** Must match CAPTURE_KEY, PENDING_TX_KEY, UNDO_TX_KEY and PENDING_DRAFT_KEY in src/lib/capture.js. */
    static final String CONFIG_KEY = "momentum:capture";
    static final String PENDING_KEY = "momentum:pendingTx";
    static final String UNDO_KEY = "momentum:undoTx";
    static final String PENDING_DRAFT_KEY = "momentum:pendingDraft";
    /** This class's own bookkeeping, kept out of the web app's storage: payments already seen, apps that have sent one, drafts for the Change button. */
    private static final String OWN = "momentum_money";

    static final String CHANNEL_QUICK = "momentum_money_quick";
    static final String CHANNEL_PAYMENT = "momentum_money_payment";
    static final String ACTION_REPLY = "com.momentum.app.MONEY_REPLY";
    static final String ACTION_SAVE = "com.momentum.app.MONEY_SAVE";
    static final String ACTION_UNDO = "com.momentum.app.MONEY_UNDO";
    static final String REPLY_KEY = "money_line";
    static final String EXTRA_RECORD = "record";
    static final String EXTRA_ID = "id";
    static final String EXTRA_NOTIFICATION = "notificationId";
    static final String SCHEME = "momentum-money";
    /** The host the Change button's link carries, handled by MainActivity.stash. */
    static final String DRAFT_HOST = "draft";

    static final int QUICK_ID = 7600;
    static final int MAX_PENDING = 200;
    static final int MAX_SEEN = 120;
    static final long SEEN_MS = 3L * 24 * 3600 * 1000;
    /** How long the "Logged" answer stays up before the box comes back. */
    static final long CONFIRM_MS = 6000;

    private static final int COLOR = 0xFFE5B65C;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_REPLY.equals(action)) {
            final PendingResult pending = goAsync();
            handleReply(context, intent);
            // The box comes back a few seconds after the answer. A receiver may hold the broadcast open for a short while; this is within it.
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try { refresh(context); } finally { pending.finish(); }
            }, CONFIRM_MS);
        } else if (ACTION_SAVE.equals(action)) {
            handleSave(context, intent);
        } else if (ACTION_UNDO.equals(action)) {
            handleUndo(context, intent);
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            refresh(context);
        }
    }

    // ---- what the app told us ----

    /** The settings and the person's payees, as the web app last wrote them. */
    static final class Config {
        boolean quick = true;
        boolean read = false;
        String mode = "ask";
        List<String> senders = new ArrayList<>();
        List<String> packages = new ArrayList<>();
        final MoneyParse.Learned learned = new MoneyParse.Learned();
        JSONObject categories = new JSONObject();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static SharedPreferences own(Context context) {
        return context.getSharedPreferences(OWN, Context.MODE_PRIVATE);
    }

    static Config config(Context context) {
        Config c = new Config();
        String raw = prefs(context).getString(CONFIG_KEY, null);
        if (raw == null) return c;
        try {
            JSONObject o = new JSONObject(raw);
            c.quick = o.optBoolean("quick", true);
            c.read = o.optBoolean("read", false);
            c.mode = "auto".equals(o.optString("mode")) ? "auto" : "ask";
            JSONArray s = o.optJSONArray("senders");
            if (s != null) for (int i = 0; i < s.length(); i++) c.senders.add(s.optString(i));
            JSONArray p = o.optJSONArray("packages");
            if (p != null) for (int i = 0; i < p.length(); i++) c.packages.add(p.optString(i));
            JSONObject payees = o.optJSONObject("payees");
            if (payees != null) {
                for (Iterator<String> it = payees.keys(); it.hasNext();) {
                    String k = it.next();
                    c.learned.payees.put(k, payees.optString(k));
                }
            }
            JSONObject cats = o.optJSONObject("categories");
            if (cats != null) c.categories = cats;
        } catch (Exception ignored) { }
        return c;
    }

    // ---- who may be read ----

    /** Whether a text from this sender should be read: matched without regard to case, as a whole name or part of one. */
    static boolean senderAllowed(String sender, List<String> allowed) {
        if (sender == null || allowed == null) return false;
        String s = sender.trim().toLowerCase(Locale.ROOT);
        if (s.isEmpty()) return false;
        for (String a : allowed) {
            String t = a == null ? "" : a.trim().toLowerCase(Locale.ROOT);
            if (t.length() < 2) continue;
            if (s.equals(t) || s.contains(t) || (s.length() >= 3 && t.contains(s))) return true;
        }
        return false;
    }

    // ---- words for people ----

    static String amountText(double amount) {
        NumberFormat f = NumberFormat.getNumberInstance(Locale.US);
        f.setMaximumFractionDigits(2);
        f.setMinimumFractionDigits(0);
        return f.format(amount);
    }

    static String categoryLabel(Config c, String id) {
        JSONObject o = c.categories.optJSONObject(id);
        if (o != null && !o.optString("label").isEmpty()) return o.optString("label");
        return id == null ? "" : id.replace('_', ' ');
    }

    private static String moneyTitle(MoneyParse.Payment p) {
        String cur = p.cur == null ? "" : p.cur + " ";
        String sign = "income".equals(p.type) ? "+" : "";
        return sign + cur + amountText(p.amount);
    }

    // ---- the payments waiting for the app ----

    static JSONArray readList(Context context, String key) {
        String raw = prefs(context).getString(key, null);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static JSONArray pending(Context context) {
        return readList(context, PENDING_KEY);
    }

    /** The record the app will add: the same fields the app's own payments have, with an id that is the same every time for one payment. */
    static JSONObject record(MoneyParse.Payment p, long at) {
        try {
            String key = MoneyParse.paymentKey(p);
            String id;
            if ("typed".equals(p.via)) {
                id = "q-" + Long.toString(at, 36) + "-" + Integer.toString((int) (Math.random() * 46656), 36);
                key = "typed:" + id;
            } else {
                id = "cap-" + key.replaceAll("[^A-Za-z0-9]+", "-");
                if (id.length() > 64) id = id.substring(0, 64);
            }
            JSONObject o = new JSONObject().put("id", id).put("amount", p.amount).put("type", p.type).put("catId", p.catId)
                    .put("date", p.date).put("payee", p.payee == null ? "" : p.payee).put("key", key).put("via", p.via).put("at", at);
            if (p.ref != null) o.put("ref", p.ref);
            if (p.cur != null) o.put("cur", p.cur);
            if (p.time != null) o.put("time", p.time);
            return o;
        } catch (Exception e) {
            return null;
        }
    }

    /** Keeps a payment for the app to collect. */
    static boolean savePending(Context context, JSONObject record) {
        if (record == null) return false;
        try {
            JSONArray all = pending(context);
            String id = record.optString("id");
            for (int i = 0; i < all.length(); i++) {
                JSONObject have = all.optJSONObject(i);
                if (have != null && id.equals(have.optString("id"))) return true; // already there
            }
            all.put(record);
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, all.length() - MAX_PENDING); i < all.length(); i++) kept.put(all.get(i));
            return prefs(context).edit().putString(PENDING_KEY, kept.toString()).commit();
        } catch (Exception e) {
            return false;
        }
    }

    /** Takes a payment back out: from the waiting list if the app has not collected it, else by telling the app to remove it. */
    static void undo(Context context, String id) {
        if (id == null || id.isEmpty()) return;
        try {
            JSONArray all = pending(context);
            JSONArray kept = new JSONArray();
            boolean found = false;
            for (int i = 0; i < all.length(); i++) {
                JSONObject o = all.optJSONObject(i);
                if (o != null && id.equals(o.optString("id"))) { found = true; continue; }
                kept.put(all.get(i));
            }
            if (found) {
                prefs(context).edit().putString(PENDING_KEY, kept.toString()).commit();
            } else {
                JSONArray undone = readList(context, UNDO_KEY);
                undone.put(id);
                prefs(context).edit().putString(UNDO_KEY, undone.toString()).commit();
            }
        } catch (Exception ignored) { }
    }

    // ---- payments already seen ----

    private static boolean seen(Context context, String key, String ref, long now) {
        try {
            JSONArray all = new JSONArray(own(context).getString("seen", "[]"));
            for (int i = 0; i < all.length(); i++) {
                JSONObject o = all.optJSONObject(i);
                if (o == null || now - o.optLong("at") > SEEN_MS) continue;
                if (key.equals(o.optString("k")) || (ref != null && ref.equals(o.optString("r")))) return true;
            }
        } catch (Exception ignored) { }
        JSONArray waiting = pending(context);
        for (int i = 0; i < waiting.length(); i++) {
            JSONObject o = waiting.optJSONObject(i);
            if (o != null && (key.equals(o.optString("key")) || (ref != null && ref.equals(o.optString("ref"))))) return true;
        }
        return false;
    }

    private static void remember(Context context, String key, String ref, long now) {
        try {
            JSONArray all = new JSONArray(own(context).getString("seen", "[]"));
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, all.length() - MAX_SEEN + 1); i < all.length(); i++) {
                JSONObject o = all.optJSONObject(i);
                if (o != null && now - o.optLong("at") <= SEEN_MS) kept.put(o);
            }
            kept.put(new JSONObject().put("k", key).put("r", ref == null ? "" : ref).put("at", now));
            own(context).edit().putString("seen", kept.toString()).commit();
        } catch (Exception ignored) { }
    }

    // ---- notifications ----

    static void ensureChannels(NotificationManager nm, Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel quick = new NotificationChannel(CHANNEL_QUICK, context.getString(R.string.money_quick_channel), NotificationManager.IMPORTANCE_LOW);
        quick.setDescription(context.getString(R.string.money_quick_channel_description));
        quick.setShowBadge(false);
        nm.createNotificationChannel(quick);
        NotificationChannel pay = new NotificationChannel(CHANNEL_PAYMENT, context.getString(R.string.money_payment_channel), NotificationManager.IMPORTANCE_DEFAULT);
        pay.setDescription(context.getString(R.string.money_payment_channel_description));
        nm.createNotificationChannel(pay);
    }

    private static NotificationManager manager(Context context) {
        return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private static PendingIntent openApp(Context context, int code) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) return null;
        return PendingIntent.getActivity(context, code, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The box in the shade, or nothing if it has been switched off. */
    public static void refresh(Context context) {
        NotificationManager nm = manager(context);
        if (nm == null) return;
        Config c = config(context);
        if (!c.quick || !nm.areNotificationsEnabled()) {
            nm.cancel(QUICK_ID);
            return;
        }
        ensureChannels(nm, context);
        nm.notify(QUICK_ID, quickNotification(context));
    }

    static Notification quickNotification(Context context) {
        RemoteInput input = new RemoteInput.Builder(REPLY_KEY).setLabel(context.getString(R.string.money_quick_label)).build();
        Intent reply = new Intent(context, MomentumMoney.class).setAction(ACTION_REPLY)
                .setData(new Uri.Builder().scheme(SCHEME).authority("reply").build());
        // A reply box fills the intent in as it sends, which only a mutable PendingIntent can be.
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent send = PendingIntent.getBroadcast(context, 20, reply, PendingIntent.FLAG_UPDATE_CURRENT | mutable);
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_QUICK)
                .setSmallIcon(R.drawable.ic_shade)
                .setColor(COLOR)
                .setContentTitle(context.getString(R.string.money_quick_title))
                .setContentText(context.getString(R.string.money_quick_text))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(new NotificationCompat.Builder(context, CHANNEL_QUICK)
                        .setSmallIcon(R.drawable.ic_shade).setColor(COLOR)
                        .setContentTitle(context.getString(R.string.money_quick_public)).build())
                .addAction(new NotificationCompat.Action.Builder(0, context.getString(R.string.money_quick_action), send)
                        .addRemoteInput(input).setAllowGeneratedReplies(false).build());
        PendingIntent open = openApp(context, 21);
        if (open != null) b.setContentIntent(open);
        return b.build();
    }

    /** What the person typed into the box: kept for the app and answered in the notification, with a way to take it back. Null if it could not be read. */
    static MoneyParse.Payment handleReply(Context context, Intent intent) {
        NotificationManager nm = manager(context);
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence typed = results == null ? null : results.getCharSequence(REPLY_KEY);
        long now = System.currentTimeMillis();
        MoneyParse.load(context);
        Config c = config(context);
        MoneyParse.Payment p = typed == null ? null : MoneyParse.parseTyped(typed.toString(), MoneyParse.today(now), c.learned);
        if (nm == null) return p;
        ensureChannels(nm, context);
        if (p == null) {
            nm.notify(QUICK_ID, answer(context, context.getString(R.string.money_quick_unread_title), context.getString(R.string.money_quick_unread_text), null));
            return null;
        }
        JSONObject rec = record(p, now);
        savePending(context, rec);
        String what = amountText(p.amount) + " · " + categoryLabel(c, p.catId);
        nm.notify(QUICK_ID, answer(context, context.getString(R.string.money_logged_title, what),
                p.payee == null || p.payee.isEmpty() ? p.date : p.payee, rec == null ? null : rec.optString("id")));
        return p;
    }

    /** A short answer in place of the box, optionally with Undo. */
    private static Notification answer(Context context, String title, String text, String undoId) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL_QUICK)
                .setSmallIcon(R.drawable.ic_shade).setColor(COLOR)
                .setContentTitle(title).setContentText(text)
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_LOW);
        if (undoId != null) b.addAction(0, context.getString(R.string.money_undo), undoIntent(context, undoId, QUICK_ID));
        return b.build();
    }

    private static PendingIntent undoIntent(Context context, String id, int nid) {
        Intent undo = new Intent(context, MomentumMoney.class).setAction(ACTION_UNDO)
                .setData(new Uri.Builder().scheme(SCHEME).authority("undo").appendPath(id).build())
                .putExtra(EXTRA_ID, id).putExtra(EXTRA_NOTIFICATION, nid);
        return PendingIntent.getBroadcast(context, 22, undo, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void handleUndo(Context context, Intent intent) {
        undo(context, intent.getStringExtra(EXTRA_ID));
        NotificationManager nm = manager(context);
        if (nm == null) return;
        int nid = intent.getIntExtra(EXTRA_NOTIFICATION, 0);
        if (nid == QUICK_ID) refresh(context);
        else if (nid != 0) nm.cancel(nid);
    }

    // ---- a payment read from a message ----

    static int notificationId(String key) {
        return 7700 + (key.hashCode() & 0xFFF);
    }

    /**
     * A payment the phone has read. Skipped if it has been seen (a text and an app notification can both announce one payment). Otherwise
     * either offered with Save and Change, or, if the person has chosen automatic, saved at once with a way to undo it.
     * Returns what was done: "offered", "saved", "duplicate" or "off".
     */
    static String handlePayment(Context context, MoneyParse.Payment p, long now) {
        Config c = config(context);
        if (!c.read) return "off";
        String key = MoneyParse.paymentKey(p);
        if (seen(context, key, p.ref, now)) return "duplicate";
        remember(context, key, p.ref, now);
        NotificationManager nm = manager(context);
        JSONObject rec = record(p, now);
        if (rec == null) return "off";
        int nid = notificationId(key);
        if (nm != null) ensureChannels(nm, context);
        if ("auto".equals(c.mode)) {
            savePending(context, rec);
            if (nm != null && nm.areNotificationsEnabled()) nm.notify(nid, savedNotification(context, c, p, rec, nid));
            return "saved";
        }
        if (nm != null && nm.areNotificationsEnabled()) nm.notify(nid, offerNotification(context, c, p, rec, nid));
        return "offered";
    }

    private static String offerText(Context context, Config c, MoneyParse.Payment p) {
        String who = p.payee == null || p.payee.isEmpty() ? "" : p.payee + ". ";
        return who + context.getString(R.string.money_offer_text, categoryLabel(c, p.catId));
    }

    static Notification offerNotification(Context context, Config c, MoneyParse.Payment p, JSONObject rec, int nid) {
        Intent save = new Intent(context, MomentumMoney.class).setAction(ACTION_SAVE)
                .setData(new Uri.Builder().scheme(SCHEME).authority("save").appendPath(String.valueOf(nid)).build())
                .putExtra(EXTRA_RECORD, rec.toString()).putExtra(EXTRA_NOTIFICATION, nid);
        PendingIntent savePi = PendingIntent.getBroadcast(context, 30, save, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        // The Change button opens the app on this payment, ready to adjust. The payment waits under its own key until the app asks for it.
        own(context).edit().putString("draft:" + nid, rec.toString()).apply();
        Intent change = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
                .setData(new Uri.Builder().scheme(MomentumWidget.URGE_SCHEME).authority(DRAFT_HOST).appendPath(String.valueOf(nid)).build())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent changePi = PendingIntent.getActivity(context, 31, change, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = offerText(context, c, p);
        return new NotificationCompat.Builder(context, CHANNEL_PAYMENT)
                .setSmallIcon(R.drawable.ic_shade).setColor(COLOR)
                .setContentTitle(moneyTitle(p)).setContentText(text)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .addAction(0, context.getString(R.string.money_save), savePi)
                .addAction(0, context.getString(R.string.money_change), changePi)
                .build();
    }

    static Notification savedNotification(Context context, Config c, MoneyParse.Payment p, JSONObject rec, int nid) {
        String what = amountText(p.amount) + " · " + categoryLabel(c, p.catId);
        return new NotificationCompat.Builder(context, CHANNEL_PAYMENT)
                .setSmallIcon(R.drawable.ic_shade).setColor(COLOR)
                .setContentTitle(context.getString(R.string.money_saved_title, what))
                .setContentText(p.payee == null ? "" : p.payee)
                .setTimeoutAfter(20_000).setAutoCancel(true).setOnlyAlertOnce(true)
                .addAction(0, context.getString(R.string.money_undo), undoIntent(context, rec.optString("id"), nid))
                .build();
    }

    /** The Save button: keep the payment, and replace the offer with a short confirmation that can be undone. */
    static void handleSave(Context context, Intent intent) {
        String raw = intent.getStringExtra(EXTRA_RECORD);
        int nid = intent.getIntExtra(EXTRA_NOTIFICATION, 0);
        NotificationManager nm = manager(context);
        try {
            JSONObject rec = new JSONObject(raw);
            savePending(context, rec);
            own(context).edit().remove("draft:" + nid).apply();
            if (nm == null || nid == 0) return;
            ensureChannels(nm, context);
            Config c = config(context);
            MoneyParse.Payment p = new MoneyParse.Payment();
            p.amount = rec.optDouble("amount");
            p.catId = rec.optString("catId");
            p.payee = rec.optString("payee");
            nm.notify(nid, savedNotification(context, c, p, rec, nid));
        } catch (Exception e) {
            if (nm != null && nid != 0) nm.cancel(nid);
        }
    }

    /** The Change button's payment, moved to where the app looks for it. Called when the app is opened from that button. */
    static boolean stashDraft(Context context, String nidText) {
        String raw = own(context).getString("draft:" + nidText, null);
        if (raw == null) return false;
        prefs(context).edit().putString(PENDING_DRAFT_KEY, raw).apply();
        own(context).edit().remove("draft:" + nidText).apply();
        NotificationManager nm = manager(context);
        try { if (nm != null) nm.cancel(Integer.parseInt(nidText)); } catch (NumberFormatException ignored) { }
        return true;
    }

    // ---- apps that have sent a payment ----

    /** Notes that an app sent something that looked like a payment, so Settings can offer it. Only the app and a count are kept, never the words. */
    static void noteCandidate(Context context, String pkg, String label) {
        try {
            JSONObject all = new JSONObject(own(context).getString("cands", "{}"));
            JSONObject mine = all.optJSONObject(pkg);
            int count = mine == null ? 0 : mine.optInt("count", 0);
            all.put(pkg, new JSONObject().put("label", label == null ? pkg : label).put("count", count + 1));
            own(context).edit().putString("cands", all.toString()).apply();
        } catch (Exception ignored) { }
    }

    static JSONArray candidates(Context context) {
        JSONArray out = new JSONArray();
        try {
            JSONObject all = new JSONObject(own(context).getString("cands", "{}"));
            for (Iterator<String> it = all.keys(); it.hasNext();) {
                String pkg = it.next();
                JSONObject o = all.optJSONObject(pkg);
                if (o == null) continue;
                out.put(new JSONObject().put("package", pkg).put("label", o.optString("label", pkg)).put("count", o.optInt("count", 0)));
            }
        } catch (Exception ignored) { }
        return out;
    }
}
