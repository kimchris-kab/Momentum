package com.momentum.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Home-screen widget: today's progress, the habits being broken with a big clean-time counter
 * and an Urge button each, and every task for today in a list that scrolls.
 *
 * The web app writes a small JSON snapshot through Capacitor Preferences, which lands in the
 * SharedPreferences file below. The widget only ever reads that snapshot — it never parses
 * the app's full state, so a schema change in the app cannot break the home screen.
 *
 * NOT YET RUN ON A DEVICE. It was written without an Android toolchain, and is now compiled on
 * every push by .github/workflows/android.yml, and its layout and list are inflated on an
 * emulator by the widget instrumentation test — but nobody has yet put this widget on a real
 * home screen and tapped it. A review by hand before it was ever compiled found three faults
 * that would each have stopped it working — an unexported receiver, an unbound XML namespace,
 * a missing Preferences plugin — and a fourth (a bare View in the layout) that a compiler
 * would not have caught either.
 */
public class MomentumWidget extends AppWidgetProvider {

    /** Capacitor Preferences writes to this file with no group configured. */
    private static final String PREFS = "CapacitorStorage";
    private static final String KEY = "momentum:widget";
    private static final int MAX_QUITTING = 2;
    /** How many of your notes the widget turns through. */
    static final int MAX_PEP = 6;
    /** The scheme the Urge buttons open the app with. Read back in MainActivity. */
    static final String URGE_SCHEME = "momentum";
    static final String URGE_HOST = "urge";

    /**
     * Android won't update a widget more than every half hour on its own, which would leave a
     * counter reading "3h 20m" for most of that half hour. So while a widget is on a home screen,
     * it nudges itself along more often than that.
     */
    static final String TICK_ACTION = "com.momentum.app.WIDGET_TICK";
    static final long TICK_MS = 15 * 60_000L;

    private static final int COLOR_CLEAN = 0xFF5FC7C0;
    private static final int COLOR_SLIPPED = 0xFFE5736B;

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;

    /** One task in the list. */
    static final class Item {
        final String text;
        final boolean done;

        Item(String text, boolean done) {
            this.text = text;
            this.done = done;
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        scheduleTick(context);
    }

    @Override
    public void onEnabled(Context context) {
        scheduleTick(context);
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(tickIntent(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (intent != null && TICK_ACTION.equals(intent.getAction())) {
            refresh(context);
            scheduleTick(context);
        }
    }

    private static PendingIntent tickIntent(Context context) {
        Intent tick = new Intent(context, MomentumWidget.class).setAction(TICK_ACTION);
        return PendingIntent.getBroadcast(context, 1, tick,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** RTC rather than a waking alarm: it only matters while the screen could be looking at it. */
    private static void scheduleTick(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        alarms.set(AlarmManager.RTC, System.currentTimeMillis() + TICK_MS, tickIntent(context));
    }

    /** Called by the app after a snapshot write, so the widget updates on completion. */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, MomentumWidget.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) render(context, manager, id);
    }

    static String since(long ms) {
        if (ms < 0) return "";
        long d = ms / DAY;
        long h = (ms % DAY) / HOUR;
        long m = (ms % HOUR) / MINUTE;
        if (d > 0) return h > 0 ? d + "d " + h + "h" : d + "d";
        if (h > 0) return m > 0 ? h + "h " + m + "m" : h + "h";
        return m + "m";
    }

    private static JSONObject snapshot(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            // A malformed snapshot shows the empty state rather than crashing the launcher's
            // widget host.
            return null;
        }
    }

    /** Every task in the snapshot, in the order the app wrote them. */
    static List<Item> readItems(Context context) {
        List<Item> out = new ArrayList<>();
        JSONObject snapshot = snapshot(context);
        if (snapshot == null) return out;
        JSONArray items = snapshot.optJSONArray("items");
        if (items == null) return out;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            out.add(new Item(item.optString("text", ""), item.optBoolean("done", false)));
        }
        return out;
    }

