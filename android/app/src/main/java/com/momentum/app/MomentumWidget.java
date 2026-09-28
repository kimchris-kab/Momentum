package com.momentum.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Home-screen widget: today's habits and how many are done.
 *
 * The web app writes a small JSON snapshot through Capacitor Preferences, which lands in the
 * SharedPreferences file below. The widget only ever reads that snapshot — it never parses
 * the app's full state, so a schema change in the app cannot break the home screen.
 *
 * NOT YET RUN ON A DEVICE. It was written without an Android toolchain, and is now compiled
 * on every push by .github/workflows/android.yml — cleanly, first time — but compiling is not
 * running: nobody has yet put this widget on a home screen and tapped it. A review by hand
 * before it was ever compiled found three faults that would each have stopped it working —
 * an unexported receiver, an unbound XML namespace, a missing Preferences plugin — and a
 * fourth (a bare View in the layout) that a compiler would not have caught either.
 */
public class MomentumWidget extends AppWidgetProvider {

    /** Capacitor Preferences writes to this file with no group configured. */
    private static final String PREFS = "CapacitorStorage";
    private static final String KEY = "momentum:widget";
    private static final int MAX_ROWS = 4;
    /** With habits being broken on the widget too, the agenda gives up two rows to fit a 3×2. */
    private static final int ROWS_WITH_QUITTING = 2;
    private static final int MAX_QUITTING = 2;
    /** The scheme the Urge buttons open the app with. Read back in MainActivity. */
    static final String URGE_SCHEME = "momentum";
    static final String URGE_HOST = "urge";

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
    }

    /** Called by the app after a snapshot write, so the widget updates on completion. */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, MomentumWidget.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) render(context, manager, id);
    }

    /**
     * "Doomscrolling  ·  4d 6h". The gap is worked out here, at draw time, from the timestamp the
     * app sent — so it moves on with the widget's own refresh rather than sitting at whatever it
     * was when the app last wrote. Same format as fmtSince in src/lib/urges.js.
     */
    static String quitLine(Context context, JSONObject q, long now) {
        String text = q.optString("text", "");
        int limit = q.optInt("limit", 0);
        String detail;
        if (limit > 0) {
            detail = q.optInt("count", 0) + " of " + limit + " today";
        } else if ("slipped".equals(q.optString("state", ""))) {
            detail = context.getString(R.string.widget_slipped_today);
        } else {
            long last = q.optLong("lastSlipAt", 0L);
            detail = last > 0 ? since(now - last) : "";
        }
        return detail.isEmpty() ? text : text + "  \u00B7  " + detail;
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

    private static void render(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.momentum_widget);

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, null);

        int done = 0;
        int total = 0;
        int quitCount = 0;
        String streakText = "";

        // Hide every row first: RemoteViews has no list without a RemoteViewsService, and a
        // fixed set of rows keeps this a plain, cheap widget.
        int[] rowIds = { R.id.row_0, R.id.row_1, R.id.row_2, R.id.row_3 };
        for (int rowId : rowIds) views.setViewVisibility(rowId, android.view.View.GONE);
        int[] quitRows = { R.id.quit_0, R.id.quit_1 };
        int[] quitTexts = { R.id.quit_0_text, R.id.quit_1_text };
        int[] quitButtons = { R.id.quit_0_urge, R.id.quit_1_urge };
        for (int rowId : quitRows) views.setViewVisibility(rowId, android.view.View.GONE);
        views.setViewVisibility(R.id.quit_divider, android.view.View.GONE);

        if (raw != null) {
            try {
                JSONObject snapshot = new JSONObject(raw);
                done = snapshot.optInt("done", 0);
                total = snapshot.optInt("total", 0);
                int streak = snapshot.optInt("streak", 0);
                if (streak > 0) streakText = streak + " day streak";

                JSONArray quitting = snapshot.optJSONArray("quitting");
                quitCount = quitting == null ? 0 : Math.min(quitting.length(), MAX_QUITTING);
                int agendaRows = quitCount > 0 ? ROWS_WITH_QUITTING : MAX_ROWS;

                JSONArray items = snapshot.optJSONArray("items");
                if (items != null) {
                    for (int i = 0; i < Math.min(items.length(), agendaRows); i++) {
                        JSONObject item = items.getJSONObject(i);
                        String text = item.optString("text", "");
                        boolean isDone = item.optBoolean("done", false);
                        views.setViewVisibility(rowIds[i], android.view.View.VISIBLE);
                        views.setTextViewText(rowIds[i], (isDone ? "✓  " : "○  ") + text);
                        views.setTextColor(rowIds[i], isDone ? 0xFF6B6683 : 0xFFF2EFFA);
                    }
                }

                if (quitCount > 0) views.setViewVisibility(R.id.quit_divider, android.view.View.VISIBLE);
                for (int i = 0; i < quitCount; i++) {
                    JSONObject q = quitting.getJSONObject(i);
                    String id = q.optString("id", "");
                    if (id.isEmpty()) continue;
                    views.setTextViewText(quitTexts[i], quitLine(context, q, System.currentTimeMillis()));
                    views.setViewVisibility(quitRows[i], android.view.View.VISIBLE);

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
            } catch (Exception e) {
                // A malformed snapshot shows the empty state rather than crashing the
                // launcher's widget host.
                streakText = "";
            }
        }

        views.setTextViewText(R.id.widget_progress,
                total > 0 ? done + " / " + total : context.getString(R.string.widget_placeholder));
        // "Nothing scheduled" would be false with habits being broken listed right below it.
        views.setTextViewText(R.id.widget_subtitle,
                total == 0 && quitCount == 0 ? context.getString(R.string.widget_empty) : streakText);

        // Tapping anywhere opens the app.
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            PendingIntent pending = PendingIntent.getActivity(
                    context, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
        }

        manager.updateAppWidget(widgetId, views);
    }
}
