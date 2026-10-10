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
 * Two cells wide and one tall: the time since the last slip, large, with the habit's name and where the day stands. A glance at the
 * number worth protecting, for a home screen with no room for the full widget. Tapping it opens the app.
 */
public class MomentumCleanWidget extends AppWidgetProvider {

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
        for (int id : manager.getAppWidgetIds(new ComponentName(context, MomentumCleanWidget.class))) {
            manager.updateAppWidget(id, buildViews(context, System.currentTimeMillis()));
        }
    }

    static RemoteViews buildViews(Context context, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.momentum_clean_widget);
        JSONObject q = MomentumWidget.firstQuit(context);
        if (q == null) {
            views.setTextViewText(R.id.clean_widget_time, "—");
            views.setTextColor(R.id.clean_widget_time, 0xFF6B6683);
            views.setTextViewText(R.id.clean_widget_name, context.getString(R.string.widget_clean_none));
            views.setViewVisibility(R.id.clean_widget_detail, View.GONE);
        } else {
            long last = q.optLong("lastSlipAt", 0L);
            boolean slipped = "slipped".equals(q.optString("state", ""));
            views.setTextViewText(R.id.clean_widget_time, last > 0 && now >= last ? MomentumWidget.since(now - last) : "—");
            views.setTextColor(R.id.clean_widget_time, slipped ? 0xFFE5736B : 0xFF5FC7C0);
            views.setTextViewText(R.id.clean_widget_name, q.optString("text", ""));
            views.setTextViewText(R.id.clean_widget_detail, MomentumWidget.quitDetail(context, q, now));
            views.setViewVisibility(R.id.clean_widget_detail, View.VISIBLE);
        }
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            views.setOnClickPendingIntent(R.id.clean_widget_root, PendingIntent.getActivity(
                    context, 410, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        }
        return views;
    }
}
