package com.momentum.app;

import android.app.AlarmManager;
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

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The habit counter in the notification shade: one habit's clean time, silent and always there,
 * with an Urge button and an I-slipped button.
 *
 * Like the widget it only reads a small snapshot the web app writes through Capacitor
 * Preferences, and works out the elapsed time itself each time it draws — a timestamp doesn't go
 * stale the way "4d 6h" does. The same class is the receiver for its own refresh alarm and for
 * the system telling it the phone restarted or the app was updated, so the counter comes back
 * without the app being opened.
 *
 * Under an hour the header carries a live chronometer that counts by itself; after that the
 * headline is hours and minutes, refreshed every 15 minutes.
 */
public class MomentumShade extends BroadcastReceiver {

    /** Capacitor Preferences writes to this file with no group configured. */
    private static final String PREFS = "CapacitorStorage";
    /** Must match SHADE_KEY in src/lib/shade.js — tests/android.test.mjs checks they're the same string. */
    static final String KEY = "momentum:shade";

    static final String CHANNEL = "momentum_shade";
    static final int NOTIFICATION_ID = 7301;
    static final String TICK_ACTION = "com.momentum.app.SHADE_TICK";
    static final long TICK_MS = 15 * 60_000L;
    /** The Slip button opens the app on the slip form, the same way Urge opens the urge screen. */
    static final String SLIP_HOST = "slip";
    /** A habit's window counts as "soon" from this many minutes before it opens. */
    static final int WARN_MINUTES = 60;
    /** "I held it" tapped on the notification, and a line typed into it. */
    static final String ACTION_HELD = "com.momentum.app.SHADE_HELD";
    static final String ACTION_NOTE = "com.momentum.app.SHADE_NOTE";
    /** Must match PENDING_HOLD_KEY and PENDING_NOTE_KEY in src/lib/shade.js. */
    static final String PENDING_HOLD_KEY = "momentum:pendingHold";
    static final String PENDING_NOTE_KEY = "momentum:pendingNote";
    static final String NOTE_KEY = "shade_note";
    static final String SCHEME = "momentum-shade";
    static final int MAX_PENDING = 50;
    static final int MAX_NOTE = 280;
    /** How long after a red zone ends the notification still asks whether it was held. */
    static final long HELD_WINDOW_MS = 2 * 60 * 60_000L;
    /** Which zones were answered here, until the app has heard and stops sending them. */
    private static final String OWN = "momentum_shade_answers";

