package com.momentum.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The bridge the web app calls after writing the shade snapshot, so the notification updates
 * the moment a habit is pinned or a slip is logged rather than at its next refresh.
 * src/lib/shade.js calls it through optional chaining, so a build without it still works.
 */
@CapacitorPlugin(name = "MomentumShade")
public class MomentumShadePlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        MomentumShade.refresh(getContext());
        call.resolve();
    }
}
