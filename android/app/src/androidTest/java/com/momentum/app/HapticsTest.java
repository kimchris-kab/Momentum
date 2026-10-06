package com.momentum.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.pm.PackageManager;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * The breathing pacer's vibration, on a real Android. What can be checked without a hand on the
 * phone: that the waveform checks reject what they should, that the vibrator is found through the
 * right service for this API level, and that starting and stopping never throw on a device with or
 * without a motor. Whether it FEELS like breathing can only be judged by holding the phone.
 */
@RunWith(AndroidJUnit4.class)
public class HapticsTest {

    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    private static long[] t(long... v) { return v; }
    private static int[] a(int... v) { return v; }

    @Test
    public void aGoodWaveformPasses() {
        MomentumHapticsPlugin.Waveform w = MomentumHapticsPlugin.parse(t(0, 28, 120, 28, 200), a(0, 80, 0, 160, 0));
        assertNotNull(w);
        assertEquals(5, w.timings.length);
    }

    @Test
    public void nonsenseIsRefusedBeforeItReachesTheMotor() {
        assertNull("nothing at all", MomentumHapticsPlugin.parse(null, null));
        assertNull("empty", MomentumHapticsPlugin.parse(t(), a()));
        assertNull("mismatched lengths", MomentumHapticsPlugin.parse(t(0, 28), a(0)));
        assertNull("a negative duration", MomentumHapticsPlugin.parse(t(0, -5), a(0, 100)));
        assertNull("a strength above 255", MomentumHapticsPlugin.parse(t(0, 28), a(0, 256)));
        assertNull("a negative strength", MomentumHapticsPlugin.parse(t(0, 28), a(0, -1)));
        assertNull("all silence", MomentumHapticsPlugin.parse(t(0, 500), a(0, 0)));
        assertNull("no time at all", MomentumHapticsPlugin.parse(t(0, 0), a(0, 100)));
        assertNull("longer than a minute", MomentumHapticsPlugin.parse(t(0, 61_000), a(0, 100)));
        long[] many = new long[MomentumHapticsPlugin.MAX_STEPS + 1];
        int[] amps = new int[many.length];
        for (int i = 0; i < many.length; i++) { many[i] = 1; amps[i] = i % 2 == 0 ? 0 : 100; }
        assertNull("far too many steps", MomentumHapticsPlugin.parse(many, amps));
    }

    @Test
    public void aBreathOfTheRealSizeIsAccepted() {
        // The slow breath is about 130 steps over ten seconds.
        long[] timings = new long[133];
        int[] amps = new int[133];
        long total = 0;
        for (int i = 0; i < timings.length; i++) {
            timings[i] = i % 2 == 0 ? 52 : 28;
            amps[i] = i % 2 == 0 ? 0 : 40 + i;
            total += timings[i];
        }
        assertNotNull(MomentumHapticsPlugin.parse(timings, amps));
        assertTrue(total < MomentumHapticsPlugin.MAX_TOTAL_MS);
    }

    @Test
    public void theVibratorIsFoundOnThisApiLevel() {
        assertNotNull("a Vibrator object comes back even on a phone with no motor", MomentumHapticsPlugin.vibrator(context));
    }

    @Test
    public void whatThePluginSaysAboutTheMotorIsWhatTheSystemSays() {
        boolean motor = MomentumHapticsPlugin.hasMotor(context);
        assertEquals(motor, MomentumHapticsPlugin.vibrator(context).hasVibrator());
        if (!motor) assertFalse("no motor, no variable strength", MomentumHapticsPlugin.canVaryStrength(context));
    }

    @Test
    public void startingAndStoppingNeverThrow() {
        MomentumHapticsPlugin.Waveform w = MomentumHapticsPlugin.parse(t(0, 28, 120, 28, 200), a(0, 80, 0, 160, 0));
        boolean played = MomentumHapticsPlugin.start(context, w);
        assertEquals("it plays exactly when there is a motor to play it on", MomentumHapticsPlugin.hasMotor(context), played);
        MomentumHapticsPlugin.stop(context);
        MomentumHapticsPlugin.stop(context); // twice is fine
    }

    @Test
    public void theVibratePermissionIsDeclared() throws Exception {
        PackageManager pm = context.getPackageManager();
        String[] declared = pm.getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
        boolean has = false;
        for (String p : declared) if ("android.permission.VIBRATE".equals(p)) has = true;
        assertTrue("without it every call to the motor throws a SecurityException", has);
    }
}
