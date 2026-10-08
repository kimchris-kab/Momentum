package com.momentum.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.RemoteInput;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Notes to yourself, on a real Android: the alarms set from a plan, the notification that results,
 * the reply box in it, and what happens to what was typed. As with the shade counter, everything is
 * read back from what the system holds rather than from what the code meant to hand it.
 */
@RunWith(AndroidJUnit4.class)
public class PepTest {

    private static final String PREFS = "CapacitorStorage";
    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;

    private Context context;
    private NotificationManager nm;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 33) {
            InstrumentationRegistry.getInstrumentation().getUiAutomation()
                    .grantRuntimePermission(context.getPackageName(), "android.permission.POST_NOTIFICATIONS");
        }
        assertTrue(nm.areNotificationsEnabled());
        wipe();
        awaitNone();
    }

    /** Cancelling is queued inside the system; wait until it has happened so a test never reads the last one's notification. */
    private void awaitNone() throws Exception {
        long end = SystemClock.uptimeMillis() + 3000;
        while (SystemClock.uptimeMillis() < end) {
            if (nm.getActiveNotifications().length == 0) return;
            Thread.sleep(50);
        }
    }

    @After
    public void tearDown() {
        write(new JSONArray());
        MomentumPep.refresh(context); // takes down any alarm a test set
        wipe();
    }

    private void wipe() {
        nm.cancelAll();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove(MomentumPep.KEY).remove(MomentumPep.PENDING_KEY).commit();
    }

    // ---- helpers -------------------------------------------------------------------------

    private static JSONObject item(String id, String kind, long at) throws Exception {
        boolean write = "write".equals(kind);
        return new JSONObject().put("id", id).put("at", at).put("kind", kind).put("taskId", "habit-1")
                .put("title", write ? "Day 4 clean · Doomscrolling" : "You, on day 2")
                .put("body", write ? "Write one thing you did well today." : "I walked instead.");
    }

    private void write(JSONArray items) {
        try {
            assertTrue(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                    .putString(MomentumPep.KEY, new JSONObject().put("items", items).put("updatedAt", 1).toString()).commit());
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private static boolean alarmExists(Context context, String id) {
        Intent fire = new Intent(context, MomentumPep.class).setAction(MomentumPep.ACTION_FIRE)
                .setData(new Uri.Builder().scheme(MomentumPep.SCHEME).authority("fire").appendPath(id).build());
        return PendingIntent.getBroadcast(context, 0, fire, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE) != null;
    }

    private Notification posted(String id) throws Exception {
        int nid = MomentumPep.notificationId(id);
        long end = SystemClock.uptimeMillis() + 5000;
        while (SystemClock.uptimeMillis() < end) {
            for (StatusBarNotification n : nm.getActiveNotifications()) if (n.getId() == nid) return n.getNotification();
            Thread.sleep(100);
        }
        return null;
    }

    private static String text(Notification n, String key) {
        CharSequence c = n.extras.getCharSequence(key);
        return c == null ? null : c.toString();
    }

    // ---- the alarms ----------------------------------------------------------------------

    @Test
    public void everyFutureItemGetsAnAlarmAndPastOnesDont() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray()
                .put(item("pep:a:write", "write", now + 2 * HOUR))
                .put(item("pep:b:remind", "remind", now + 5 * HOUR))
                .put(item("pep:old:remind", "remind", now - HOUR)));
        MomentumPep.refresh(context);
        assertTrue(alarmExists(context, "pep:a:write"));
        assertTrue(alarmExists(context, "pep:b:remind"));
        assertFalse("a moment already past is not scheduled", alarmExists(context, "pep:old:remind"));
        assertEquals(2, MomentumPep.scheduledIds(context).size());
    }

    @Test
    public void aNewPlanTakesDownTheOldOne() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray().put(item("pep:a:write", "write", now + 2 * HOUR)));
        MomentumPep.refresh(context);
        assertTrue(alarmExists(context, "pep:a:write"));
        write(new JSONArray().put(item("pep:c:remind", "remind", now + 3 * HOUR)));
        MomentumPep.refresh(context);
        assertFalse("the old alarm is gone, so it can't fire for something no longer planned", alarmExists(context, "pep:a:write"));
        assertTrue(alarmExists(context, "pep:c:remind"));
        write(new JSONArray());
        MomentumPep.refresh(context);
        assertEquals("an empty plan leaves nothing set", 0, MomentumPep.scheduledIds(context).size());
        assertFalse(alarmExists(context, "pep:c:remind"));
    }

    @Test
    public void unknownKindsAndBrokenItemsAreIgnored() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray()
                .put(item("pep:x:other", "shout", now + HOUR))
                .put(new JSONObject().put("kind", "write").put("at", now + HOUR))
                .put("not an object")
                .put(item("pep:ok:write", "write", now + HOUR)));
        MomentumPep.refresh(context);
        assertEquals(1, MomentumPep.scheduledIds(context).size());
        assertTrue(alarmExists(context, "pep:ok:write"));
    }

    @Test
    public void aBrokenPlanIsNotACrash() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(MomentumPep.KEY, "{nope").commit();
        MomentumPep.refresh(context);
        assertEquals(0, MomentumPep.scheduledIds(context).size());
    }

    // ---- the notification ----------------------------------------------------------------

    @Test
    public void aWritingPromptHasAReplyBox() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray().put(item("pep:w:write", "write", now)));
        assertTrue(MomentumPep.fire(context, "pep:w:write"));
        Notification n = posted("pep:w:write");
        assertNotNull("it was posted", n);
        assertEquals("Day 4 clean · Doomscrolling", text(n, Notification.EXTRA_TITLE));
        assertEquals("Write one thing you did well today.", text(n, Notification.EXTRA_TEXT));
        assertNotNull(n.actions);
        assertEquals(1, n.actions.length);
        assertEquals("Write it", n.actions[0].title.toString());
        RemoteInput[] inputs = n.actions[0].getRemoteInputs();
        assertNotNull("the action carries a reply box", inputs);
        assertEquals(MomentumPep.REPLY_KEY, inputs[0].getResultKey());
        assertTrue("it goes away when tapped", (n.flags & Notification.FLAG_AUTO_CANCEL) != 0);
        assertNotNull("tapping the body opens the app", n.contentIntent);
        if (Build.VERSION.SDK_INT >= 26) {
            assertEquals("it can be heard, unlike the shade counter",
                    NotificationManager.IMPORTANCE_DEFAULT, nm.getNotificationChannel(MomentumPep.CHANNEL).getImportance());
        }
    }

    @Test
    public void aReminderIsYourOwnWordsWithNoReplyBox() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray().put(item("pep:r:remind", "remind", now)));
        assertTrue(MomentumPep.fire(context, "pep:r:remind"));
        Notification n = posted("pep:r:remind");
        assertNotNull(n);
        assertEquals("You, on day 2", text(n, Notification.EXTRA_TITLE));
        assertEquals("I walked instead.", text(n, Notification.EXTRA_TEXT));
        assertTrue("nothing to answer", n.actions == null || n.actions.length == 0);
    }

    @Test
    public void aStaleOrUnknownItemIsNotShown() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray().put(item("pep:late:remind", "remind", now - 4 * HOUR)));
        assertFalse("four hours late is too late", MomentumPep.fire(context, "pep:late:remind"));
        assertFalse("and one that isn't in the plan any more", MomentumPep.fire(context, "pep:gone:remind"));
        Thread.sleep(300);
        assertEquals(0, nm.getActiveNotifications().length);
    }

    @Test
    public void justLateIsStillFine() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray().put(item("pep:slow:remind", "remind", now - 20 * MINUTE)));
        assertTrue("a phone in doze can be minutes behind", MomentumPep.fire(context, "pep:slow:remind"));
    }

    // ---- the reply -----------------------------------------------------------------------

    private Intent replyWith(String taskId, int nid, String typed) {
        Intent intent = new Intent(context, MomentumPep.class).setAction(MomentumPep.ACTION_REPLY)
                .putExtra(MomentumPep.EXTRA_TASK, taskId).putExtra(MomentumPep.EXTRA_NOTIFICATION, nid);
        Bundle results = new Bundle();
        results.putCharSequence(MomentumPep.REPLY_KEY, typed);
        RemoteInput.addResultsToIntent(new RemoteInput[] { new RemoteInput.Builder(MomentumPep.REPLY_KEY).build() }, intent, results);
        return intent;
    }

    @Test
    public void aTypedNoteIsKeptForTheApp() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray().put(item("pep:w:write", "write", now)));
        MomentumPep.fire(context, "pep:w:write");
        int nid = MomentumPep.notificationId("pep:w:write");
        MomentumPep.handleReply(context, replyWith("habit-1", nid, "  I put the phone in the kitchen.  "));
        JSONArray kept = MomentumPep.pending(context);
        assertEquals(1, kept.length());
        assertEquals("habit-1", kept.getJSONObject(0).getString("taskId"));
        assertEquals("trimmed", "I put the phone in the kitchen.", kept.getJSONObject(0).getString("text"));
        assertTrue(kept.getJSONObject(0).getLong("at") > 0);

        // The replacement is posted through the system asynchronously, so the notification that was there a moment ago can still be what is read.
        Notification n = posted("pep:w:write");
        assertNotNull("the notification is replaced, so the reply box stops spinning", n);
        long end = SystemClock.uptimeMillis() + 5000;
        while (!"Saved".equals(text(n, Notification.EXTRA_TITLE)) && SystemClock.uptimeMillis() < end) {
            Thread.sleep(100);
            Notification again = posted0("pep:w:write");
            if (again != null) n = again;
        }
        assertEquals("Saved", text(n, Notification.EXTRA_TITLE));
        assertTrue("and there's no reply box left on it", n.actions == null || n.actions.length == 0);
    }

    @Test
    public void notesAccumulateUntilTheAppCollectsThem() throws Exception {
        MomentumPep.handleReply(context, replyWith("habit-1", 7401, "one"));
        MomentumPep.handleReply(context, replyWith("habit-2", 7402, "two"));
        JSONArray kept = MomentumPep.pending(context);
        assertEquals(2, kept.length());
        assertEquals("one", kept.getJSONObject(0).getString("text"));
        assertEquals("habit-2", kept.getJSONObject(1).getString("taskId"));
    }

    @Test
    public void anEmptyReplyKeepsNothingAndClearsTheNotification() throws Exception {
        long now = System.currentTimeMillis();
        write(new JSONArray().put(item("pep:w:write", "write", now)));
        MomentumPep.fire(context, "pep:w:write");
        MomentumPep.handleReply(context, replyWith("habit-1", MomentumPep.notificationId("pep:w:write"), "   "));
        assertEquals(0, MomentumPep.pending(context).length());
        Thread.sleep(300);
        assertNull("nothing left spinning", posted0("pep:w:write"));
    }

    private Notification posted0(String id) {
        int nid = MomentumPep.notificationId(id);
        for (StatusBarNotification n : nm.getActiveNotifications()) if (n.getId() == nid) return n.getNotification();
        return null;
    }

    @Test
    public void aReplyWithNoHabitIsRefused() {
        assertFalse(MomentumPep.storeReply(context, "", "text", 1));
        assertFalse(MomentumPep.storeReply(context, null, "text", 1));
        assertFalse(MomentumPep.storeReply(context, "habit-1", null, 1));
        assertEquals(0, MomentumPep.pending(context).length());
    }

    @Test
    public void aLongNoteIsCutAndAPileOfThemIsCapped() throws Exception {
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 500; i++) big.append('x');
        assertTrue(MomentumPep.storeReply(context, "habit-1", big.toString(), 1));
        assertEquals(MomentumPep.MAX_NOTE, MomentumPep.pending(context).getJSONObject(0).getString("text").length());
        for (int i = 0; i < MomentumPep.MAX_PENDING + 10; i++) MomentumPep.storeReply(context, "habit-1", "n" + i, i);
        JSONArray kept = MomentumPep.pending(context);
        assertEquals(MomentumPep.MAX_PENDING, kept.length());
        assertEquals("the newest are the ones kept", "n" + (MomentumPep.MAX_PENDING + 9), kept.getJSONObject(kept.length() - 1).getString("text"));
    }
}
