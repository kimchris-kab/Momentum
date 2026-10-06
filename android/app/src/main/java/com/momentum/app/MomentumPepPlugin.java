package com.momentum.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Called by the web app after it writes a fresh plan of notes, so the alarms are reset the moment
 * something changes. src/lib/pep.js calls it through optional chaining, so a build without it
 * still works: the plan is simply picked up the next time the phone restarts.
 */
@CapacitorPlugin(name = "MomentumPep")
public class MomentumPepPlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        MomentumPep.refresh(getContext());
        call.resolve();
    }
}
