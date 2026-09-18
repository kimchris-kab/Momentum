package com.momentum.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
 * NOT VERIFIED: this was written without a working Android toolchain (the sandbox cannot
 * reach dl.google.com), so it has never been compiled, installed or run. Treat it as a
 * starting point to build locally, not as working code.
 */
public class MomentumWidget extends AppWidgetProvider {

    /** Capacitor Preferences writes to this file with no group configured. */
    private static final String PREFS = "CapacitorStorage";
    private static final String KEY = "momentum:widget";
    private static final int MAX_ROWS = 4;

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

    private static void render(Context context, AppWidgetManager manager, int widgetId) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.momentum_widget);

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, null);

        int done = 0;
        int total = 0;
        String streakText = "";

        // Hide every row first: RemoteViews has no list without a RemoteViewsService, and a
        // fixed set of rows keeps this a plain, cheap widget.
        int[] rowIds = { R.id.row_0, R.id.row_1, R.id.row_2, R.id.row_3 };
        for (int rowId : rowIds) views.setViewVisibility(rowId, android.view.View.GONE);

        if (raw != null) {
            try {
                JSONObject snapshot = new JSONObject(raw);
                done = snapshot.optInt("done", 0);
                total = snapshot.optInt("total", 0);
                int streak = snapshot.optInt("streak", 0);
                if (streak > 0) streakText = streak + " day streak";

                JSONArray items = snapshot.optJSONArray("items");
                if (items != null) {
                    for (int i = 0; i < Math.min(items.length(), MAX_ROWS); i++) {
                        JSONObject item = items.getJSONObject(i);
                        String text = item.optString("text", "");
                        boolean isDone = item.optBoolean("done", false);
                        views.setViewVisibility(rowIds[i], android.view.View.VISIBLE);
                        views.setTextViewText(rowIds[i], (isDone ? "✓  " : "○  ") + text);
                        views.setTextColor(rowIds[i], isDone ? 0xFF6B6683 : 0xFFF2EFFA);
                    }
                }
            } catch (Exception e) {
                // A malformed snapshot shows the empty state rather than crashing the
                // launcher's widget host.
                streakText = "";
            }
        }

        views.setTextViewText(R.id.widget_progress, total > 0 ? done + " / " + total : "—");
        views.setTextViewText(R.id.widget_subtitle,
                total == 0 ? "Nothing scheduled today" : streakText);

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
