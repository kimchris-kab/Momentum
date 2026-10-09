package com.momentum.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;

import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Assume;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Calendar;

/**
 * Posts the real counter through the real notification manager and reads it back.
 *
 * Everything the design promised is checked on what Android actually holds, not on what the code
 * meant to hand it: that it is ongoing, that it sits on a silent channel, that the lock screen
 * version says nothing about the habit, that the warning turns it gold, and that its two buttons
 * are there. The same goes for the deep link behind the I-slipped button.
 */
@RunWith(AndroidJUnit4.class)
public class ShadeTest {

    private static final String PREFS = "CapacitorStorage";
    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;

    private Context context;
    private NotificationManager nm;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 33) {
            // Android 13 and up shows nothing until the person allows it; the test is the person.
            InstrumentationRegistry.getInstrumentation().getUiAutomation()
                    .grantRuntimePermission(context.getPackageName(), "android.permission.POST_NOTIFICATIONS");
        }
        assertTrue("notifications are allowed for the test", nm.areNotificationsEnabled());
        nm.cancel(MomentumShade.NOTIFICATION_ID);
        awaitGone();
    }

    /**
     * Cancelling is queued inside the system, and a read straight afterwards can still see the last test's
     * notification. A test that then reads "the counter" would be reading the wrong one, so wait until it is gone.
     */
    private void awaitGone() throws Exception {
        long end = SystemClock.uptimeMillis() + 3000;
        while (SystemClock.uptimeMillis() < end) {
            boolean there = false;
            for (StatusBarNotification n : nm.getActiveNotifications()) if (n.getId() == MomentumShade.NOTIFICATION_ID) there = true;
            if (!there) return;
            Thread.sleep(50);
        }
    }

    @After
    public void tearDown() {
        nm.cancel(MomentumShade.NOTIFICATION_ID);
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove(MomentumShade.KEY).remove(MainActivity.PENDING_LAPSE_KEY).remove(MainActivity.PENDING_URGE_KEY).commit();
    }

    // ---- helpers -------------------------------------------------------------------------

    /** A snapshot like the app writes, with whatever the case needs changed. */
    private JSONObject snap(long now) throws Exception {
        return new JSONObject()
                .put("show", true).put("id", "habit-1").put("name", "Doomscrolling")
                .put("hideOnLock", true)
                .put("lastSlipAt", now - (4 * DAY + 6 * HOUR + 10 * MINUTE))
                .put("everSlipped", true)
                .put("lastUrgeAt", now - 2 * DAY - HOUR)
                .put("bestPastMs", 11 * DAY);
    }

    private void write(JSONObject s) {
        assertTrue(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(MomentumShade.KEY, s.toString()).commit());
    }

    /** Posts it and finds what the notification manager now holds. */
    private Notification posted() throws Exception {
        // The system posts through a queue, so what is in the shade right after a refresh can still be the notification from a
        // moment ago. One posted since the refresh is the answer; if none ever shows up, the latest seen is returned as before.
        long since = System.currentTimeMillis() - 50;
        MomentumShade.refresh(context);
        long end = SystemClock.uptimeMillis() + 5000;
        Notification seen = null;
        while (SystemClock.uptimeMillis() < end) {
            for (StatusBarNotification n : nm.getActiveNotifications()) {
                if (n.getId() != MomentumShade.NOTIFICATION_ID) continue;
                if (n.getPostTime() >= since) return n.getNotification();
                seen = n.getNotification();
            }
            Thread.sleep(100);
        }
        return seen;
    }

    private static String text(Notification n, String key) {
        CharSequence c = n.extras.getCharSequence(key);
        return c == null ? null : c.toString();
    }

    private static int minuteOfDay(long ms) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(ms);
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    private static JSONObject window(long now, int opensInMinutes, int lengthMinutes) throws Exception {
        int start = (minuteOfDay(now) + opensInMinutes + 1440) % 1440;
        return new JSONObject().put("startMin", start).put("endMin", (start + lengthMinutes) % 1440);
    }

    // ---- what Android holds --------------------------------------------------------------

    @Test
    public void theCounterIsSilentAndStaysPut() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now));
        Notification n = posted();
        assertNotNull("the counter was posted", n);
        assertTrue("it is ongoing, so Clear all leaves it alone", (n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        assertEquals("the headline is the clean time", "4d 6h clean", text(n, Notification.EXTRA_TITLE));
        assertEquals("the habit is in the header", "Doomscrolling", text(n, Notification.EXTRA_SUB_TEXT));
        assertNotNull("it has a small icon", n.getSmallIcon());
        if (Build.VERSION.SDK_INT >= 26) {
            assertEquals("the channel is the quiet one",
                    NotificationManager.IMPORTANCE_LOW, nm.getNotificationChannel(MomentumShade.CHANNEL).getImportance());
            assertEquals(MomentumShade.CHANNEL, n.getChannelId());
        }
    }

    @Test
    public void theSecondLineSaysHowTheRunCompares() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("best run and the last urge, together",
                "Best run 11d \u00B7 last urge 2d 1h ago", text(n, Notification.EXTRA_TEXT));
    }

    @Test
    public void theCurrentRunBeatingTheBestSaysSo() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("bestPastMs", 2 * DAY));
        Notification n = posted();
        assertNotNull(n);
        assertTrue(text(n, Notification.EXTRA_TEXT), text(n, Notification.EXTRA_TEXT).startsWith("Your longest run yet"));
    }

    @Test
    public void aHabitThatNeverSlippedSaysHowItBegan() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("everSlipped", false).put("bestPastMs", 0).put("lastUrgeAt", 0));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("Clean since you started", text(n, Notification.EXTRA_TEXT));
    }

    @Test
    public void theLockScreenVersionSaysNothingAboutTheHabit() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("private by default", Notification.VISIBILITY_PRIVATE, n.visibility);
        assertNotNull("with a public version to show instead", n.publicVersion);
        String shown = text(n.publicVersion, Notification.EXTRA_TITLE) + "|" + text(n.publicVersion, Notification.EXTRA_TEXT)
                + "|" + text(n.publicVersion, Notification.EXTRA_SUB_TEXT);
        assertFalse("the habit's name isn't on it: " + shown, shown.contains("Doomscrolling"));
        assertFalse("nor is the clean time: " + shown, shown.contains("clean"));
    }

    @Test
    public void theNameShowsOnTheLockScreenWhenAskedFor() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("hideOnLock", false));
        Notification n = posted();
        assertNotNull(n);
        assertEquals(Notification.VISIBILITY_PUBLIC, n.visibility);
        assertNull("nothing replaces it", n.publicVersion);
    }

    @Test
    public void thereAreThreeButtons() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now));
        Notification n = posted();
        assertNotNull(n);
        assertNotNull(n.actions);
        assertEquals(3, n.actions.length);
        assertEquals("Urge", n.actions[0].title.toString());
        assertEquals("I slipped", n.actions[1].title.toString());
        assertEquals("Note", n.actions[2].title.toString());
        assertNotNull("each one does something", n.actions[0].actionIntent);
        assertNotNull(n.actions[1].actionIntent);
        assertNotNull(n.actions[2].actionIntent);
        assertNotNull("the third has a box to type into", n.actions[2].getRemoteInputs());
        assertEquals(MomentumShade.NOTE_KEY, n.actions[2].getRemoteInputs()[0].getResultKey());
        assertNull("the other two do not", n.actions[0].getRemoteInputs());
        assertNotNull("tapping the body does too", n.contentIntent);
    }

    // ---- the buttons follow the hour ---------------------------------------------------------

    private JSONArray zoneEnd(long endAt) throws Exception {
        return new JSONArray().put(new JSONObject().put("key", "z1@2026-10-06").put("endAt", endAt));
    }

    @Test
    public void afterARedZoneEndsIHeldItTakesThePlaceOfUrge() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("zoneEnds", zoneEnd(now - 30 * MINUTE)));
        Notification n = posted();
        assertNotNull(n);
        assertEquals(3, n.actions.length);
        assertEquals("I held it", n.actions[0].title.toString());
        assertEquals("I slipped", n.actions[1].title.toString());
        assertEquals("Note", n.actions[2].title.toString());
    }

    @Test
    public void whileAZoneIsStillRunningItIsStillUrge() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("zoneEnds", zoneEnd(now + 40 * MINUTE)));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("Urge", n.actions[0].title.toString());
    }

    @Test
    public void andAfterTheQuestionHasGoneStaleItIsUrgeAgain() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("zoneEnds", zoneEnd(now - 3 * HOUR)));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("Urge", n.actions[0].title.toString());
    }

    @Test
    public void holdingItIsKeptForTheAppAndTheButtonGoesAtOnce() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("zoneEnds", zoneEnd(now - 30 * MINUTE)));
        context.getSharedPreferences("momentum_shade_answers", Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_HOLD_KEY).commit();
        Intent held = new Intent(context, MomentumShade.class).setAction(MomentumShade.ACTION_HELD)
                .putExtra("taskId", "habit-1").putExtra("zone", "z1@2026-10-06");
        MomentumShade.handleHeld(context, held);
        JSONArray kept = MomentumShade.pendingList(context, MomentumShade.PENDING_HOLD_KEY);
        assertEquals(1, kept.length());
        assertEquals("habit-1", kept.getJSONObject(0).getString("taskId"));
        assertEquals("z1@2026-10-06", kept.getJSONObject(0).getString("zone"));
        long end = SystemClock.uptimeMillis() + 5000;
        Notification n = posted();
        while (n != null && "I held it".equals(n.actions[0].title.toString()) && SystemClock.uptimeMillis() < end) {
            Thread.sleep(100);
            Notification again = posted();
            if (again != null) n = again;
        }
        assertEquals("answered, so it is Urge again", "Urge", n.actions[0].title.toString());
        context.getSharedPreferences("momentum_shade_answers", Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_HOLD_KEY).commit();
    }

    @Test
    public void aHoldWithoutAZoneIsIgnored() throws Exception {
        write(snap(System.currentTimeMillis()));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_HOLD_KEY).commit();
        MomentumShade.handleHeld(context, new Intent(context, MomentumShade.class).setAction(MomentumShade.ACTION_HELD).putExtra("taskId", "habit-1"));
        assertEquals(0, MomentumShade.pendingList(context, MomentumShade.PENDING_HOLD_KEY).length());
    }

    // ---- a line typed into it ----------------------------------------------------------------

    private Intent noteWith(String typed) {
        Intent intent = new Intent(context, MomentumShade.class).setAction(MomentumShade.ACTION_NOTE).putExtra("taskId", "habit-1");
        Bundle results = new Bundle();
        results.putCharSequence(MomentumShade.NOTE_KEY, typed);
        RemoteInput.addResultsToIntent(new RemoteInput[] { new RemoteInput.Builder(MomentumShade.NOTE_KEY).build() }, intent, results);
        return intent;
    }

    @Test
    public void aTypedNoteIsKeptWithItsHabitForTheApp() throws Exception {
        write(snap(System.currentTimeMillis()));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_NOTE_KEY).commit();
        MomentumShade.handleNote(context, noteWith("  bored at work, phone was right there  "));
        JSONArray kept = MomentumShade.pendingList(context, MomentumShade.PENDING_NOTE_KEY);
        assertEquals(1, kept.length());
        assertEquals("habit-1", kept.getJSONObject(0).getString("taskId"));
        assertEquals("trimmed", "bored at work, phone was right there", kept.getJSONObject(0).getString("text"));
        assertTrue(kept.getJSONObject(0).getLong("at") > 0);
        assertNotNull("and the notification is redrawn, so the box stops spinning", posted());
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_NOTE_KEY).commit();
    }

    @Test
    public void anEmptyNoteKeepsNothingButStillEndsTheSpinner() throws Exception {
        write(snap(System.currentTimeMillis()));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_NOTE_KEY).commit();
        MomentumShade.handleNote(context, noteWith("   "));
        assertEquals(0, MomentumShade.pendingList(context, MomentumShade.PENDING_NOTE_KEY).length());
        assertNotNull(posted());
    }

    @Test
    public void aLongNoteIsCut() throws Exception {
        write(snap(System.currentTimeMillis()));
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_NOTE_KEY).commit();
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 500; i++) big.append('x');
        MomentumShade.handleNote(context, noteWith(big.toString()));
        assertEquals(MomentumShade.MAX_NOTE, MomentumShade.pendingList(context, MomentumShade.PENDING_NOTE_KEY).getJSONObject(0).getString("text").length());
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(MomentumShade.PENDING_NOTE_KEY).commit();
    }

    // ---- more when it is opened up -----------------------------------------------------------

    @Test
    public void openedUpItSaysWhatTheDayHasHeld() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("urgesToday", 3).put("zoneStreak", 4)
                .put("practice", new JSONObject().put("name", "Patience").put("text", "Take one slow breath before answering any message today.")));
        Notification n = posted();
        assertNotNull(n);
        String big = text(n, Notification.EXTRA_BIG_TEXT);
        assertTrue(big, big.contains("3 urges ridden out today"));
        assertTrue(big, big.contains("4 red zones held in a row"));
        assertTrue(big, big.contains("Today's patience: Take one slow breath"));
        assertFalse("the second line stays short", text(n, Notification.EXTRA_TEXT).contains("ridden out"));
    }

    @Test
    public void oneUrgeIsSingular_andNothingIsAddedWhenThereIsNothingToSay() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("urgesToday", 1).put("zoneStreak", 1));
        String big = text(posted(), Notification.EXTRA_BIG_TEXT);
        assertTrue(big, big.contains("1 urge ridden out today") && !big.contains("1 urges"));
        assertFalse("a streak of one is not worth a line", big.contains("in a row"));
        write(snap(now).put("urgesToday", 0).put("zoneStreak", 0));
        String plain = text(posted(), Notification.EXTRA_BIG_TEXT);
        assertTrue(plain == null || (!plain.contains("ridden out") && !plain.contains("Today's")));
    }

    @Test
    public void theCounterWakesWhenARedZoneEnds() throws Exception {
        long now = System.currentTimeMillis();
        JSONObject s = snap(now).put("zoneEnds", zoneEnd(now + 10 * MINUTE));
        assertEquals(now + 10 * MINUTE + 1000, MomentumShade.nextTickAt(s, now));
        JSONObject later = snap(now).put("zoneEnds", zoneEnd(now - 110 * MINUTE));
        assertEquals("and when the question stops being worth asking", now - 110 * MINUTE + MomentumShade.HELD_WINDOW_MS + 1000, MomentumShade.nextTickAt(later, now));
        assertEquals("with nothing to wake for, the usual quarter hour", now + MomentumShade.TICK_MS, MomentumShade.nextTickAt(snap(now), now));
    }

    // ---- the warning ---------------------------------------------------------------------

    @Test
    public void aHardWindowSoonTurnsItGoldAndSaysWhen() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("risk", window(now, 25, 90)));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("gold, not the calm teal", 0xFFE8B75D, n.color);
        String line = text(n, Notification.EXTRA_TEXT);
        assertTrue("the second line is the countdown: " + line, line.startsWith("Risk window opens in "));
        String big = text(n, Notification.EXTRA_BIG_TEXT);
        assertTrue("opened up, it still has the run on it: " + big, big.contains("Best run 11d"));
    }

    @Test
    public void insideTheWindowItStaysGold() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("risk", window(now, -10, 90)));
        Notification n = posted();
        assertNotNull(n);
        assertEquals(0xFFE8B75D, n.color);
        assertTrue(text(n, Notification.EXTRA_TEXT), text(n, Notification.EXTRA_TEXT).startsWith("In your risk window"));
    }

    @Test
    public void aWindowHoursAwayLeavesItCalmButIsMentionedWhenOpened() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("risk", window(now, 5 * 60, 90)));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("calm teal", 0xFF5FC7C0, n.color);
        assertTrue("the second line is still the run, not a warning",
                text(n, Notification.EXTRA_TEXT).startsWith("Best run"));
        assertTrue("the usual window is there when it's opened up: " + text(n, Notification.EXTRA_BIG_TEXT),
                text(n, Notification.EXTRA_BIG_TEXT).contains("Urges usually come"));
    }

    @Test
    public void insideARedZoneItIsGoldAndSaysSo() throws Exception {
        long now = System.currentTimeMillis();
        int cur = minuteOfDay(now);
        write(snap(now).put("zones", new JSONArray().put(new JSONObject()
                .put("days", new JSONArray().put(0).put(1).put(2).put(3).put(4).put(5).put(6))
                .put("startMin", (cur + 1430) % 1440).put("endMin", (cur + 90) % 1440))));
        Notification n = posted();
        assertNotNull(n);
        assertEquals(0xFFE8B75D, n.color);
        assertTrue(text(n, Notification.EXTRA_TEXT), text(n, Notification.EXTRA_TEXT).startsWith("RED ZONE \u00B7 until "));
    }

    @Test
    public void aRedZoneHoursAwayIsNamedWhenTheNotificationIsOpened() throws Exception {
        long now = System.currentTimeMillis();
        int cur = minuteOfDay(now);
        // Five hours away has to still be today: a zone that opens after midnight is tomorrow's, and is only announced
        // within the last hour and a half before it. So this can only be checked before 7pm.
        Assume.assumeTrue("a zone five hours away is still today", cur + 300 < 1440);
        write(snap(now).put("zones", new JSONArray().put(new JSONObject()
                .put("days", new JSONArray().put(0).put(1).put(2).put(3).put(4).put(5).put(6))
                .put("startMin", (cur + 300) % 1440).put("endMin", (cur + 400) % 1440))));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("calm teal", 0xFF5FC7C0, n.color);
        assertTrue(text(n, Notification.EXTRA_BIG_TEXT), text(n, Notification.EXTRA_BIG_TEXT).contains("Your red zone is "));
    }

    // ---- the first hour, and the refresh -------------------------------------------------

    @Test
    public void theFirstHourCountsOnItsOwn() throws Exception {
        long now = System.currentTimeMillis();
        long slip = now - 38 * MINUTE;
        write(snap(now).put("lastSlipAt", slip));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("Fresh start", text(n, Notification.EXTRA_TITLE));
        assertTrue("a chronometer is running in the header", n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertEquals("...from the slip", slip, n.when);
    }

    @Test
    public void afterAnHourItIsHoursAndMinutesWithNoChronometer() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now).put("lastSlipAt", now - (3 * HOUR + 20 * MINUTE)));
        Notification n = posted();
        assertNotNull(n);
        assertEquals("3h 20m clean", text(n, Notification.EXTRA_TITLE));
        assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
    }

    @Test
    public void theRefreshAlarmWakesAtTheHourMarkOfAFreshSlip() throws Exception {
        long now = 1_000_000_000_000L;
        JSONObject fresh = new JSONObject().put("lastSlipAt", now - 50 * MINUTE);
        assertEquals("sooner than 15 minutes, so the headline changes on time",
                now - 50 * MINUTE + HOUR + 1000, MomentumShade.nextTickAt(fresh, now));
        JSONObject old = new JSONObject().put("lastSlipAt", now - 3 * DAY);
        assertEquals("otherwise every 15 minutes", now + 15 * MINUTE, MomentumShade.nextTickAt(old, now));
        JSONObject justNow = new JSONObject().put("lastSlipAt", now - MINUTE);
        assertEquals("a slip a minute ago has its hour mark 59 minutes off, so the 15-minute tick comes first",
                now + 15 * MINUTE, MomentumShade.nextTickAt(justNow, now));
    }

    // ---- put up, taken down --------------------------------------------------------------

    @Test
    public void unpinningTakesItDown() throws Exception {
        long now = System.currentTimeMillis();
        write(snap(now));
        assertNotNull(posted());
        write(new JSONObject().put("show", false));
        MomentumShade.refresh(context);
        Thread.sleep(500);
        for (StatusBarNotification n : nm.getActiveNotifications()) {
            assertTrue("the counter is gone", n.getId() != MomentumShade.NOTIFICATION_ID);
        }
    }

    @Test
    public void aMalformedSnapshotShowsNothingRatherThanCrashing() throws Exception {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(MomentumShade.KEY, "{not json").commit();
        MomentumShade.refresh(context);
        Thread.sleep(300);
        for (StatusBarNotification n : nm.getActiveNotifications()) {
            assertTrue(n.getId() != MomentumShade.NOTIFICATION_ID);
        }
    }

    // ---- the I-slipped button's deep link ------------------------------------------------

    /** What the activity does with a deep link: leaves the habit's id where the web app picks it up, under the key for that button. */
    private Intent link(String host, String id) {
        return new Intent(Intent.ACTION_VIEW)
                .setData(new Uri.Builder().scheme("momentum").authority(host).appendPath(id).build());
    }

    private String stored(String key) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(key, null);
    }

    @Test
    public void iSlippedOpensTheSlipFormForThatHabit() throws Exception {
        Intent intent = link(MomentumShade.SLIP_HOST, "habit-1");
        assertTrue(MainActivity.stash(context, intent));
        // commit-less apply(): the value is visible to the same process straight away
        assertEquals("habit-1", stored(MainActivity.PENDING_LAPSE_KEY));
        assertNull("and it's not mistaken for an urge", stored(MainActivity.PENDING_URGE_KEY));
        assertNull("the intent is spent, so a re-delivery doesn't open it twice", intent.getData());
    }

    @Test
    public void urgeStillOpensTheUrgeScreen() throws Exception {
        assertTrue(MainActivity.stash(context, link(MomentumWidget.URGE_HOST, "habit-2")));
        assertEquals("habit-2", stored(MainActivity.PENDING_URGE_KEY));
        assertNull(stored(MainActivity.PENDING_LAPSE_KEY));
    }

    @Test
    public void otherLinksAndEmptyOnesAreIgnored() throws Exception {
        assertFalse(MainActivity.stash(context, link("elsewhere", "habit-1")));
        assertFalse(MainActivity.stash(context, new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.com/slip/habit-1"))));
        assertFalse("a link with no habit in it", MainActivity.stash(context, new Intent(Intent.ACTION_VIEW, Uri.parse("momentum://slip"))));
        assertFalse(MainActivity.stash(context, null));
        assertFalse(MainActivity.stash(context, new Intent(Intent.ACTION_MAIN)));
        assertNull(stored(MainActivity.PENDING_LAPSE_KEY));
        assertNull(stored(MainActivity.PENDING_URGE_KEY));
    }
}
