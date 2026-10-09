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

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.Calendar;
import java.util.Collections;
import java.util.GregorianCalendar;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Logging money without the app, on a real Android: that the phone reads a payment exactly as the web app does (the same cases, run through
 * both), the box in the shade and what happens to a line typed into it, the offer a payment message becomes, saving and undoing it, and what is
 * and is not read. As with the other notification tests, results are read back from what the system holds.
 */
@RunWith(AndroidJUnit4.class)
public class MoneyTest {

    private static final String PREFS = "CapacitorStorage";
    private static final String OWN = "momentum_money";
    private static final String NAIVAS = "SBH7K2LM9R Confirmed. Ksh1,200.00 paid to NAIVAS SUPERMARKET. on 17/8/23 at 6:45 PM.New M-PESA balance is Ksh2,000.00. Transaction cost, Ksh0.00.";

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
        MoneyParse.load(context);
        wipe();
        awaitNone();
    }

    @After
    public void tearDown() {
        wipe();
    }

    private void wipe() {
        nm.cancelAll();
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .remove(MomentumMoney.CONFIG_KEY).remove(MomentumMoney.PENDING_KEY).remove(MomentumMoney.UNDO_KEY)
                .remove(MomentumMoney.PENDING_DRAFT_KEY).commit();
        context.getSharedPreferences(OWN, Context.MODE_PRIVATE).edit().clear().commit();
    }

    private void awaitNone() throws Exception {
        long end = SystemClock.uptimeMillis() + 3000;
        while (SystemClock.uptimeMillis() < end) {
            if (nm.getActiveNotifications().length == 0) return;
            Thread.sleep(50);
        }
    }

    // ---- helpers -------------------------------------------------------------------------

    private void config(boolean quick, boolean read, String mode, String[] senders, String[] packages, JSONObject payees) {
        try {
            JSONObject cats = new JSONObject()
                    .put("groceries", new JSONObject().put("label", "Groceries").put("type", "expense"))
                    .put("dining", new JSONObject().put("label", "Eating out").put("type", "expense"))
                    .put("health", new JSONObject().put("label", "Health").put("type", "expense"))
                    .put("other_expense", new JSONObject().put("label", "Other").put("type", "expense"))
                    .put("salary", new JSONObject().put("label", "Salary").put("type", "income"));
            JSONObject o = new JSONObject().put("quick", quick).put("read", read).put("mode", mode)
                    .put("senders", new JSONArray(java.util.Arrays.asList(senders)))
                    .put("packages", new JSONArray(java.util.Arrays.asList(packages)))
                    .put("payees", payees == null ? new JSONObject() : payees).put("categories", cats);
            assertTrue(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(MomentumMoney.CONFIG_KEY, o.toString()).commit());
        } catch (Exception e) {
            throw new AssertionError(e);
        }
    }

    private static String[] none() { return new String[0]; }

    private Notification awaitTitle(int id, String contains) throws Exception {
        long end = SystemClock.uptimeMillis() + 5000;
        Notification last = null;
        while (SystemClock.uptimeMillis() < end) {
            for (StatusBarNotification n : nm.getActiveNotifications()) {
                if (n.getId() != id) continue;
                last = n.getNotification();
                CharSequence title = last.extras.getCharSequence(Notification.EXTRA_TITLE);
                if (title != null && title.toString().contains(contains)) return last;
            }
            Thread.sleep(100);
        }
        return last;
    }

    private Notification posted(int id) throws Exception {
        return awaitTitle(id, "");
    }

    private static String title(Notification n) {
        CharSequence c = n.extras.getCharSequence(Notification.EXTRA_TITLE);
        return c == null ? null : c.toString();
    }

    private static String text(Notification n) {
        CharSequence c = n.extras.getCharSequence(Notification.EXTRA_TEXT);
        return c == null ? null : c.toString();
    }

    private Intent replyWith(String typed) {
        Intent intent = new Intent(context, MomentumMoney.class).setAction(MomentumMoney.ACTION_REPLY);
        Bundle results = new Bundle();
        results.putCharSequence(MomentumMoney.REPLY_KEY, typed);
        RemoteInput.addResultsToIntent(new RemoteInput[] { new RemoteInput.Builder(MomentumMoney.REPLY_KEY).build() }, intent, results);
        return intent;
    }

    private String asset(String name) throws Exception {
        try (InputStream in = InstrumentationRegistry.getInstrumentation().getContext().getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        }
    }

    private static MoneyParse.Payment read(String message) {
        return MoneyParse.parseMessage(message, new GregorianCalendar(2026, Calendar.OCTOBER, 12, 14, 30).getTimeInMillis(), new MoneyParse.Learned());
    }

    // ---- the same cases the web app is tested with ---------------------------------------

    private static String differences(JSONObject expect, MoneyParse.Payment p) {
        StringBuilder sb = new StringBuilder();
        for (Iterator<String> it = expect.keys(); it.hasNext();) {
            String k = it.next();
            Object want = expect.opt(k);
            Object got;
            switch (k) {
                case "amount": got = p.amount; want = ((Number) want).doubleValue(); break;
                case "cur": got = p.cur; break;
                case "type": got = p.type; break;
                case "payee": got = p.payee; break;
                case "date": got = p.date; break;
                case "time": got = p.time; break;
                case "ref": got = p.ref; break;
                case "catId": got = p.catId; break;
                default: continue;
            }
            if (!String.valueOf(want).equals(String.valueOf(got))) sb.append(k).append(": want ").append(want).append(", got ").append(got).append("; ");
        }
        return sb.toString();
    }

    @Test
    public void everySharedMessageCaseIsReadTheSameWayOnThePhone() throws Exception {
        JSONArray cases = new JSONArray(asset("tx-messages.json"));
        assertTrue("there are cases to run", cases.length() > 20);
        StringBuilder failures = new StringBuilder();
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            MoneyParse.Payment p = read(c.getString("text"));
            if (c.isNull("expect")) {
                if (p != null) failures.append(c.getString("name")).append(": expected nothing\n");
            } else if (p == null) {
                failures.append(c.getString("name")).append(": read as nothing\n");
            } else {
                String d = differences(c.getJSONObject("expect"), p);
                if (!d.isEmpty()) failures.append(c.getString("name")).append(": ").append(d).append('\n');
            }
        }
        assertEquals("", failures.toString());
    }

    @Test
    public void everySharedTypedCaseIsReadTheSameWayOnThePhone() throws Exception {
        JSONArray cases = new JSONArray(asset("tx-typed.json"));
        assertTrue(cases.length() > 10);
        StringBuilder failures = new StringBuilder();
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            MoneyParse.Payment p = MoneyParse.parseTyped(c.getString("line"), c.getString("today"), new MoneyParse.Learned());
            if (c.isNull("expect")) {
                if (p != null) failures.append('"').append(c.getString("line")).append("\": expected nothing\n");
            } else if (p == null) {
                failures.append('"').append(c.getString("line")).append("\": read as nothing\n");
            } else {
                String d = differences(c.getJSONObject("expect"), p);
                if (!d.isEmpty()) failures.append('"').append(c.getString("line")).append("\": ").append(d).append('\n');
            }
        }
        assertEquals("", failures.toString());
    }

    @Test
    public void yourOwnPayeesComeBeforeTheBuiltInGuess() throws Exception {
        config(true, true, "ask", none(), none(), new JSONObject().put("mama mboga", "health"));
        MoneyParse.Learned learned = MomentumMoney.config(context).learned;
        assertEquals("health", MoneyParse.parseTyped("mama mboga 120", "2026-10-12", learned).catId);
        assertEquals("a payee you've never used falls back to the keywords", "groceries", MoneyParse.parseTyped("naivas 120", "2026-10-12", learned).catId);
    }

    // ---- the box in the shade -------------------------------------------------------------

    @Test
    public void theBoxIsInTheShadeWhenOnAndGoneWhenOff() throws Exception {
        config(true, false, "ask", none(), none(), null);
        MomentumMoney.refresh(context);
        Notification n = posted(MomentumMoney.QUICK_ID);
        assertNotNull(n);
        assertEquals("Spent something?", title(n));
        assertTrue("it can't be swiped away by accident", (n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        assertNotNull("with a button to type into", n.actions);
        assertEquals(1, n.actions.length);
        assertNotNull("which has a text box", n.actions[0].getRemoteInputs());
        assertEquals(MomentumMoney.REPLY_KEY, n.actions[0].getRemoteInputs()[0].getResultKey());
        assertEquals("the lock screen shows nothing of it", Notification.VISIBILITY_PRIVATE, n.visibility);
        assertNotNull(n.publicVersion);

        config(false, false, "ask", none(), none(), null);
        MomentumMoney.refresh(context);
        long end = SystemClock.uptimeMillis() + 3000;
        boolean gone = false;
        while (SystemClock.uptimeMillis() < end && !gone) {
            gone = true;
            for (StatusBarNotification s : nm.getActiveNotifications()) if (s.getId() == MomentumMoney.QUICK_ID) gone = false;
            if (!gone) Thread.sleep(50);
        }
        assertTrue("switched off, the box is taken down", gone);
    }

    @Test
    public void aTypedLineIsKeptForTheAppAndAnswered() throws Exception {
        config(true, false, "ask", none(), none(), null);
        MoneyParse.Payment p = MomentumMoney.handleReply(context, replyWith("lunch 12"));
        assertNotNull(p);
        JSONArray kept = MomentumMoney.pending(context);
        assertEquals(1, kept.length());
        JSONObject r = kept.getJSONObject(0);
        assertEquals(12.0, r.getDouble("amount"), 0.0001);
        assertEquals("expense", r.getString("type"));
        assertEquals("dining", r.getString("catId"));
        assertEquals("Lunch", r.getString("payee"));
        assertEquals("typed", r.getString("via"));
        assertTrue("an id the app can recognise as its own", r.getString("id").startsWith("q-"));
        assertTrue("and a key that is its own, so two lunches are two lunches", r.getString("key").startsWith("typed:"));
        assertEquals(MoneyParse.today(System.currentTimeMillis()), r.getString("date"));

        Notification n = awaitTitle(MomentumMoney.QUICK_ID, "Logged");
        assertNotNull(n);
        assertEquals("Logged 12 · Eating out", title(n));
        assertNotNull("the answer has an Undo", n.actions);
        assertEquals("Undo", n.actions[0].title.toString());
    }

    @Test
    public void twoIdenticalLinesAreTwoEntries() throws Exception {
        config(true, false, "ask", none(), none(), null);
        MomentumMoney.handleReply(context, replyWith("lunch 12"));
        MomentumMoney.handleReply(context, replyWith("lunch 12"));
        JSONArray kept = MomentumMoney.pending(context);
        assertEquals(2, kept.length());
        assertFalse(kept.getJSONObject(0).getString("id").equals(kept.getJSONObject(1).getString("id")));
    }

    @Test
    public void aLineThatIsNotMoneyIsSaidSoAndNothingIsKept() throws Exception {
        config(true, false, "ask", none(), none(), null);
        assertNull(MomentumMoney.handleReply(context, replyWith("hello there")));
        assertEquals(0, MomentumMoney.pending(context).length());
        Notification n = awaitTitle(MomentumMoney.QUICK_ID, "read that");
        assertNotNull(n);
        assertTrue(title(n).contains("read that"));
    }

    @Test
    public void undoTakesAPaymentBackBeforeOrAfterTheAppHasCollectedIt() throws Exception {
        config(true, false, "ask", none(), none(), null);
        MomentumMoney.handleReply(context, replyWith("taxi 8.5 uber"));
        String id = MomentumMoney.pending(context).getJSONObject(0).getString("id");
        MomentumMoney.undo(context, id);
        assertEquals("still waiting, so it is simply removed", 0, MomentumMoney.pending(context).length());
        assertEquals(0, MomentumMoney.readList(context, MomentumMoney.UNDO_KEY).length());

        MomentumMoney.undo(context, "q-already-collected");
        JSONArray told = MomentumMoney.readList(context, MomentumMoney.UNDO_KEY);
        assertEquals("already collected, so the app is told to remove it", 1, told.length());
        assertEquals("q-already-collected", told.getString(0));
    }

    // ---- a payment read from a message ---------------------------------------------------

    @Test
    public void aPaymentMessageIsOfferedWithSaveAndChange() throws Exception {
        config(false, true, "ask", none(), none(), null);
        long now = System.currentTimeMillis();
        String result = MomentumMoney.handlePayment(context, read(NAIVAS), now);
        assertEquals("offered", result);
        assertEquals("nothing is recorded until the person taps", 0, MomentumMoney.pending(context).length());
        MoneyParse.Payment p = read(NAIVAS);
        int nid = MomentumMoney.notificationId(MoneyParse.paymentKey(p));
        Notification n = posted(nid);
        assertNotNull(n);
        assertEquals("KES 1,200", title(n));
        assertTrue(text(n).contains("Naivas Supermarket") && text(n).contains("Groceries"));
        assertEquals(2, n.actions.length);
        assertEquals("Save", n.actions[0].title.toString());
        assertEquals("Change", n.actions[1].title.toString());
        assertEquals("the lock screen shows no amount", Notification.VISIBILITY_PRIVATE, n.visibility);
    }

    @Test
    public void saveKeepsThePaymentAndOffersUndo() throws Exception {
        config(false, true, "ask", none(), none(), null);
        MoneyParse.Payment p = read(NAIVAS);
        MomentumMoney.handlePayment(context, p, System.currentTimeMillis());
        int nid = MomentumMoney.notificationId(MoneyParse.paymentKey(p));
        JSONObject rec = MomentumMoney.record(p, 5);
        Intent save = new Intent(context, MomentumMoney.class).setAction(MomentumMoney.ACTION_SAVE)
                .putExtra(MomentumMoney.EXTRA_RECORD, rec.toString()).putExtra(MomentumMoney.EXTRA_NOTIFICATION, nid);
        MomentumMoney.handleSave(context, save);
        JSONArray kept = MomentumMoney.pending(context);
        assertEquals(1, kept.length());
        assertEquals("cap-ref-SBH7K2LM9R", kept.getJSONObject(0).getString("id"));
        assertEquals(1200.0, kept.getJSONObject(0).getDouble("amount"), 0.0001);
        assertEquals("groceries", kept.getJSONObject(0).getString("catId"));
        assertEquals("SBH7K2LM9R", kept.getJSONObject(0).getString("ref"));
        Notification n = awaitTitle(nid, "Saved");
        assertNotNull(n);
        assertTrue(title(n).startsWith("Saved"));
        assertEquals("Undo", n.actions[0].title.toString());

        MomentumMoney.handleSave(context, save);
        assertEquals("pressing Save twice keeps it once", 1, MomentumMoney.pending(context).length());
    }

    @Test
    public void thePaymentIdIsTheSameWhateverWayItArrives() throws Exception {
        JSONObject a = MomentumMoney.record(read(NAIVAS), 1);
        JSONObject b = MomentumMoney.record(read(NAIVAS), 99999);
        assertEquals(a.getString("id"), b.getString("id"));
        assertEquals(a.getString("key"), b.getString("key"));
    }

    @Test
    public void aSecondAnnouncementOfTheSamePaymentIsIgnored() throws Exception {
        config(false, true, "ask", none(), none(), null);
        long now = System.currentTimeMillis();
        assertEquals("offered", MomentumMoney.handlePayment(context, read(NAIVAS), now));
        assertEquals("the app's notification for the same payment", "duplicate", MomentumMoney.handlePayment(context, read(NAIVAS), now + 5000));
        String bank = "Purchase of USD 12.50 at STARBUCKS on card ending 1234. Available balance USD 800.00.";
        assertEquals("offered", MomentumMoney.handlePayment(context, read(bank), now));
        assertEquals("without a reference, the same amount, place and time", "duplicate", MomentumMoney.handlePayment(context, read(bank), now + 60000));
    }

    @Test
    public void automaticSavesAtOnceWithAWayBack() throws Exception {
        config(false, true, "auto", none(), none(), null);
        assertEquals("saved", MomentumMoney.handlePayment(context, read(NAIVAS), System.currentTimeMillis()));
        assertEquals(1, MomentumMoney.pending(context).length());
        Notification n = posted(MomentumMoney.notificationId(MoneyParse.paymentKey(read(NAIVAS))));
        assertNotNull(n);
        assertTrue(title(n).startsWith("Saved"));
        assertEquals("Undo", n.actions[0].title.toString());
    }

    @Test
    public void nothingIsReadWhenReadingIsOff() throws Exception {
        config(false, false, "ask", new String[] { "MPESA" }, new String[] { "com.bank.app" }, null);
        assertEquals("off", MomentumMoney.handlePayment(context, read(NAIVAS), System.currentTimeMillis()));
        Map<String, StringBuilder> texts = new LinkedHashMap<>();
        texts.put("MPESA", new StringBuilder(NAIVAS));
        assertEquals(0, MoneySmsReceiver.read(context, texts, System.currentTimeMillis()));
        assertFalse(MoneyListenerService.consider(context, "com.bank.app", "Bank", NAIVAS, System.currentTimeMillis()));
        assertEquals(0, nm.getActiveNotifications().length);
        assertEquals("not even a note of which apps sent one", 0, MomentumMoney.candidates(context).length());
    }

    @Test
    public void onlyListedSendersAreRead() throws Exception {
        config(false, true, "ask", new String[] { "MPESA", "MyBank" }, none(), null);
        Map<String, StringBuilder> texts = new LinkedHashMap<>();
        texts.put("MPESA", new StringBuilder(NAIVAS));
        texts.put("+254700000000", new StringBuilder("Purchase of USD 12.50 at STARBUCKS on card ending 1234. Available balance USD 800.00."));
        texts.put("MyBank", new StringBuilder("Your OTP is 482913. Do not share it."));
        assertEquals("only the listed sender's payment", 1, MoneySmsReceiver.read(context, texts, System.currentTimeMillis()));
        long end = SystemClock.uptimeMillis() + 3000;
        while (SystemClock.uptimeMillis() < end && nm.getActiveNotifications().length < 1) Thread.sleep(50);
        Thread.sleep(300);
        assertEquals("one offer, and nothing for the code or the stranger", 1, nm.getActiveNotifications().length);
    }

    @Test
    public void sendersMatchWithoutRegardToCaseAndAsPartOfAName() {
        java.util.List<String> allowed = java.util.Arrays.asList("MPESA", "AirtelMoney", "KCB");
        assertTrue(MomentumMoney.senderAllowed("mpesa", allowed));
        assertTrue(MomentumMoney.senderAllowed("AirtelMoney", allowed));
        assertTrue("a sender that carries the name inside it", MomentumMoney.senderAllowed("KCB-ALERT", allowed));
        assertFalse(MomentumMoney.senderAllowed("+254700123456", allowed));
        assertFalse(MomentumMoney.senderAllowed("", allowed));
        assertFalse(MomentumMoney.senderAllowed(null, allowed));
        assertFalse("nothing allowed means nothing read", MomentumMoney.senderAllowed("MPESA", Collections.<String>emptyList()));
        assertFalse("a one-letter entry matches nothing", MomentumMoney.senderAllowed("MPESA", java.util.Arrays.asList("M")));
    }

    @Test
    public void appNotificationsAreCountedButOnlyChosenAppsAreActedOn() throws Exception {
        config(false, true, "ask", none(), new String[] { "com.bank.app" }, null);
        long now = System.currentTimeMillis();
        assertFalse("an app that was not chosen", MoneyListenerService.consider(context, "com.other.app", "Other", NAIVAS, now));
        assertEquals(0, nm.getActiveNotifications().length);
        assertTrue("one that was", MoneyListenerService.consider(context, "com.bank.app", "Bank App", "You spent $45.20 at AMAZON on your card ending 4321", now));
        assertFalse("chat in a chosen app isn't a payment", MoneyListenerService.consider(context, "com.bank.app", "Bank App", "Hey, lunch tomorrow?", now));
        JSONArray apps = MomentumMoney.candidates(context);
        assertEquals("both apps that sent something payment-shaped are offered in Settings", 2, apps.length());
        boolean sawBank = false;
        for (int i = 0; i < apps.length(); i++) {
            JSONObject a = apps.getJSONObject(i);
            if ("com.bank.app".equals(a.getString("package"))) { sawBank = true; assertEquals("Bank App", a.getString("label")); assertEquals(1, a.getInt("count")); }
        }
        assertTrue(sawBank);
    }

    @Test
    public void theChangeButtonMovesThePaymentToWhereTheAppLooks() throws Exception {
        config(false, true, "ask", none(), none(), null);
        MoneyParse.Payment p = read(NAIVAS);
        MomentumMoney.handlePayment(context, p, System.currentTimeMillis());
        int nid = MomentumMoney.notificationId(MoneyParse.paymentKey(p));
        Intent change = new Intent(context, MainActivity.class).setAction(Intent.ACTION_VIEW)
                .setData(new Uri.Builder().scheme(MomentumWidget.URGE_SCHEME).authority(MomentumMoney.DRAFT_HOST).appendPath(String.valueOf(nid)).build());
        assertTrue(MainActivity.stash(context, change));
        String raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(MomentumMoney.PENDING_DRAFT_KEY, null);
        assertNotNull(raw);
        JSONObject r = new JSONObject(raw);
        assertEquals(1200.0, r.getDouble("amount"), 0.0001);
        assertEquals("Naivas Supermarket", r.getString("payee"));
        assertEquals("changing it does not record it", 0, MomentumMoney.pending(context).length());
        assertNull("the link is used up", change.getData());
        assertFalse("asking again finds nothing", MainActivity.stash(context, new Intent(Intent.ACTION_VIEW, new Uri.Builder().scheme(MomentumWidget.URGE_SCHEME)
                .authority(MomentumMoney.DRAFT_HOST).appendPath(String.valueOf(nid)).build())));
    }

    @Test
    public void paymentsWaitingForTheAppAreCapped() throws Exception {
        config(true, false, "ask", none(), none(), null);
        for (int i = 0; i < MomentumMoney.MAX_PENDING + 20; i++) {
            MomentumMoney.savePending(context, new JSONObject().put("id", "q-" + i).put("amount", 1).put("type", "expense"));
        }
        JSONArray kept = MomentumMoney.pending(context);
        assertEquals(MomentumMoney.MAX_PENDING, kept.length());
        assertEquals("the oldest go first", "q-20", kept.getJSONObject(0).getString("id"));
    }
}