    /** The line under a counter: where the day stands, and when the last urge was. */
    static String quitDetail(Context context, JSONObject q, long now) {
        boolean slipped = "slipped".equals(q.optString("state", ""));
        int limit = q.optInt("limit", 0);
        StringBuilder detail = new StringBuilder();
        if (limit > 0) detail.append(q.optInt("count", 0)).append(" of ").append(limit).append(" today · ");
        detail.append(context.getString(slipped ? R.string.widget_since_slipped_today
                : q.optBoolean("everSlipped", false) ? R.string.widget_since_slip : R.string.widget_since_start));
        long lastUrge = q.optLong("lastUrgeAt", 0L);
        detail.append(" · ");
        if (lastUrge > 0 && now >= lastUrge) {
            detail.append("last urge ").append(since(now - lastUrge)).append(" ago");
        } else {
            detail.append(context.getString(R.string.widget_no_urges));
        }
        return detail.toString();
    }

    static String clockOf(int minuteOfDay) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, minuteOfDay / 60);
        c.set(Calendar.MINUTE, minuteOfDay % 60);
        c.set(Calendar.SECOND, 0);
        return DateFormat.getTimeInstance(DateFormat.SHORT).format(c.getTime());
    }

    /** Returned by {@link #riskUntil} when the app hasn't learned a window for this habit. */
    static final int RISK_UNKNOWN = -2;
    /** Returned by {@link #riskUntil} while the window is open. */
    static final int RISK_NOW = -1;

    /**
     * Where now falls against the usual window: {@link #RISK_UNKNOWN}, {@link #RISK_NOW}, or the
     * minutes until it opens. The app sends the window as a time of day and this works the rest out
     * each time something draws, so it stays right for days without the app writing anything.
     */
    static int riskUntil(JSONObject q, long now) {
        JSONObject r = q.optJSONObject("risk");
        if (r == null) return RISK_UNKNOWN;
        int start = r.optInt("startMin", -1);
        int end = r.optInt("endMin", -1);
        if (start < 0 || end < 0 || start > 1439 || end > 1439) return RISK_UNKNOWN;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        int current = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        // A window can cross midnight (11pm to 1:30am), in which case it ends at an earlier minute than it starts.
        boolean wraps = end <= start;
        boolean inside = wraps ? (current >= start || current < end) : (current >= start && current < end);
        if (inside) return RISK_NOW;
        return (start - current + 1440) % 1440;
    }

    /**
     * When the habit usually pulls at you: "Risk window opens in 25 min · 8:00 PM". Empty until the
     * app has learned one.
     */
    static String riskLine(JSONObject q, long now) {
        int until = riskUntil(q, now);
        if (until == RISK_UNKNOWN) return "";
        JSONObject r = q.optJSONObject("risk");
        int start = r.optInt("startMin", 0);
        int end = r.optInt("endMin", 0);
        if (until == RISK_NOW) return "In your risk window \u00B7 until " + clockOf(end);
        if (until <= 90) return "Risk window opens in " + until + " min \u00B7 " + clockOf(start);
        return "Risk window " + clockOf(start) + "\u2013" + clockOf(end);
    }

    /**
     * Builds what the widget shows. Separate from putting it on the screen so the instrumentation
     * test can inflate exactly this on an emulator and look at it.
     */
    static RemoteViews buildViews(Context context, int widgetId, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.momentum_widget);
        JSONObject snapshot = snapshot(context);

        int done = 0;
        int total = 0;
        int quitCount = 0;
        String streakText = "";

        int[] quitRows = { R.id.quit_0, R.id.quit_1 };
        int[] quitTimes = { R.id.quit_0_time, R.id.quit_1_time };
        int[] quitNames = { R.id.quit_0_name, R.id.quit_1_name };
        int[] quitDetails = { R.id.quit_0_detail, R.id.quit_1_detail };
        int[] quitRisks = { R.id.quit_0_risk, R.id.quit_1_risk };
        int[] quitButtons = { R.id.quit_0_urge, R.id.quit_1_urge };
        for (int rowId : quitRows) views.setViewVisibility(rowId, View.GONE);
        views.setViewVisibility(R.id.quit_divider, View.GONE);

        if (snapshot != null) {
            try {
                done = snapshot.optInt("done", 0);
                total = snapshot.optInt("total", 0);
                int streak = snapshot.optInt("streak", 0);
                if (streak > 0) streakText = streak + " day streak";

                JSONArray quitting = snapshot.optJSONArray("quitting");
                int shown = quitting == null ? 0 : Math.min(quitting.length(), MAX_QUITTING);
                for (int i = 0; i < shown; i++) {
                    JSONObject q = quitting.getJSONObject(i);
                    String id = q.optString("id", "");
                    if (id.isEmpty()) continue;
                    quitCount++;

                    long last = q.optLong("lastSlipAt", 0L);
                    boolean slipped = "slipped".equals(q.optString("state", ""));
                    views.setTextViewText(quitTimes[i], last > 0 && now >= last ? since(now - last) : "—");
                    // A slip today turns the number from calm to red — the clock is still honest,
                    // it's just no longer the good news it was an hour ago.
                    views.setTextColor(quitTimes[i], slipped ? COLOR_SLIPPED : COLOR_CLEAN);
                    views.setTextViewText(quitNames[i], q.optString("text", ""));
                    views.setTextViewText(quitDetails[i], quitDetail(context, q, now));
                    String risk = riskLine(q, now);
                    views.setTextViewText(quitRisks[i], risk);
                    views.setViewVisibility(quitRisks[i], risk.isEmpty() ? View.GONE : View.VISIBLE);
                    views.setViewVisibility(quitRows[i], View.VISIBLE);

                    // Each button needs its own PendingIntent. Android decides two are "the same"
                    // by action, data and class — extras don't count — so without a distinct URI
                    // every row's Urge would open whichever habit was set last.
                    Intent urge = new Intent(context, MainActivity.class)
                            .setAction(Intent.ACTION_VIEW)
                            .setData(new Uri.Builder().scheme(URGE_SCHEME).authority(URGE_HOST)
                                    .appendPath(id).build())
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    PendingIntent pending = PendingIntent.getActivity(
                            context, 100 + i, urge,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(quitButtons[i], pending);
                }
                if (quitCount > 0) views.setViewVisibility(R.id.quit_divider, View.VISIBLE);
            } catch (Exception e) {
                streakText = "";
            }
        }

        // Your own words, turning through one at a time. The app sends them; the flipper does the turning.
        views.removeAllViews(R.id.pep_flipper);
        int pepShown = 0;
        JSONArray pep = snapshot == null ? null : snapshot.optJSONArray("pep");
        for (int i = 0; pep != null && i < Math.min(pep.length(), MAX_PEP); i++) {
            String line = pep.optString(i, "").trim();
            if (line.isEmpty()) continue;
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_pep_line);
            row.setTextViewText(R.id.pep_text, "\u201C" + line + "\u201D");
            views.addView(R.id.pep_flipper, row);
            pepShown++;
        }
        views.setViewVisibility(R.id.pep_flipper, pepShown > 0 ? View.VISIBLE : View.GONE);

        views.setTextViewText(R.id.widget_progress,
                total > 0 ? done + " / " + total : context.getString(R.string.widget_placeholder));
        views.setTextViewText(R.id.widget_subtitle, streakText);

        // The task list. The adapter intent has to be unique per widget, or two widgets on one
        // screen would be handed each other's list.
        Intent list = new Intent(context, MomentumWidgetService.class);
        list.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        list.setData(Uri.parse(list.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, list);
        views.setEmptyView(R.id.widget_list, R.id.widget_list_empty);

        // Tapping a task opens the app. List rows can't take a plain click handler; they take a
        // template that each row fills in. The template must be mutable for that on Android 12+.
        Intent open = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_MAIN)
                .addCategory(Intent.CATEGORY_LAUNCHER)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        views.setPendingIntentTemplate(R.id.widget_list, PendingIntent.getActivity(
                context, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | mutable));

        // Tapping anywhere else on the widget opens the app too.
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            PendingIntent pending = PendingIntent.getActivity(
                    context, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
        }
        return views;
    }

    private static void render(Context context, AppWidgetManager manager, int widgetId) {
        manager.updateAppWidget(widgetId, buildViews(context, widgetId, System.currentTimeMillis()));
        // The list reads its data through the service, which only re-reads when told to.
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list);
    }
}
