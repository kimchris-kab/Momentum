package com.momentum.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.appwidget.AppWidgetHost;
import android.appwidget.AppWidgetHostView;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import android.content.Context;
import android.os.SystemClock;
import android.util.TypedValue;
import android.view.View;
import android.widget.ListView;
import android.widget.TextView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.Calendar;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Runs the widget on a real Android, rather than reading its source.
 *
 * Everything before this was checked by compiling it and by reading the files. Compiling proved
 * the Java was valid; it said nothing about whether the layout inflates under RemoteViews' rules,
 * whether the list service binds, or what actually ends up on the screen — which is how a widget
 * that "built fine" could show "Problem loading widget". So this puts the real widget into a real
 * AppWidgetHost on an emulator, hands it a snapshot the way the app would, and looks at what it drew.
 *
 * It does not replace putting it on a home screen: a launcher is a different host, and nobody has
 * yet watched this on a phone. It closes the gap between "compiles" and "draws".
 */
@RunWith(AndroidJUnit4.class)
public class WidgetTest {

    private static final String PREFS = "CapacitorStorage";
    private static final String KEY = "momentum:widget";
    private static final int HOST_ID = 4242;
    private static final long WAIT_MS = 25_000;

    private static final long HOUR = 3_600_000L;
    private static final long DAY = 24 * HOUR;

    private Instrumentation inst;
    private Context context;
    private AppWidgetManager manager;
    private AppWidgetHost host;
    private AppWidgetHostView hostView;
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Before
    public void setUp() {
        inst = InstrumentationRegistry.getInstrumentation();
        context = inst.getTargetContext();
        manager = AppWidgetManager.getInstance(context);
    }

