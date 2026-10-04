package com.momentum.app;

import static org.junit.Assert.assertEquals;
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

    /** Sized like a 4x3 widget, so the list has room to show rows in. */
    private void layOut() {
        inst.runOnMainSync(() -> {
            int w = px(290), h = px(260);
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
                int w = px(290), h = px(260);
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

    private String describe() {
        final AtomicReference<String> out = new AtomicReference<>("");
        inst.runOnMainSync(() -> out.set("progress=" + text(R.id.widget_progress)
                + " quit0=" + text(R.id.quit_0_time) + "/" + text(R.id.quit_0_name)
                + " quit1=" + text(R.id.quit_1_time) + "/" + text(R.id.quit_1_name)));
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
        long urge = now - 2 * HOUR - 5 * 60_000L;
        return "{\"date\":\"2026-09-28\",\"done\":2,\"total\":9,\"streak\":12,"
                + "\"items\":[" + items + "],"
                + "\"quitting\":["
                + "{\"id\":\"q1\",\"text\":\"Doomscrolling\",\"state\":\"open\",\"lastSlipAt\":" + slip
                + ",\"lastUrgeAt\":" + urge + ",\"limit\":0,\"count\":0,\"everSlipped\":true},"
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
        waitFor("the first row to draw", () -> {
            if (list[0].getChildCount() == 0) return false;
            View row = list[0].getChildAt(0).findViewById(R.id.task_text);
            return row instanceof TextView && ((TextView) row).getText().toString().contains("Read");
        });
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
