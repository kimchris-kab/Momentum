package com.momentum.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugins that live in the app itself have to be registered before the bridge is
        // built, which is why this sits above the super call.
        registerPlugin(MomentumWidgetPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
