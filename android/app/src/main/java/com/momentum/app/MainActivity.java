package com.momentum.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * Where the Urge button's habit id is left for the web app. Must match PENDING_URGE_KEY in
     * src/lib/widget.js exactly — tests/android.test.mjs checks the two are the same string.
     */
    static final String PENDING_URGE_KEY = "momentum:pendingUrge";
    /**
     * Where the habit id from the shade notification's I-slipped button is left. Must match
     * PENDING_LAPSE_KEY in src/lib/shade.js.
     */
    static final String PENDING_LAPSE_KEY = "momentum:pendingLapse";
    /** Capacitor Preferences' file, which is what the web app reads through. */
    private static final String PREFS = "CapacitorStorage";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in the app itself have to be registered before the bridge is
        // built, which is why this sits above the super call.
        registerPlugin(MomentumWidgetPlugin.class);
        registerPlugin(MomentumFilesPlugin.class);
        registerPlugin(MomentumShadePlugin.class);
        registerPlugin(MomentumHapticsPlugin.class);
        registerPlugin(MomentumPepPlugin.class);
        super.onCreate(savedInstanceState);
        // A cold start from the widget: the web app isn't loaded yet, so there's nobody to tell.
        // It finds the id itself when it starts.
        stashUrge(getIntent());
    }

    /**
     * The app was already running — singleTask sends a second launch here, not to onCreate,
     * which is the path that's easy to miss. The web app is loaded, so it gets a nudge too.
     */
    // Public rather than protected: widening an override is always legal, while matching the
    // wrong visibility in a superclass nobody here can compile against would not be.
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (stashUrge(intent)) {
            Bridge bridge = getBridge();
            if (bridge != null) bridge.triggerWindowJSEvent("momentumWidget");
        }
    }

    private boolean stashUrge(Intent intent) {
        return stash(this, intent);
    }

    /**
     * Leaves the habit id where the web app looks for it: under one key for an Urge (from the
     * widget or the shade), under another for an I-slipped (from the shade). True if the intent
     * carried one. Static, so a test can hand it intents without starting the whole activity.
     */
    static boolean stash(Context context, Intent intent) {
        if (intent == null) return false;
        Uri data = intent.getData();
        if (data == null || !MomentumWidget.URGE_SCHEME.equals(data.getScheme())) return false;
        String key;
        if (MomentumWidget.URGE_HOST.equals(data.getHost())) key = PENDING_URGE_KEY;
        else if (MomentumShade.SLIP_HOST.equals(data.getHost())) key = PENDING_LAPSE_KEY;
        else return false;
        String id = data.getLastPathSegment();
        if (id == null || id.isEmpty()) return false;
        context.getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(key, id).apply();
        // Consumed: a rotation or a return from the recents screen re-delivers the same intent,
        // and it shouldn't open the urge screen a second time.
        intent.setData(null);
        return true;
    }
}
