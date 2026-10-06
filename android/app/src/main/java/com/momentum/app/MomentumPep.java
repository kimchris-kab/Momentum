package com.momentum.app;

import android.app.AlarmManager;
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

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/**
 * Notes to yourself, as notifications: a prompt to write one line about what you did well, with a
 * reply box right in the notification, and one of your own earlier notes coming back at a random
 * moment.
 *
 * The web app works out what to send and when (src/lib/pep.js) and writes it as a plan through
 * Capacitor Preferences. This class schedules an alarm for each item, posts the notification when
 * it fires, and, when a note is typed into the reply box, leaves it where the app picks it up
 * next time it opens. The app is not needed for any of that, so a note can be written with the
 * phone locked and the app closed.
 *
 * The same class is the receiver for the alarms, the replies, and the system saying the phone
 * restarted or the app was updated, which is when alarms are lost and have to be set again.
 */
public class MomentumPep extends BroadcastReceiver {

    private static final String PREFS = "CapacitorStorage";
    /** Must match PEP_KEY in src/lib/pep.js — tests/android.test.mjs checks they're the same string. */
    static final String KEY = "momentum:pep";
    /** Must match PENDING_PEP_KEY in src/lib/pep.js. */
    static final String PENDING_KEY = "momentum:pendingPep";
    /** Which alarms this class has set, so the next plan can take them down first. */
    private static final String BOOK = "momentum_pep_alarms";
    private static final String BOOK_KEY = "ids";

    static final String CHANNEL = "momentum_pep";
    static final String ACTION_FIRE = "com.momentum.app.PEP_FIRE";
    static final String ACTION_REPLY = "com.momentum.app.PEP_REPLY";
    static final String REPLY_KEY = "pep_text";
    static final String EXTRA_TASK = "taskId";
    static final String EXTRA_NOTIFICATION = "notificationId";
    static final String SCHEME = "momentum-pep";

    static final int MAX_ITEMS = 30;
    static final int MAX_PENDING = 50;
    static final int MAX_NOTE = 280;
    /** An alarm that fires hours late (a phone in deep sleep, an app restart) is stale: better silent than wrong. */
    static final long STALE_MS = 3 * 60 * 60_000L;

