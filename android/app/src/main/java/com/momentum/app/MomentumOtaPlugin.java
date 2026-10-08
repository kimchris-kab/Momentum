package com.momentum.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The web app's handle on over-the-air updates (src/lib/ota.js): what the app is running, download a newer build,
 * say that this one came up, and switch to a downloaded build now rather than at the next start.
 */
@CapacitorPlugin(name = "MomentumOta")
public class MomentumOtaPlugin extends Plugin {

    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void info(PluginCall call) {
        JSONObject o = MomentumOta.info(getContext(), MomentumOta.bundledBuild(getContext()));
        try {
            call.resolve(JSObject.fromJSONObject(o));
        } catch (Exception e) {
            call.reject("couldn't read the update state");
        }
    }

    /** { manifest: {...}, baseUrl: "https://…/ota/<id>/" } → { installed, id }. Rejects with a code the app can act on. */
    @PluginMethod
    public void install(PluginCall call) {
        JSObject manifest = call.getObject("manifest");
        String baseUrl = call.getString("baseUrl");
        if (manifest == null || baseUrl == null) {
            call.reject("a manifest and a baseUrl are needed", "invalid");
            return;
        }
        worker.execute(() -> {
            try {
                MomentumOta.Manifest m = MomentumOta.parse(manifest.toString());
                String id = MomentumOta.install(getContext(), m, baseUrl, new MomentumOta.HttpsDownloader(),
                        MomentumOta.publicKey(getContext()), MomentumOta.bundledBuild(getContext()));
                JSObject out = new JSObject();
                out.put("installed", true);
                out.put("id", id);
                call.resolve(out);
            } catch (MomentumOta.OtaException e) {
                call.reject(e.getMessage(), e.code);
            } catch (Exception e) {
                call.reject("The update failed: " + e.getMessage(), "download");
            }
        });
    }

    @PluginMethod
    public void confirm(PluginCall call) {
        MomentumOta.confirm(getContext());
        call.resolve();
    }

    /** Switches to the downloaded build now. The web view reloads from the new folder, on the same origin. */
    @PluginMethod
    public void apply(PluginCall call) {
        String path = MomentumOta.resolveAtStartup(getContext(), MomentumOta.bundledBuild(getContext()));
        JSObject out = new JSObject();
        out.put("applied", path != null);
        call.resolve(out);
        if (path != null && getBridge() != null) getBridge().setServerBasePath(path);
    }
}
