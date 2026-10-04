package com.momentum.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.ArrayList;
import java.util.List;

/**
 * Feeds the widget's task list. RemoteViews can't hold a list by itself — it needs a service to
 * ask for each row — which is why the first version of the widget had four fixed rows and
 * nothing past them.
 *
 * Reads the same snapshot the rest of the widget does, through MomentumWidget.readItems, so
 * there's one place that knows its shape.
 *
 * NOT YET RUN ON A DEVICE: inflated on an emulator by the widget instrumentation test, but
 * nobody has yet scrolled it on a phone.
 */
public class MomentumWidgetService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static final class Factory implements RemoteViewsFactory {
        private static final int COLOR_TEXT = 0xFFF2EFFA;
        private static final int COLOR_DONE = 0xFF6B6683;

        private final Context context;
        private List<MomentumWidget.Item> items = new ArrayList<>();

        Factory(Context context) {
            this.context = context;
        }

        @Override
        public void onCreate() {
            items = MomentumWidget.readItems(context);
        }

        /** Called when the widget asks for fresh data after the app wrote a new snapshot. */
        @Override
        public void onDataSetChanged() {
            items = MomentumWidget.readItems(context);
        }

        @Override
        public void onDestroy() {
            items = new ArrayList<>();
        }

        @Override
        public int getCount() {
            return items.size();
        }

        @Override
        public RemoteViews getViewAt(int position) {
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_task_row);
            if (position < 0 || position >= items.size()) return row;
            MomentumWidget.Item item = items.get(position);
            row.setTextViewText(R.id.task_text, (item.done ? "✓  " : "○  ") + item.text);
            row.setTextColor(R.id.task_text, item.done ? COLOR_DONE : COLOR_TEXT);
            // Fills in the template the widget set: a tap on any row opens the app.
            row.setOnClickFillInIntent(R.id.task_text, new Intent());
            return row;
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }
    }
}