    private static final int COLOR = 0xFF5FC7C0;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_FIRE.equals(action)) {
            Uri data = intent.getData();
            if (data != null && data.getLastPathSegment() != null) fire(context, data.getLastPathSegment());
        } else if (ACTION_REPLY.equals(action)) {
            handleReply(context, intent);
        } else if (Intent.ACTION_BOOT_COMPLETED.equals(action) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            refresh(context);
        }
    }

    // ---- the plan ----

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONArray planItems(Context context) {
        String raw = prefs(context).getString(KEY, null);
        if (raw == null) return new JSONArray();
        try {
            JSONArray items = new JSONObject(raw).optJSONArray("items");
            return items == null ? new JSONArray() : items;
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static JSONObject find(Context context, String id) {
        JSONArray items = planItems(context);
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item != null && id.equals(item.optString("id"))) return item;
        }
        return null;
    }

    // ---- the alarms ----

    private static PendingIntent alarmIntent(Context context, String id) {
        Intent fire = new Intent(context, MomentumPep.class).setAction(ACTION_FIRE)
                .setData(new Uri.Builder().scheme(SCHEME).authority("fire").appendPath(id).build());
        return PendingIntent.getBroadcast(context, 0, fire, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Set<String> scheduledIds(Context context) {
        return new HashSet<>(context.getSharedPreferences(BOOK, Context.MODE_PRIVATE).getStringSet(BOOK_KEY, new HashSet<>()));
    }

    /** Takes down what was set last time, and sets the plan as it stands now. */
    public static void refresh(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        for (String id : scheduledIds(context)) {
            PendingIntent old = alarmIntent(context, id);
            alarms.cancel(old);
            old.cancel();
        }
        Set<String> set = new HashSet<>();
        long now = System.currentTimeMillis();
        JSONArray items = planItems(context);
        for (int i = 0; i < items.length() && set.size() < MAX_ITEMS; i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            String id = item.optString("id", "");
            String kind = item.optString("kind", "");
            long at = item.optLong("at", 0L);
            if (id.isEmpty() || at <= now || (!"write".equals(kind) && !"remind".equals(kind))) continue;
            // Inexact and allowed while idle: a note arriving a few minutes either side of its random
            // moment is no loss, and it still arrives with the phone asleep.
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarmIntent(context, id));
            set.add(id);
        }
        context.getSharedPreferences(BOOK, Context.MODE_PRIVATE).edit().putStringSet(BOOK_KEY, set).commit();
    }

    // ---- the notification ----

    static void ensureChannel(NotificationManager nm, Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                context.getString(R.string.pep_channel_name), NotificationManager.IMPORTANCE_DEFAULT);
        channel.setDescription(context.getString(R.string.pep_channel_description));
        nm.createNotificationChannel(channel);
    }

    static int notificationId(String id) {
        return 7400 + (id.hashCode() & 0xFFF);
    }

    static Notification build(Context context, JSONObject item, int nid) {
        String kind = item.optString("kind", "");
        String body = item.optString("body", "");
        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_shade)
                .setColor(COLOR)
                .setContentTitle(item.optString("title", ""))
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setCategory(NotificationCompat.CATEGORY_REMINDER);

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            b.setContentIntent(PendingIntent.getActivity(context, 300 + (nid & 0xFF), launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        if ("write".equals(kind)) {
            RemoteInput input = new RemoteInput.Builder(REPLY_KEY)
                    .setLabel(context.getString(R.string.pep_reply_label)).build();
            Intent reply = new Intent(context, MomentumPep.class).setAction(ACTION_REPLY)
                    .setData(new Uri.Builder().scheme(SCHEME).authority("reply").appendPath(String.valueOf(nid)).build())
                    .putExtra(EXTRA_TASK, item.optString("taskId", ""))
                    .putExtra(EXTRA_NOTIFICATION, nid);
            // A reply box fills the intent in as it sends, which only a mutable PendingIntent can be.
            int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
            PendingIntent pending = PendingIntent.getBroadcast(context, 1, reply, PendingIntent.FLAG_UPDATE_CURRENT | mutable);
            b.addAction(new NotificationCompat.Action.Builder(0, context.getString(R.string.pep_action_write), pending)
                    .addRemoteInput(input).setAllowGeneratedReplies(false).build());
        }
        return b.build();
    }

    /** Posts the planned notification now, unless it is gone from the plan or hours late. */
    static boolean fire(Context context, String id) {
        JSONObject item = find(context, id);
        if (item == null) return false;
        long now = System.currentTimeMillis();
        if (now - item.optLong("at", 0L) > STALE_MS) return false;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || !nm.areNotificationsEnabled()) return false;
        ensureChannel(nm, context);
        int nid = notificationId(id);
        nm.notify(nid, build(context, item, nid));
        return true;
    }

    // ---- the reply ----

    /** What has been typed into reply boxes and not yet picked up by the app. */
    static JSONArray pending(Context context) {
        String raw = prefs(context).getString(PENDING_KEY, null);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Keeps a note for the app to collect. False for an empty one. */
    static boolean storeReply(Context context, String taskId, String text, long at) {
        if (taskId == null || taskId.isEmpty() || text == null) return false;
        String clean = text.trim();
        if (clean.isEmpty()) return false;
        if (clean.length() > MAX_NOTE) clean = clean.substring(0, MAX_NOTE);
        try {
            JSONArray all = pending(context);
            all.put(new JSONObject().put("taskId", taskId).put("text", clean).put("at", at));
            // The oldest go first if someone has written a great many without opening the app.
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, all.length() - MAX_PENDING); i < all.length(); i++) kept.put(all.get(i));
            return prefs(context).edit().putString(PENDING_KEY, kept.toString()).commit();
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * A note typed into the reply box. It is kept for the app, and the notification is replaced with a
     * thank-you: until it is, the reply box just keeps spinning, as though nothing had been sent.
     */
    static void handleReply(Context context, Intent intent) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        int nid = intent.getIntExtra(EXTRA_NOTIFICATION, 0);
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence typed = results == null ? null : results.getCharSequence(REPLY_KEY);
        boolean saved = storeReply(context, intent.getStringExtra(EXTRA_TASK),
                typed == null ? null : typed.toString(), System.currentTimeMillis());
        if (nm == null || nid == 0) return;
        if (!saved) {
            nm.cancel(nid);
            return;
        }
        ensureChannel(nm, context);
        nm.notify(nid, new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_shade)
                .setColor(COLOR)
                .setContentTitle(context.getString(R.string.pep_saved_title))
                .setContentText(context.getString(R.string.pep_saved_text))
                .setOnlyAlertOnce(true)
                .setTimeoutAfter(5000)
                .setAutoCancel(true)
                .build());
    }
}