    @After
    public void tearDown() {
        if (host != null) {
            if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) host.deleteAppWidgetId(widgetId);
            try { host.stopListening(); } catch (Exception ignored) { }
        }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).commit();
    }

    // ---- helpers -------------------------------------------------------------------------

    private void snapshot(String json) {
        assertTrue(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).commit());
    }

    private int px(int dp) {
        return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dp,
                context.getResources().getDisplayMetrics());
    }

    /** Puts the real widget into a real host, the way a launcher would, and asks it to draw. */
    private void placeWidget() throws Exception {
        UiAutomation ui = inst.getUiAutomation();
        // Binding a widget is the launcher's privilege. The shell has it; borrow it for the call.
        ui.adoptShellPermissionIdentity("android.permission.BIND_APPWIDGET");
        try {
            host = new AppWidgetHost(context, HOST_ID);
            widgetId = host.allocateAppWidgetId();
            ComponentName provider = new ComponentName(context, MomentumWidget.class);
            assertTrue("the widget could be bound to a host", manager.bindAppWidgetIdIfAllowed(widgetId, provider));
        } finally {
            ui.dropShellPermissionIdentity();
        }
        final AppWidgetProviderInfo info = manager.getAppWidgetInfo(widgetId);
        assertNotNull("Android knows about the widget (it's registered and exported)", info);

        inst.runOnMainSync(() -> {
            host.startListening();
            hostView = host.createView(context, widgetId, info);
        });
        layOut();
        // The provider draws when asked. This is what the app's own refresh does after a write.
        MomentumWidget.refresh(context);
    }

    /** Sized like the 4x4 widget it's declared as, which is what a phone gives it by default. */
    private void layOut() {
        inst.runOnMainSync(() -> {
            int w = px(290), h = px(320);
            hostView.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
            hostView.layout(0, 0, w, h);
        });
    }

    private interface Check {
        boolean ok();
    }

    /** Waits, re-laying-out each time: a list only asks for its rows when it's laid out. */
    private void waitFor(String what, Check check) throws Exception {
        long end = SystemClock.uptimeMillis() + WAIT_MS;
        while (SystemClock.uptimeMillis() < end) {
            final boolean[] ok = new boolean[1];
            inst.runOnMainSync(() -> {
                int w = px(290), h = px(320);
                hostView.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY),
                        View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
                hostView.layout(0, 0, w, h);
                ok[0] = check.ok();
            });
            if (ok[0]) return;
            Thread.sleep(250);
        }
        fail("Timed out waiting for " + what + ". What the widget showed: " + describe());
    }

    private String text(int id) {
        View v = hostView.findViewById(id);
        return v instanceof TextView ? ((TextView) v).getText().toString() : null;
    }

    /** Where the list is and what it holds: a list that is hidden or has no height draws no rows. */
    private String listState() {
        ListView l = hostView.findViewById(R.id.widget_list);
        if (l == null) return "list=missing";
        return "root=" + hostView.getHeight() + " quit0=" + hostView.findViewById(R.id.quit_0).getHeight()
                + " quit1=" + hostView.findViewById(R.id.quit_1).getHeight()
                + " list(h=" + l.getHeight() + " vis=" + l.getVisibility() + " children=" + l.getChildCount()
                + " count=" + (l.getAdapter() == null ? -1 : l.getAdapter().getCount()) + ")"
                + " density=" + context.getResources().getDisplayMetrics().density;
    }

    private String describe() {
        final AtomicReference<String> out = new AtomicReference<>("");
        inst.runOnMainSync(() -> out.set("progress=" + text(R.id.widget_progress)
                + " quit0=" + text(R.id.quit_0_time) + "/" + text(R.id.quit_0_name)
                + " quit1=" + text(R.id.quit_1_time) + "/" + text(R.id.quit_1_name)
                + " | " + listState()));
        return out.get();
    }

    private static String task(String text, boolean done) {
        return "{\"id\":\"" + text + "\",\"text\":\"" + text + "\",\"done\":" + done + "}";
    }

    /** Nine tasks (two finished) and two habits being broken — more than the old four-row cap. */
    private String busyDay(long now) {
        String[] undone = { "Read", "Water plants", "Journal", "Call mum", "Pay rent", "Floss", "Meditate" };
        StringBuilder items = new StringBuilder();
        for (String name : undone) items.append(task(name, false)).append(',');
        items.append(task("Walk", true)).append(',').append(task("Stretch", true));
        long slip = now - (4 * DAY + 6 * HOUR + 10 * 60_000L);
        Calendar nowCal = Calendar.getInstance();
        nowCal.setTimeInMillis(now);
        int cur = nowCal.get(Calendar.HOUR_OF_DAY) * 60 + nowCal.get(Calendar.MINUTE);
        // A window opening in 25 minutes, so the line is the countdown whatever time the test runs at.
        int riskStart = (cur + 25) % 1440;
        int riskEnd = (cur + 145) % 1440;
        long urge = now - 2 * HOUR - 5 * 60_000L;
        return "{\"date\":\"2026-09-28\",\"done\":2,\"total\":9,\"streak\":12,"
                + "\"items\":[" + items + "],"
                + "\"quitting\":["
                + "{\"id\":\"q1\",\"text\":\"Doomscrolling\",\"state\":\"open\",\"lastSlipAt\":" + slip
                + ",\"lastUrgeAt\":" + urge + ",\"limit\":0,\"count\":0,\"everSlipped\":true,\"risk\":{\"startMin\":" + riskStart + ",\"endMin\":" + riskEnd + "}},"
                + "{\"id\":\"q2\",\"text\":\"Smoking\",\"state\":\"slipped\",\"lastSlipAt\":" + (now - 25 * 60_000L)
                + ",\"lastUrgeAt\":null,\"limit\":5,\"count\":6,\"everSlipped\":true}"
                + "],\"updatedAt\":" + now + "}";
    }

    // ---- the counter's wording, with no host needed ---------------------------------------

    @Test
    public void timeReadsTheSameAsInTheApp() {
        // The same cases as fmtSince in tests/urges.test.mjs, so the two can't drift apart.
        assertEquals("4d 6h", MomentumWidget.since((4 * 24 + 6) * HOUR));
        assertEquals("3d", MomentumWidget.since(3 * DAY));
        assertEquals("3h 20m", MomentumWidget.since(3 * HOUR + 20 * 60_000L));
        assertEquals("3h", MomentumWidget.since(3 * HOUR));
        assertEquals("12m", MomentumWidget.since(12 * 60_000L));
        assertEquals("0m", MomentumWidget.since(0));
        assertEquals("", MomentumWidget.since(-1));
    }

    @Test
    public void theLineUnderTheCounterSaysWhereTheDayStands() throws Exception {
        long now = System.currentTimeMillis();
        JSONObject open = new JSONObject("{\"state\":\"open\",\"everSlipped\":true,\"limit\":0,\"lastUrgeAt\":"
                + (now - 2 * HOUR - 5 * 60_000L) + "}");
        assertEquals("since the last slip · last urge 2h 5m ago", MomentumWidget.quitDetail(context, open, now));

        JSONObject limited = new JSONObject("{\"state\":\"open\",\"everSlipped\":true,\"limit\":3,\"count\":2}");
        assertEquals("2 of 3 today · since the last slip · no urges logged yet",
                MomentumWidget.quitDetail(context, limited, now));

        JSONObject fresh = new JSONObject("{\"state\":\"open\",\"everSlipped\":false,\"limit\":0}");
        assertEquals("since you started · no urges logged yet", MomentumWidget.quitDetail(context, fresh, now));

        JSONObject slipped = new JSONObject("{\"state\":\"slipped\",\"everSlipped\":true,\"limit\":0}");
        assertEquals("since you slipped today · no urges logged yet", MomentumWidget.quitDetail(context, slipped, now));
    }

    // ---- the risk line, with no host needed -------------------------------------------------

    private static long at(int hour, int minute) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, hour);
        c.set(Calendar.MINUTE, minute);
        c.set(Calendar.SECOND, 30);
        return c.getTimeInMillis();
    }

    private static JSONObject window(int startMin, int endMin) throws Exception {
        return new JSONObject("{\"risk\":{\"startMin\":" + startMin + ",\"endMin\":" + endMin + "}}");
    }

    @Test
    public void theRiskLineCountsDownByItself() throws Exception {
        // A window of 8:00pm to 10:30pm, as the app sends it: minutes since midnight.
        JSONObject evening = window(20 * 60, 22 * 60 + 30);
        assertEquals("in the afternoon, just the span", true,
                MomentumWidget.riskLine(evening, at(15, 0)).startsWith("Risk window ") && MomentumWidget.riskLine(evening, at(15, 0)).contains("\u2013"));
        assertEquals("forty minutes out, the countdown", true, MomentumWidget.riskLine(evening, at(19, 20)).startsWith("Risk window opens in 40 min \u00B7 "));
        assertEquals("a minute out", true, MomentumWidget.riskLine(evening, at(19, 59)).startsWith("Risk window opens in 1 min"));
        assertEquals("inside it", true, MomentumWidget.riskLine(evening, at(21, 0)).startsWith("In your risk window \u00B7 until "));
        assertEquals("on the first minute of it", true, MomentumWidget.riskLine(evening, at(20, 0)).startsWith("In your risk window"));
        assertEquals("after it, back to the span: it's tomorrow's now", true, MomentumWidget.riskLine(evening, at(23, 0)).startsWith("Risk window 8:00"));
        String ended = MomentumWidget.riskLine(evening, at(22, 30));
        assertEquals("on the minute it ends it is over: the span, not 'in your window'", true,
                ended.startsWith("Risk window ") && !ended.startsWith("Risk window opens") && !ended.startsWith("In your"));
    }

    @Test
    public void aRiskWindowThatCrossesMidnightIsHandled() throws Exception {
        // 11pm to 1:30am: it ends at an earlier minute than it starts.
        JSONObject late = window(23 * 60, 90);
        assertEquals("at half past eleven: inside", true, MomentumWidget.riskLine(late, at(23, 30)).startsWith("In your risk window \u00B7 until "));
        assertEquals("at half past midnight: still inside", true, MomentumWidget.riskLine(late, at(0, 30)).startsWith("In your risk window"));
        assertEquals("at noon: just the span", true, MomentumWidget.riskLine(late, at(12, 0)).startsWith("Risk window "));
        assertEquals("at twenty past ten: forty minutes out", true, MomentumWidget.riskLine(late, at(22, 20)).startsWith("Risk window opens in 40 min"));
        String passed = MomentumWidget.riskLine(late, at(2, 0));
        assertEquals("at two in the morning it has passed", true, passed.startsWith("Risk window ") && !passed.startsWith("Risk window opens") && !passed.startsWith("In your"));
    }

    @Test
    public void noRiskLineUntilThereIsAWindowToShow() throws Exception {
        long now = System.currentTimeMillis();
        assertEquals("no window learned yet", "", MomentumWidget.riskLine(new JSONObject("{}"), now));
        assertEquals("a null one", "", MomentumWidget.riskLine(new JSONObject("{\"risk\":null}"), now));
        assertEquals("one with a missing end", "", MomentumWidget.riskLine(new JSONObject("{\"risk\":{\"startMin\":1200}}"), now));
        assertEquals("nonsense minutes", "", MomentumWidget.riskLine(window(-5, 99999), now));
    }

    // ---- the list service, with no host needed --------------------------------------------

    @Test
    public void theListHasEveryTaskNotTheFirstFour() {
        snapshot(busyDay(System.currentTimeMillis()));
        MomentumWidgetService.Factory factory = new MomentumWidgetService.Factory(context);
        factory.onDataSetChanged();
        assertEquals("all nine tasks", 9, factory.getCount());

        final AtomicReference<String> first = new AtomicReference<>();
        final AtomicReference<String> last = new AtomicReference<>();
        inst.runOnMainSync(() -> {
            View a = factory.getViewAt(0).apply(context, new android.widget.FrameLayout(context));
            View z = factory.getViewAt(8).apply(context, new android.widget.FrameLayout(context));
            first.set(((TextView) a.findViewById(R.id.task_text)).getText().toString());
            last.set(((TextView) z.findViewById(R.id.task_text)).getText().toString());
        });
        assertEquals("what's still to do comes first", "○  Read", first.get());
        assertEquals("what's finished goes last, ticked", "✓  Stretch", last.get());
    }

    @Test
    public void aMissingOrBrokenSnapshotIsAnEmptyListNotACrash() {
        MomentumWidgetService.Factory factory = new MomentumWidgetService.Factory(context);
        factory.onDataSetChanged();
        assertEquals("nothing saved yet", 0, factory.getCount());
        snapshot("{this is not json");
        factory.onDataSetChanged();
        assertEquals("garbage in the store", 0, factory.getCount());
    }

    // ---- the real widget, drawn in a real host --------------------------------------------

    @Test
    public void theWidgetDrawsWithABigCounterAndEveryTask() throws Exception {
        snapshot(busyDay(System.currentTimeMillis()));
        placeWidget();

        waitFor("the counter to appear", () -> "4d 6h".equals(text(R.id.quit_0_time)));
        assertEquals("the day's progress", "2 / 9", text(R.id.widget_progress));
        assertTrue("the first habit shows when its risk window opens (" + text(R.id.quit_0_risk) + ")",
                text(R.id.quit_0_risk) != null && text(R.id.quit_0_risk).startsWith("Risk window opens in 25 min"));
        final int[] riskVisible = new int[2];
        inst.runOnMainSync(() -> {
            riskVisible[0] = hostView.findViewById(R.id.quit_0_risk).getVisibility();
            riskVisible[1] = hostView.findViewById(R.id.quit_1_risk).getVisibility();
        });
        assertEquals("...visible", View.VISIBLE, riskVisible[0]);
        assertEquals("the second has no learned window, so no line", View.GONE, riskVisible[1]);
        assertEquals("the habit's name sits beside its counter", "Doomscrolling", text(R.id.quit_0_name));
        assertTrue("the second habit is shown too", text(R.id.quit_1_time) != null && !text(R.id.quit_1_time).isEmpty());
        assertEquals("a slip today shows the (short) time since it", "25m", text(R.id.quit_1_time));
        assertTrue("its line says how the day stands", text(R.id.quit_1_detail).startsWith("6 of 5 today"));

        final float[] sizes = new float[2];
        final boolean[] urgeWired = new boolean[2];
        final int[] visibility = new int[2];
        inst.runOnMainSync(() -> {
            sizes[0] = ((TextView) hostView.findViewById(R.id.quit_0_time)).getTextSize();
            sizes[1] = ((TextView) hostView.findViewById(R.id.widget_progress)).getTextSize();
            View u0 = hostView.findViewById(R.id.quit_0_urge);
            View u1 = hostView.findViewById(R.id.quit_1_urge);
            urgeWired[0] = u0.hasOnClickListeners();
            urgeWired[1] = u1.hasOnClickListeners();
            visibility[0] = hostView.findViewById(R.id.quit_0).getVisibility();
            visibility[1] = hostView.findViewById(R.id.quit_1).getVisibility();
        });
        assertTrue("the counter is the biggest text on the widget (" + sizes[0] + " vs " + sizes[1] + ")", sizes[0] > sizes[1]);
        assertTrue("each Urge button does something when tapped", urgeWired[0] && urgeWired[1]);
        assertEquals("both habit blocks are visible", View.VISIBLE, visibility[0]);
        assertEquals(View.VISIBLE, visibility[1]);

        // The list: the part that used to stop at four.
        final ListView[] list = new ListView[1];
        inst.runOnMainSync(() -> list[0] = hostView.findViewById(R.id.widget_list));
        assertNotNull("the widget has a list", list[0]);
        waitFor("the list to hold all nine tasks", () -> list[0].getAdapter() != null && list[0].getAdapter().getCount() == 9);
        // Only now has the list been shown (it is hidden while it has nothing), so only now can it have a height.
        waitFor("the list to be tall enough for at least one and a half rows", () -> list[0].getHeight() >= px(40));
        waitFor("the first row to draw", () -> {
            if (list[0].getChildCount() == 0) return false;
            View row = list[0].getChildAt(0).findViewById(R.id.task_text);
            return row instanceof TextView && ((TextView) row).getText().toString().contains("Read");
        });
    }

    // ---- red zones: hours the person set, on certain days ----------------------------------

    private static long at(int y, int month, int d, int h, int mi) {
        Calendar c = Calendar.getInstance();
        c.clear();
        c.set(y, month - 1, d, h, mi, 0);
        return c.getTimeInMillis();
    }

    private static JSONObject habitWithZones(String zonesJson) throws Exception {
        return new JSONObject("{\"id\":\"q\",\"text\":\"x\",\"zones\":" + zonesJson + "}");
    }

    private static final String EVERY_NIGHT = "[{\"days\":[0,1,2,3,4,5,6],\"startMin\":1320,\"endMin\":0}]";

    @Test
    public void insideARedZoneItSaysSoInCapitals() throws Exception {
        // Thursday 8 Oct 2026, 22:30: ten at night to midnight, every night.
        long now = at(2026, 10, 8, 22, 30);
        JSONObject q = habitWithZones(EVERY_NIGHT);
        assertEquals(MomentumWidget.RISK_NOW, MomentumWidget.riskUntil(q, now));
        assertTrue(MomentumWidget.riskLine(q, now), MomentumWidget.riskLine(q, now).startsWith("RED ZONE \u00B7 until "));
        assertEquals("red while it runs", 0xFFE5736B, MomentumWidget.riskColor(q, now));
    }

    @Test
    public void aRedZoneCountsDownLikeALearnedWindowDoes() throws Exception {
        JSONObject q = habitWithZones(EVERY_NIGHT);
        assertTrue(MomentumWidget.riskLine(q, at(2026, 10, 8, 21, 35)), MomentumWidget.riskLine(q, at(2026, 10, 8, 21, 35)).startsWith("Red zone opens in 25 min"));
        assertEquals("gold until it starts", 0xFFE8B75D, MomentumWidget.riskColor(q, at(2026, 10, 8, 21, 35)));
        assertTrue("far off, it just says when", MomentumWidget.riskLine(q, at(2026, 10, 8, 15, 0)).startsWith("Red zone "));
        assertFalse(MomentumWidget.riskLine(q, at(2026, 10, 8, 15, 0)).contains("opens in"));
    }

    @Test
    public void aRedZoneIsOnlyOnTheDaysItWasSetFor() throws Exception {
        // Weekends only: 6 = Saturday, 0 = Sunday.
        JSONObject weekends = habitWithZones("[{\"days\":[0,6],\"startMin\":840,\"endMin\":1080}]");
        assertEquals("a Saturday afternoon is inside it", MomentumWidget.RISK_NOW, MomentumWidget.riskUntil(weekends, at(2026, 10, 10, 15, 0)));
        assertEquals("a Thursday afternoon is not", MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(weekends, at(2026, 10, 8, 15, 0)));
        assertEquals("and says nothing", "", MomentumWidget.riskLine(weekends, at(2026, 10, 8, 15, 0)));
        assertEquals("Friday afternoon: Saturday's hours aren't a heads-up yet", MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(weekends, at(2026, 10, 9, 15, 0)));
    }

    @Test
    public void aZoneThatRunsPastMidnightBelongsToTheDayItStartedOn() throws Exception {
        // Friday (5) 22:00 to 02:00.
        JSONObject fri = habitWithZones("[{\"days\":[5],\"startMin\":1320,\"endMin\":120}]");
        assertEquals("Friday night", MomentumWidget.RISK_NOW, MomentumWidget.riskUntil(fri, at(2026, 10, 9, 23, 0)));
        assertEquals("1 am on Saturday is still Friday's zone", MomentumWidget.RISK_NOW, MomentumWidget.riskUntil(fri, at(2026, 10, 10, 1, 0)));
        assertEquals("but Saturday night is not", MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(fri, at(2026, 10, 10, 23, 0)));
        assertEquals("and 1 am on Friday is not either, since Thursday has none", MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(fri, at(2026, 10, 9, 1, 0)));
        assertEquals("it ends when it ends", MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(fri, at(2026, 10, 10, 2, 0)));
    }

    @Test
    public void aZoneStartingJustAfterMidnightIsAHeadsUpTheNightBefore() throws Exception {
        // Saturday (6) from 00:30: at 23:45 on Friday that is 45 minutes away.
        JSONObject sat = habitWithZones("[{\"days\":[6],\"startMin\":30,\"endMin\":180}]");
        assertEquals(45, MomentumWidget.riskUntil(sat, at(2026, 10, 9, 23, 45)));
        assertEquals("but not three hours before", MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(sat, at(2026, 10, 9, 21, 0)));
    }

    @Test
    public void theSoonestOfSeveralZonesIsTheOneShown() throws Exception {
        JSONObject q = habitWithZones("[{\"days\":[0,1,2,3,4,5,6],\"startMin\":1320,\"endMin\":0},{\"days\":[0,1,2,3,4,5,6],\"startMin\":1050,\"endMin\":1200}]");
        // 17:00: the 17:30 one is next, not the 22:00 one.
        assertEquals(30, MomentumWidget.riskUntil(q, at(2026, 10, 8, 17, 0)));
        // 18:00: inside the 17:30 to 20:00 one.
        assertEquals(MomentumWidget.RISK_NOW, MomentumWidget.riskUntil(q, at(2026, 10, 8, 18, 0)));
    }

    @Test
    public void aRedZoneComesBeforeTheLearnedWindow() throws Exception {
        JSONObject q = new JSONObject("{\"zones\":" + EVERY_NIGHT + ",\"risk\":{\"startMin\":720,\"endMin\":780}}");
        assertTrue("at 22:30 the zone, not the lunchtime window", MomentumWidget.riskLine(q, at(2026, 10, 8, 22, 30)).startsWith("RED ZONE"));
        assertTrue("with no zone near, the learned window speaks, in its own words",
                MomentumWidget.riskLine(new JSONObject("{\"zones\":[{\"days\":[6],\"startMin\":840,\"endMin\":1080}],\"risk\":{\"startMin\":720,\"endMin\":780}}"), at(2026, 10, 8, 11, 45)).startsWith("Risk window opens in 15 min"));
    }

    @Test
    public void brokenZonesAreIgnoredNotACrash() throws Exception {
        JSONObject q = habitWithZones("[{\"days\":[0,1],\"startMin\":-5,\"endMin\":60},{\"startMin\":600,\"endMin\":700},{\"days\":[0,1,2,3,4,5,6],\"startMin\":600,\"endMin\":600},\"x\",null]");
        assertEquals(MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(q, at(2026, 10, 8, 10, 30)));
        assertEquals("", MomentumWidget.riskLine(q, at(2026, 10, 8, 10, 30)));
        assertEquals(MomentumWidget.RISK_UNKNOWN, MomentumWidget.riskUntil(new JSONObject("{}"), at(2026, 10, 8, 10, 30)));
    }

    @Test
    public void theWidgetShowsARunningRedZoneOnTheHabit() throws Exception {
        long now = System.currentTimeMillis();
        Calendar c = Calendar.getInstance();
        int cur = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        String zone = "[{\"days\":[0,1,2,3,4,5,6],\"startMin\":" + ((cur + 1430) % 1440) + ",\"endMin\":" + ((cur + 90) % 1440) + "}]";
        String base = busyDay(now);
        // The first habit gets a zone that is running right now, whatever time the test runs at.
        snapshot(base.replace("\"everSlipped\":true,\"risk\":", "\"everSlipped\":true,\"zones\":" + zone + ",\"risk\":"));
        placeWidget();
        waitFor("the counter to appear", () -> "4d 6h".equals(text(R.id.quit_0_time)));
        assertTrue("the red zone, not the learned window (" + text(R.id.quit_0_risk) + ")",
                text(R.id.quit_0_risk) != null && text(R.id.quit_0_risk).startsWith("RED ZONE"));
        final int[] color = new int[1];
        inst.runOnMainSync(() -> color[0] = ((TextView) hostView.findViewById(R.id.quit_0_risk)).getCurrentTextColor());
        assertEquals("in red", 0xFFE5736B, color[0]);
    }

    // ---- your notes, turning ----------------------------------------------------------------

    private String withPep(long now, String pepJson) {
        String base = busyDay(now);
        return base.substring(0, base.lastIndexOf("}")) + ",\"pep\":" + pepJson + "}";
    }

    @Test
    public void yourNotesTurnThroughOnTheWidget() throws Exception {
        snapshot(withPep(System.currentTimeMillis(), "[\"I walked instead.\",\"Told a friend.\",\"I want my evenings back.\"]"));
        placeWidget();
        waitFor("the counter to appear", () -> "4d 6h".equals(text(R.id.quit_0_time)));
        final int[] seen = new int[4];
        final String[] first = new String[1];
        final boolean[] animated = new boolean[1];
        inst.runOnMainSync(() -> {
            android.widget.ViewFlipper f = hostView.findViewById(R.id.pep_flipper);
            seen[0] = f.getVisibility();
            seen[1] = f.getChildCount();
            seen[2] = f.getFlipInterval();
            animated[0] = f.getInAnimation() != null && f.getOutAnimation() != null;
            first[0] = ((TextView) f.getChildAt(0).findViewById(R.id.pep_text)).getText().toString();
        });
        assertEquals("the flipper shows", View.VISIBLE, seen[0]);
        assertEquals("one turn per note", 3, seen[1]);
        assertEquals("a slow turn, nine seconds", 9000, seen[2]);
        assertTrue("fading in and out", animated[0]);
        assertEquals("in your own words, in quotes", "\u201CI walked instead.\u201D", first[0]);
        // The list still has room: the flipper must not have taken it all.
        final int[] listHeight = new int[1];
        waitFor("the list to be tall enough beside the notes", () -> {
            ListView l = hostView.findViewById(R.id.widget_list);
            listHeight[0] = l.getHeight();
            return l.getHeight() >= px(36);
        });
    }

    @Test
    public void noNotesNoFlipper() throws Exception {
        snapshot(withPep(System.currentTimeMillis(), "[]"));
        placeWidget();
        waitFor("the counter to appear", () -> "4d 6h".equals(text(R.id.quit_0_time)));
        final int[] v = new int[2];
        inst.runOnMainSync(() -> {
            android.widget.ViewFlipper f = hostView.findViewById(R.id.pep_flipper);
            v[0] = f.getVisibility();
            v[1] = f.getChildCount();
        });
        assertEquals(View.GONE, v[0]);
        assertEquals(0, v[1]);
    }

    @Test
    public void blankAndExcessNotesAreHandled() throws Exception {
        snapshot(withPep(System.currentTimeMillis(), "[\"\",\"  \",\"a\",\"b\",\"c\",\"d\",\"e\",\"f\",\"g\",\"h\"]"));
        placeWidget();
        waitFor("the counter to appear", () -> "4d 6h".equals(text(R.id.quit_0_time)));
        final int[] n = new int[1];
        inst.runOnMainSync(() -> n[0] = ((android.widget.ViewFlipper) hostView.findViewById(R.id.pep_flipper)).getChildCount());
        // The cap counts the first six entries of the list, blanks included, then blanks are skipped.
        assertTrue("blanks skipped, never more than " + MomentumWidget.MAX_PEP + ": " + n[0], n[0] >= 1 && n[0] <= MomentumWidget.MAX_PEP);
    }

    @Test
    public void aWidgetWithNothingSavedYetDrawsInsteadOfFailing() throws Exception {
        // First launch, before the app has written anything: no snapshot at all.
        placeWidget();
        waitFor("the placeholder", () -> "—".equals(text(R.id.widget_progress)));
        final int[] visibility = new int[3];
        inst.runOnMainSync(() -> {
            visibility[0] = hostView.findViewById(R.id.quit_0).getVisibility();
            visibility[1] = hostView.findViewById(R.id.quit_1).getVisibility();
            visibility[2] = hostView.findViewById(R.id.quit_divider).getVisibility();
        });
        assertEquals("no habit blocks", View.GONE, visibility[0]);
        assertEquals(View.GONE, visibility[1]);
        assertEquals("...and no divider under nothing", View.GONE, visibility[2]);
    }

    @Test
    public void aBrokenSnapshotDrawsThePlaceholderToo() throws Exception {
        snapshot("{this is not json");
        placeWidget();
        waitFor("the placeholder", () -> "—".equals(text(R.id.widget_progress)));
    }
}
