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

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

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

    private static final int COLOR_CALM = 0xFF5FC7C0;
    private static final int COLOR_WARN = 0xFFE8B75D;

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (TICK_ACTION.equals(action)
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

        b.addAction(0, context.getString(R.string.shade_action_urge), action(context, MomentumWidget.URGE_HOST, id, 200));
        b.addAction(0, context.getString(R.string.shade_action_slipped), action(context, SLIP_HOST, id, 201));

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
