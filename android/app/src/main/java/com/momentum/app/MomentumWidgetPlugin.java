package com.momentum.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The bridge the web app calls after writing a snapshot, so the widget redraws the moment
 * something is ticked rather than waiting for its half-hour cycle.
 *
 * The app treats this as optional — src/lib/widget.js calls it through optional chaining —
 * so a build without it still works, just less promptly.
 *
 * NOT YET RUN ON A DEVICE: compiled on every push by .github/workflows/android.yml, but
 * nobody has yet watched it redraw a widget on a phone.
 */
@CapacitorPlugin(name = "MomentumWidget")
public class MomentumWidgetPlugin extends Plugin {

    @PluginMethod
    public void refresh(PluginCall call) {
        MomentumWidget.refresh(getContext());
        call.resolve();
    }
}
