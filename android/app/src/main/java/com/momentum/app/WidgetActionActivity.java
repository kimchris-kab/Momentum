package com.momentum.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/**
 * What a tap on one of the widget's task rows lands on. A list can only hand its rows one template, and an activity is the one kind
 * that can both record a tick and open the app, so this is the template and the row says which it wants: {@code op} is "tick" (flip the
 * task in the widget, keep the tick for the app, and go away without ever showing a window) or "open" (bring the app forward).
 *
 * A tick that cannot be taken, because the snapshot is from yesterday or the task has gone from it, opens the app instead, which is
 * what brings a stale widget up to date.
 */
public class WidgetActionActivity extends Activity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();
        String op = in == null ? null : in.getStringExtra("op");
        boolean handled = false;
        if ("tick".equals(op)) {
            handled = MomentumWidget.applyTick(this, in.getStringExtra("taskId"), System.currentTimeMillis());
        }
        if (!handled) {
            Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (launch != null) startActivity(launch);
        }
        // Before the activity has been shown: a window-less activity that has not finished by then is an error.
        finish();
    }
}