    private static final int COLOR_CALM = 0xFF5FC7C0;
    private static final int COLOR_WARN = 0xFFE8B75D;

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_HELD.equals(action)) {
            handleHeld(context, intent);
        } else if (ACTION_NOTE.equals(action)) {
            handleNote(context, intent);
        } else if (TICK_ACTION.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)) {
            refresh(context);
        }
    }

    static JSONObject snapshot(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }

    /** Puts the counter up, updates it, or takes it down, according to the latest snapshot. */
    public static void refresh(Context context) {
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        JSONObject s = snapshot(context);
        if (s == null || !s.optBoolean("show", false) || s.optString("id", "").isEmpty()) {
            nm.cancel(NOTIFICATION_ID);
            cancelTick(context);
            return;
        }
        // Without permission there is nothing to post, and nothing to wake up for either.
        if (!nm.areNotificationsEnabled()) {
            cancelTick(context);
            return;
        }
        long now = System.currentTimeMillis();
        ensureChannel(nm, context);
        nm.notify(NOTIFICATION_ID, build(context, s, now));
        scheduleTick(context, nextTickAt(s, now));
    }

    static void ensureChannel(NotificationManager nm, Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        // Low importance is what makes it silent and puts it in the Silent group: no sound, no
        // vibration, no pop-up over whatever the person is doing.
        NotificationChannel channel = new NotificationChannel(CHANNEL,
                context.getString(R.string.shade_channel_name), NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(context.getString(R.string.shade_channel_description));
        channel.setShowBadge(false);
        nm.createNotificationChannel(channel);
    }

    // ---- What it says ----

    /** The most recent slip, or 0 if the app didn't send one. */
    private static long lastSlip(JSONObject s) {
        return s.optLong("lastSlipAt", 0L);
    }

    static String since(long ms) {
        return MomentumWidget.since(ms);
    }

    /** True while a hard window is open or about to be. */
    static boolean warn(JSONObject s, long now) {
        int until = MomentumWidget.riskUntil(s, now);
        return until == MomentumWidget.RISK_NOW
                || (until >= 0 && until <= WARN_MINUTES);
    }

    /** Under an hour the header's chronometer does the counting, so the headline just says so. */
    static boolean freshHour(JSONObject s, long now) {
        long last = lastSlip(s);
        return last > 0 && now >= last && now - last < HOUR;
    }

    static String headline(Context context, JSONObject s, long now) {
        long last = lastSlip(s);
        if (last <= 0 || now < last) return context.getString(R.string.shade_fresh_start);
        if (freshHour(s, now)) return context.getString(R.string.shade_fresh_start);
        return since(now - last) + " clean";
    }

    /** "Your longest run yet", "Best run 11d", or, for a habit that has never slipped, how it began. */
    static String bestLine(JSONObject s, long now) {
        long last = lastSlip(s);
        long best = s.optLong("bestPastMs", 0L);
        boolean slipped = s.optBoolean("everSlipped", false);
        if (!slipped) return "Clean since you started";
        if (best <= 0) return "";
        if (last > 0 && now >= last && now - last >= best) return "Your longest run yet";
        return "Best run " + since(best);
    }

    private static String urgeLine(JSONObject s, long now) {
        long lastUrge = s.optLong("lastUrgeAt", 0L);
        if (lastUrge > 0 && now >= lastUrge) return "last urge " + since(now - lastUrge) + " ago";
        return "";
    }

    /** The one line under the headline: the warning when there is one, otherwise how the run compares. */
    static String secondLine(JSONObject s, long now) {
        if (warn(s, now)) return MomentumWidget.riskLine(s, now);
        List<String> parts = new ArrayList<>();
        String best = bestLine(s, now);
        if (!best.isEmpty()) parts.add(best);
        String urge = urgeLine(s, now);
        if (!urge.isEmpty()) parts.add(urge);
        return join(parts);
    }

    /** What shows when the notification is opened up: the second line, then what else is worth knowing. */
    static String expandedText(JSONObject s, long now) {
        List<String> lines = new ArrayList<>();
        String second = secondLine(s, now);
        if (!second.isEmpty()) lines.add(second);
        if (warn(s, now)) {
            String best = bestLine(s, now);
            String urge = urgeLine(s, now);
            String rest = join(best.isEmpty() ? list(urge) : urge.isEmpty() ? list(best) : list(best, urge));
            if (!rest.isEmpty()) lines.add(rest);
        } else {
            MomentumWidget.Risk r = MomentumWidget.riskOf(s, now);
            if (r != null) lines.add((r.zone ? "Your red zone is " : "Urges usually come ") + riskRange(r) + ".");
        }
        // What the day has held so far, and what is worth doing with the rest of it.
        int urges = s.optInt("urgesToday", 0);
        if (urges > 0) lines.add(urges + (urges == 1 ? " urge" : " urges") + " ridden out today");
        int streak = s.optInt("zoneStreak", 0);
        if (streak >= 2) lines.add(streak + " red zones held in a row");
        JSONObject practice = s.optJSONObject("practice");
        if (practice != null && !practice.optString("text", "").isEmpty()) {
            lines.add("Today's " + practice.optString("name", "practice").toLowerCase() + ": " + practice.optString("text"));
        }
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < lines.size(); i++) {
            if (i > 0) out.append('\n');
            out.append(lines.get(i));
        }
        return out.toString();
    }

    private static String riskRange(MomentumWidget.Risk r) {
        return MomentumWidget.clockOf(r.startMin) + "\u2013" + MomentumWidget.clockOf(r.endMin);
    }

    private static List<String> list(String... items) {
        List<String> out = new ArrayList<>();
        for (String item : items) out.add(item);
        return out;
    }

    private static String join(List<String> parts) {
        StringBuilder out = new StringBuilder();
        for (String p : parts) {
            if (out.length() > 0) out.append(" · ");
            out.append(p);
        }
        return out.toString();
    }

    // ---- A red zone that has just ended ----

    private static Set<String> answeredHere(Context context) {
        return new HashSet<>(context.getSharedPreferences(OWN, Context.MODE_PRIVATE).getStringSet("held", new HashSet<>()));
    }

    /**
     * The red zone, as "zone@date", whose end is recent and has no answer: for the two hours after it ends, "I held it" takes the place of the
     * Urge button, because the hard part is over and the question is how it went. Null when there is none.
     */
    static String heldKey(Context context, JSONObject s, long now) {
        JSONArray ends = s.optJSONArray("zoneEnds");
        if (ends == null) return null;
        Set<String> answered = context == null ? new HashSet<String>() : answeredHere(context);
        String best = null;
        long bestEnd = 0;
        for (int i = 0; i < ends.length(); i++) {
            JSONObject e = ends.optJSONObject(i);
            if (e == null) continue;
            String key = e.optString("key", "");
            long endAt = e.optLong("endAt", 0L);
            if (key.isEmpty() || endAt <= 0 || endAt > now || now - endAt > HELD_WINDOW_MS || answered.contains(key)) continue;
            if (endAt >= bestEnd) { best = key; bestEnd = endAt; }
        }
        return best;
    }

    /** Adds one row to a list the web app collects the next time it opens. */
    static void appendPending(Context context, String key, JSONObject row) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray all = new JSONArray(prefs.getString(key, "[]"));
            all.put(row);
            JSONArray kept = new JSONArray();
            for (int i = Math.max(0, all.length() - MAX_PENDING); i < all.length(); i++) kept.put(all.get(i));
            prefs.edit().putString(key, kept.toString()).commit();
        } catch (Exception ignored) { }
    }

    static JSONArray pendingList(Context context, String key) {
        try {
            return new JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** "I held it": kept for the app to record, and the button goes away at once rather than when the app next opens. */
    static void handleHeld(Context context, Intent intent) {
        String taskId = intent.getStringExtra("taskId");
        String zone = intent.getStringExtra("zone");
        if (taskId != null && !taskId.isEmpty() && zone != null && zone.contains("@")) {
            try {
                appendPending(context, PENDING_HOLD_KEY, new JSONObject().put("taskId", taskId).put("zone", zone).put("at", System.currentTimeMillis()));
            } catch (Exception ignored) { }
            SharedPreferences own = context.getSharedPreferences(OWN, Context.MODE_PRIVATE);
            Set<String> held = answeredHere(context);
            if (held.size() > 60) held.clear();
            held.add(zone);
            own.edit().putStringSet("held", held).commit();
        }
        refresh(context);
    }

    /**
     * A line typed into the notification, kept with the habit it was for. Redrawing the notification is what ends the reply box's spinner,
     * so it happens whether or not anything was written.
     */
    static void handleNote(Context context, Intent intent) {
        Bundle results = RemoteInput.getResultsFromIntent(intent);
        CharSequence typed = results == null ? null : results.getCharSequence(NOTE_KEY);
        String taskId = intent.getStringExtra("taskId");
        String text = typed == null ? "" : typed.toString().trim();
        if (text.length() > MAX_NOTE) text = text.substring(0, MAX_NOTE);
        if (taskId != null && !taskId.isEmpty() && !text.isEmpty()) {
            try {
                appendPending(context, PENDING_NOTE_KEY, new JSONObject().put("taskId", taskId).put("text", text).put("at", System.currentTimeMillis()));
            } catch (Exception ignored) { }
        }
        refresh(context);
    }

    // ---- The notification ----

    private static PendingIntent action(Context context, String host, String id, int requestCode) {
        // As on the widget, each button needs its own URI: Android treats two PendingIntents as the
        // same by action, data and class, and extras don't count.
        Intent intent = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(new Uri.Builder().scheme(MomentumWidget.URGE_SCHEME).authority(host).appendPath(id).build())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent heldIntent(Context context, String id, String zone) {
        Intent held = new Intent(context, MomentumShade.class).setAction(ACTION_HELD)
                .setData(new Uri.Builder().scheme(SCHEME).authority("held").appendPath(id).appendPath(zone).build())
                .putExtra("taskId", id).putExtra("zone", zone);
        return PendingIntent.getBroadcast(context, 203, held, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static NotificationCompat.Action noteAction(Context context, String id) {
        RemoteInput input = new RemoteInput.Builder(NOTE_KEY).setLabel(context.getString(R.string.shade_note_label)).build();
        Intent note = new Intent(context, MomentumShade.class).setAction(ACTION_NOTE)
                .setData(new Uri.Builder().scheme(SCHEME).authority("note").appendPath(id).build())
                .putExtra("taskId", id);
        // A reply box fills the intent in as it sends, which only a mutable PendingIntent can be.
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent pi = PendingIntent.getBroadcast(context, 204, note, PendingIntent.FLAG_UPDATE_CURRENT | mutable);
        return new NotificationCompat.Action.Builder(0, context.getString(R.string.shade_action_note), pi)
                .addRemoteInput(input).setAllowGeneratedReplies(false).build();
    }

    static android.app.Notification build(Context context, JSONObject s, long now) {
        String id = s.optString("id", "");
        String name = s.optString("name", "");
        boolean warn = warn(s, now);
        boolean hide = s.optBoolean("hideOnLock", true);
        int color = warn ? COLOR_WARN : COLOR_CALM;

        NotificationCompat.Builder b = new NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(R.drawable.ic_shade)
                .setColor(color)
                .setContentTitle(headline(context, s, now))
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setSilent(true)
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setShowWhen(false)
                .setSubText(name);

        String second = secondLine(s, now);
        if (!second.isEmpty()) b.setContentText(second);
        String expanded = expandedText(s, now);
        if (!expanded.isEmpty()) b.setStyle(new NotificationCompat.BigTextStyle().bigText(expanded));

        long last = lastSlip(s);
        if (freshHour(s, now)) {
            // Counts up on its own from the slip, with no refresh needed.
            b.setShowWhen(true).setWhen(last).setUsesChronometer(true);
        }

        // The buttons follow the hour. Mostly: ride out an urge, or say you slipped. Just after a red zone ends, the question is how it went, so
        // "I held it" takes the place of the first. And a line can always be typed, for what was going on.
        String held = heldKey(context, s, now);
        if (held != null) b.addAction(0, context.getString(R.string.shade_action_held), heldIntent(context, id, held));
        else b.addAction(0, context.getString(R.string.shade_action_urge), action(context, MomentumWidget.URGE_HOST, id, 200));
        b.addAction(0, context.getString(R.string.shade_action_slipped), action(context, SLIP_HOST, id, 201));
        b.addAction(noteAction(context, id));

        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            b.setContentIntent(PendingIntent.getActivity(context, 202, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }

        if (hide) {
            // The lock screen is seen by other people. What shows there says nothing about the habit.
            b.setVisibility(NotificationCompat.VISIBILITY_PRIVATE);
            b.setPublicVersion(new NotificationCompat.Builder(context, CHANNEL)
                    .setSmallIcon(R.drawable.ic_shade)
                    .setColor(COLOR_CALM)
                    .setContentTitle(context.getString(R.string.shade_private_title))
                    .setShowWhen(false)
                    .build());
        } else {
            b.setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        }
        return b.build();
    }

    // ---- The refresh alarm ----

    private static PendingIntent tickIntent(Context context) {
        Intent tick = new Intent(context, MomentumShade.class).setAction(TICK_ACTION);
        return PendingIntent.getBroadcast(context, 3, tick,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /**
     * Every 15 minutes, except that it also wakes at the hour mark of a fresh slip: the header's
     * chronometer would otherwise carry on counting seconds past an hour under a headline that
     * still said "Fresh start".
     */
    static long nextTickAt(JSONObject s, long now) {
        long next = now + TICK_MS;
        long last = lastSlip(s);
        if (last > 0 && now >= last && now - last < HOUR) next = Math.min(next, last + HOUR + 1000);
        // Wake when a red zone ends, so "I held it" appears when it should, and again when the question stops being worth asking.
        JSONArray ends = s.optJSONArray("zoneEnds");
        if (ends != null) {
            for (int i = 0; i < ends.length(); i++) {
                JSONObject e = ends.optJSONObject(i);
                if (e == null) continue;
                long endAt = e.optLong("endAt", 0L);
                if (endAt + 1000 > now) next = Math.min(next, endAt + 1000);
                else if (endAt + HELD_WINDOW_MS + 1000 > now) next = Math.min(next, endAt + HELD_WINDOW_MS + 1000);
            }
        }
        return next;
    }

    private static void scheduleTick(Context context, long at) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        // RTC rather than a waking alarm, and inexact: a counter that is a few minutes late costs
        // nothing, and one that wakes the phone to be on time costs battery.
        alarms.set(AlarmManager.RTC, at, tickIntent(context));
    }

    private static void cancelTick(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(tickIntent(context));
    }
}
