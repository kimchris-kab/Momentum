package com.momentum.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * The smallest widget, one cell: the first habit being quit, how long it has been, and an Urge button that is the whole widget.
 * Built for the moment the urge arrives, when anything more than one tap is too much.
 *
 * Reads the same snapshot as the big widget and is redrawn by the same refresh, so it needs nothing of its own from the app.
 */
public class MomentumUrgeWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, buildViews(context, System.currentTimeMillis()));
        MomentumWidget.scheduleTick(context);
    }

    @Override
    public void onEnabled(Context context) {
        MomentumWidget.scheduleTick(context);
    }

    @Override
    public void onDisabled(Context context) {
        MomentumWidget.cancelTickIfNone(context);
    }

    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (int id : manager.getAppWidgetIds(new ComponentName(context, MomentumUrgeWidget.class))) {
            manager.updateAppWidget(id, buildViews(context, System.currentTimeMillis()));
        }
    }

    static RemoteViews buildViews(Context context, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.momentum_urge_widget);
        JSONObject q = MomentumWidget.firstQuit(context);
        if (q == null) {
            // Nothing being quit: the widget still opens the app, and says so rather than offering a button that goes nowhere.
            views.setTextViewText(R.id.urge_widget_time, "");
            views.setViewVisibility(R.id.urge_widget_time, View.GONE);
            views.setTextViewText(R.id.urge_widget_label, context.getString(R.string.widget_urge_none));
            Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
            if (launch != null) {
                views.setOnClickPendingIntent(R.id.urge_widget_root, PendingIntent.getActivity(
                        context, 400, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            }
            return views;
        }
        long last = q.optLong("lastSlipAt", 0L);
        boolean slipped = "slipped".equals(q.optString("state", ""));
        views.setViewVisibility(R.id.urge_widget_time, View.VISIBLE);
        views.setTextViewText(R.id.urge_widget_time, last > 0 && now >= last ? MomentumWidget.since(now - last) : "—");
        views.setTextColor(R.id.urge_widget_time, slipped ? 0xFFE5736B : 0xFF5FC7C0);
        views.setTextViewText(R.id.urge_widget_label, context.getString(R.string.widget_urge));
        views.setOnClickPendingIntent(R.id.urge_widget_root, MomentumWidget.urgeIntent(context, q.optString("id"), 401));
        return views;
    }
}
