package com.momentum.app;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/**
 * Plays the breathing pacer's vibration: a waveform the web app works out (src/lib/pacer.js) of
 * durations and strengths, so a breath can be followed with the eyes closed.
 *
 * Kept to the one job. The browser's own vibrate() can only switch the motor on and off; this can
 * vary the strength of each pulse, which is what makes a breath feel like it is filling and
 * emptying. The web app falls back to vibrate() where this is missing, so a build without it still
 * buzzes, just flatter.
 */
@CapacitorPlugin(name = "MomentumHaptics")
public class MomentumHapticsPlugin extends Plugin {

    /** One breath is a few hundred entries at most; this stops a bad call from handing the motor hours of work. */
    static final int MAX_STEPS = 2000;
    static final long MAX_TOTAL_MS = 60_000L;

    /** A checked waveform: alternating off and on durations in ms, starting with off, and a strength for each. */
    static final class Waveform {
        final long[] timings;
        final int[] amplitudes;

        Waveform(long[] timings, int[] amplitudes) {
            this.timings = timings;
            this.amplitudes = amplitudes;
        }
    }

    /** Null unless the two arrays describe something the motor can safely play. */
    static Waveform parse(long[] timings, int[] amplitudes) {
        if (timings == null || amplitudes == null) return null;
        if (timings.length == 0 || timings.length != amplitudes.length || timings.length > MAX_STEPS) return null;
        long total = 0;
        boolean anyOn = false;
        for (int i = 0; i < timings.length; i++) {
            if (timings[i] < 0) return null;
            if (amplitudes[i] < 0 || amplitudes[i] > 255) return null;
            total += timings[i];
            if (amplitudes[i] > 0 && timings[i] > 0) anyOn = true;
        }
        if (total <= 0 || total > MAX_TOTAL_MS || !anyOn) return null;
        return new Waveform(timings, amplitudes);
    }

    static Vibrator vibrator(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return manager == null ? null : manager.getDefaultVibrator();
        }
        return (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    }

    /** True if the phone has a motor at all. Plenty of tablets and emulators don't. */
    static boolean hasMotor(Context context) {
        Vibrator v = vibrator(context);
        return v != null && v.hasVibrator();
    }

    /** True if each pulse's strength can be set, rather than just on or off. */
    static boolean canVaryStrength(Context context) {
        Vibrator v = vibrator(context);
        return v != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && v.hasAmplitudeControl();
    }

    /** Starts the waveform, replacing whatever is playing. False if there was nothing to play it on. */
    @SuppressWarnings("deprecation")
    static boolean start(Context context, Waveform w) {
        Vibrator v = vibrator(context);
        if (v == null || !v.hasVibrator()) return false;
        v.cancel();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            VibrationEffect effect = v.hasAmplitudeControl()
                    ? VibrationEffect.createWaveform(w.timings, w.amplitudes, -1)
                    : VibrationEffect.createWaveform(w.timings, -1);
            v.vibrate(effect);
        } else {
            v.vibrate(w.timings, -1);
        }
        return true;
    }

    static void stop(Context context) {
        Vibrator v = vibrator(context);
        if (v != null) v.cancel();
    }

    // ---- the bridge ----

    @PluginMethod
    public void play(PluginCall call) {
        JSArray t = call.getArray("timings");
        JSArray a = call.getArray("amplitudes");
        if (t == null || a == null) {
            call.reject("timings and amplitudes are both needed");
            return;
        }
        try {
            long[] timings = new long[t.length()];
            int[] amplitudes = new int[a.length()];
            for (int i = 0; i < timings.length; i++) timings[i] = t.getLong(i);
            for (int i = 0; i < amplitudes.length; i++) amplitudes[i] = a.getInt(i);
            Waveform w = parse(timings, amplitudes);
            if (w == null) {
                call.reject("that is not a waveform the motor can play");
                return;
            }
            JSObject out = new JSObject();
            out.put("played", start(getContext(), w));
            call.resolve(out);
        } catch (JSONException e) {
            call.reject("timings and amplitudes must be numbers");
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject out = new JSObject();
        out.put("motor", hasMotor(getContext()));
        out.put("amplitude", canVaryStrength(getContext()));
        call.resolve(out);
    }
}
