package com.momentum.app;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.DateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * Home-screen widget: today's progress, the habits being broken with a big clean-time counter
 * and an Urge button each, and every task for today in a list that scrolls.
 *
 * The web app writes a small JSON snapshot through Capacitor Preferences, which lands in the
 * SharedPreferences file below. The widget only ever reads that snapshot — it never parses
 * the app's full state, so a schema change in the app cannot break the home screen.
 *
 * NOT YET RUN ON A DEVICE. It was written without an Android toolchain, and is now compiled on
 * every push by .github/workflows/android.yml, and its layout and list are inflated on an
 * emulator by the widget instrumentation test — but nobody has yet put this widget on a real
 * home screen and tapped it. A review by hand before it was ever compiled found three faults
 * that would each have stopped it working — an unexported receiver, an unbound XML namespace,
 * a missing Preferences plugin — and a fourth (a bare View in the layout) that a compiler
 * would not have caught either.
 */
public class MomentumWidget extends AppWidgetProvider {

    /** Capacitor Preferences writes to this file with no group configured. */
    private static final String PREFS = "CapacitorStorage";
    private static final String KEY = "momentum:widget";
    private static final int MAX_QUITTING = 2;
    /** How many of your notes the widget turns through. */
    static final int MAX_PEP = 6;
    /** The scheme the Urge buttons open the app with. Read back in MainActivity. */
    static final String URGE_SCHEME = "momentum";
    static final String URGE_HOST = "urge";

    /**
     * Android won't update a widget more than every half hour on its own, which would leave a
     * counter reading "3h 20m" for most of that half hour. So while a widget is on a home screen,
     * it nudges itself along more often than that.
     */
    static final String TICK_ACTION = "com.momentum.app.WIDGET_TICK";
    static final long TICK_MS = 15 * 60_000L;

    /** Where the widget leaves what was tapped on it for the app to collect. Must match PENDING_TICK_KEY and PENDING_VIRTUE_KEY in src/lib/widget.js. */
    static final String PENDING_TICK_KEY = "momentum:pendingTick";
    static final String PENDING_VIRTUE_KEY = "momentum:pendingVirtue";
    /** Taps on the widget that do not open the app: a usual payment, a virtue answer, "I held it". */
    static final String ACTION_CHIP = "com.momentum.app.WIDGET_CHIP";
    static final String ACTION_VIRTUE = "com.momentum.app.WIDGET_VIRTUE";
    static final String ACTION_HELD = "com.momentum.app.WIDGET_HELD";
    /** Gives each button its own PendingIntent: extras don't make two of them different, a data URI does. */
    static final String ACTION_SCHEME = "momentum-widget";
    static final int MAX_CHIPS = 3;

    private static final int COLOR_CLEAN = 0xFF5FC7C0;
    private static final int COLOR_SLIPPED = 0xFFE5736B;
    private static final int COLOR_WARN = 0xFFE8B75D;

    private static final long MINUTE = 60_000L;
    private static final long HOUR = 60 * MINUTE;
    private static final long DAY = 24 * HOUR;

    /** One task in the list. */
    static final class Item {
        final String id;
        final String text;
        final boolean done;

        Item(String id, String text, boolean done) {
            this.id = id;
            this.text = text;
            this.done = done;
        }
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        scheduleTick(context);
    }

    @Override
    public void onEnabled(Context context) {
        scheduleTick(context);
    }

    @Override
    public void onDisabled(Context context) {
        cancelTickIfNone(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent == null ? null : intent.getAction();
        if (TICK_ACTION.equals(action)) {
            refresh(context);
            if (anyWidgets(context)) scheduleTick(context);
        } else if (ACTION_CHIP.equals(action)) {
            handleChip(context, intent);
        } else if (ACTION_VIRTUE.equals(action)) {
            handleVirtue(context, intent);
        } else if (ACTION_HELD.equals(action)) {
            handleHeld(context, intent);
        }
    }

    /** Whether any of the three widgets is on a home screen: the refresh alarm only runs while one is. */
    static boolean anyWidgets(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        return manager.getAppWidgetIds(new ComponentName(context, MomentumWidget.class)).length > 0
                || manager.getAppWidgetIds(new ComponentName(context, MomentumUrgeWidget.class)).length > 0
                || manager.getAppWidgetIds(new ComponentName(context, MomentumCleanWidget.class)).length > 0;
    }

    static void cancelTickIfNone(Context context) {
        if (anyWidgets(context)) return;
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms != null) alarms.cancel(tickIntent(context));
    }

    private static PendingIntent tickIntent(Context context) {
        Intent tick = new Intent(context, MomentumWidget.class).setAction(TICK_ACTION);
        return PendingIntent.getBroadcast(context, 1, tick,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** RTC rather than a waking alarm: it only matters while the screen could be looking at it. */
    static void scheduleTick(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) return;
        alarms.set(AlarmManager.RTC, System.currentTimeMillis() + TICK_MS, tickIntent(context));
    }

    /** Called by the app after a snapshot write, so the widget updates on completion. */
    public static void refresh(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, MomentumWidget.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) render(context, manager, id);
        MomentumUrgeWidget.refresh(context);
        MomentumCleanWidget.refresh(context);
    }

    static String since(long ms) {
        if (ms < 0) return "";
        long d = ms / DAY;
        long h = (ms % DAY) / HOUR;
        long m = (ms % HOUR) / MINUTE;
        if (d > 0) return h > 0 ? d + "d " + h + "h" : d + "d";
        if (h > 0) return m > 0 ? h + "h " + m + "m" : h + "h";
        return m + "m";
    }

    private static JSONObject snapshot(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            // A malformed snapshot shows the empty state rather than crashing the launcher's
            // widget host.
            return null;
        }
    }

    private static boolean writeSnapshot(Context context, JSONObject s) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, s.toString()).commit();
    }

    /** The date as the app writes it, in the phone's own time. */
    static String dateOf(long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        return String.format(Locale.US, "%04d-%02d-%02d", c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static int minuteOfDay(long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    /** Whether the snapshot is for today: after midnight, until the app writes again, it is yesterday's, and shouldn't be tapped as if it were today's. */
    static boolean isFresh(JSONObject snapshot, long now) {
        return snapshot != null && dateOf(now).equals(snapshot.optString("date", ""));
    }

    /**
     * A tick tapped on a row: the row flips at once, and the tick is kept for the app to record. False when the snapshot is not today's
     * or the task is not in it, in which case the caller opens the app instead.
     */
    static boolean applyTick(Context context, String taskId, long now) {
        if (taskId == null || taskId.isEmpty()) return false;
        JSONObject s = snapshot(context);
        if (!isFresh(s, now)) return false;
        JSONArray items = s.optJSONArray("items");
        if (items == null) return false;
        try {
            for (int i = 0; i < items.length(); i++) {
                JSONObject it = items.optJSONObject(i);
                if (it == null || !taskId.equals(it.optString("id", ""))) continue;
                boolean nowDone = !it.optBoolean("done", false);
                it.put("done", nowDone);
                s.put("done", Math.max(0, s.optInt("done", 0) + (nowDone ? 1 : -1)));
                MomentumShade.appendPending(context, PENDING_TICK_KEY,
                        new JSONObject().put("taskId", taskId).put("date", s.optString("date")).put("done", nowDone).put("at", now));
                writeSnapshot(context, s);
                refresh(context);
                return true;
            }
        } catch (Exception ignored) { }
        return false;
    }

    /** One of the evening question's three answers, tapped on the widget. */
    static void handleVirtue(Context context, Intent intent) {
        int score = intent.getIntExtra("score", -1);
        long now = System.currentTimeMillis();
        JSONObject s = snapshot(context);
        if (score < 0 || score > 2 || !isFresh(s, now)) { refresh(context); return; }
        JSONObject v = s.optJSONObject("virtue");
        if (v == null || !v.optBoolean("ask", false)) { refresh(context); return; }
        try {
            MomentumShade.appendPending(context, PENDING_VIRTUE_KEY,
                    new JSONObject().put("date", s.optString("date")).put("score", score).put("at", now));
            v.put("ask", false);
            v.put("line", v.optString("name", "") + " \u00B7 " + context.getString(virtueWord(score)) + " today");
            writeSnapshot(context, s);
        } catch (Exception ignored) { }
        refresh(context);
    }

    private static int virtueWord(int score) {
        return score == 2 ? R.string.widget_virtue_lived : score == 1 ? R.string.widget_virtue_partly : R.string.widget_virtue_missed;
    }

    /** A usual payment tapped on the widget: logged as if it had been typed, with the same Undo the notification offers. */
    static void handleChip(Context context, Intent intent) {
        double amount = intent.getDoubleExtra("amount", 0);
        String catId = intent.getStringExtra("catId");
        String payee = intent.getStringExtra("payee");
        if (!(amount > 0) || catId == null || catId.isEmpty()) return;
        long now = System.currentTimeMillis();
        MoneyParse.Payment p = new MoneyParse.Payment();
        p.amount = amount;
        p.catId = catId;
        p.payee = payee == null ? "" : payee;
        p.type = "expense";
        p.via = "typed";
        p.date = MoneyParse.today(now);
        JSONObject rec = MomentumMoney.record(p, now);
        if (rec == null || !MomentumMoney.savePending(context, rec)) return;
        NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null && nm.areNotificationsEnabled()) {
            MomentumMoney.ensureChannels(nm, context);
            int nid = MomentumMoney.notificationId(rec.optString("key", rec.optString("id")));
            nm.notify(nid, MomentumMoney.savedNotification(context, MomentumMoney.config(context), p, rec, nid));
        }
        refresh(context);
    }

    /** "I held it" on the widget: recorded the way the notification records it, and gone from both. */
    static void handleHeld(Context context, Intent intent) {
        MomentumShade.handleHeld(context, intent);
        refresh(context);
    }

    /** What has been logged from here or the notification that the app has not collected yet, so the total is right straight away and after an Undo. */
    static double pendingSpendToday(Context context, long now) {
        double sum = 0;
        String today = dateOf(now);
        JSONArray all = MomentumMoney.pending(context);
        for (int i = 0; i < all.length(); i++) {
            JSONObject o = all.optJSONObject(i);
            if (o != null && "expense".equals(o.optString("type", "")) && today.equals(o.optString("date", ""))) sum += o.optDouble("amount", 0);
        }
        return sum;
    }

    /** The first habit being quit in the snapshot, which the small widgets are about; null if none. */
    static JSONObject firstQuit(Context context) {
        JSONObject s = snapshot(context);
        JSONArray q = s == null ? null : s.optJSONArray("quitting");
        if (q == null) return null;
        for (int i = 0; i < q.length(); i++) {
            JSONObject o = q.optJSONObject(i);
            if (o != null && !o.optString("id", "").isEmpty()) return o;
        }
        return null;
    }

    /** The Urge deep link for a habit: the same one the big widget's button opens. */
    static PendingIntent urgeIntent(Context context, String id, int requestCode) {
        Intent urge = new Intent(context, MainActivity.class)
                .setAction(Intent.ACTION_VIEW)
                .setData(new Uri.Builder().scheme(URGE_SCHEME).authority(URGE_HOST).appendPath(id).build())
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, urge, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** A button on the widget that tells this class something without opening the app. */
    private static PendingIntent tap(Context context, String action, String host, String path, int requestCode, Intent extras) {
        Intent i = new Intent(context, MomentumWidget.class).setAction(action)
                .setData(new Uri.Builder().scheme(ACTION_SCHEME).authority(host).appendPath(path).build());
        if (extras != null && extras.getExtras() != null) i.putExtras(extras.getExtras());
        return PendingIntent.getBroadcast(context, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Every task in the snapshot, in the order the app wrote them. */
    static List<Item> readItems(Context context) {
        List<Item> out = new ArrayList<>();
        JSONObject snapshot = snapshot(context);
        if (snapshot == null) return out;
        JSONArray items = snapshot.optJSONArray("items");
        if (items == null) return out;
        for (int i = 0; i < items.length(); i++) {
            JSONObject item = items.optJSONObject(i);
            if (item == null) continue;
            out.add(new Item(item.optString("id", ""), item.optString("text", ""), item.optBoolean("done", false)));
        }
        return out;
    }

    /** The line under a counter: where the day stands, and when the last urge was. */
    static String quitDetail(Context context, JSONObject q, long now) {
        boolean slipped = "slipped".equals(q.optString("state", ""));
        int limit = q.optInt("limit", 0);
        StringBuilder detail = new StringBuilder();
        if (limit > 0) detail.append(q.optInt("count", 0)).append(" of ").append(limit).append(" today · ");
        detail.append(context.getString(slipped ? R.string.widget_since_slipped_today
                : q.optBoolean("everSlipped", false) ? R.string.widget_since_slip : R.string.widget_since_start));
        long lastUrge = q.optLong("lastUrgeAt", 0L);
        detail.append(" · ");
        if (lastUrge > 0 && now >= lastUrge) {
            detail.append("last urge ").append(since(now - lastUrge)).append(" ago");
        } else {
            detail.append(context.getString(R.string.widget_no_urges));
        }
        return detail.toString();
    }

    static String clockOf(int minuteOfDay) {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, minuteOfDay / 60);
        c.set(Calendar.MINUTE, minuteOfDay % 60);
        c.set(Calendar.SECOND, 0);
        return DateFormat.getTimeInstance(DateFormat.SHORT).format(c.getTime());
    }

    /** Returned by {@link #riskUntil} when there is no window to count down to. */
    static final int RISK_UNKNOWN = -2;
    /** Returned by {@link #riskUntil} while the window is open. */
    static final int RISK_NOW = -1;

    /**
     * Where now falls against a hard stretch. {@code minutes} is {@link #RISK_NOW} while inside it, or how long until it
     * opens. {@code zone} says whether it is hours the person set (a red zone) rather than ones the app learned.
     */
    static final class Risk {
        final int minutes;
        final int startMin;
        final int endMin;
        final boolean zone;

        Risk(int minutes, int startMin, int endMin, boolean zone) {
            this.minutes = minutes;
            this.startMin = startMin;
            this.endMin = endMin;
            this.zone = zone;
        }
    }

    private static boolean hasDay(JSONArray days, int dow) {
        if (days == null) return false;
        for (int i = 0; i < days.length(); i++) if (days.optInt(i, -1) == dow) return true;
        return false;
    }

    /**
     * The red zone, if there's one today or about to be: inside one, or the nearest that opens later today
     * or within 90 minutes after midnight. Zones belong to the day they start on, so one that began last
     * night is still running this morning. Null when none of the habit's zones is anywhere near, in which
     * case the learned window gets its say.
     */
    private static Risk zoneRisk(JSONObject q, long now) {
        JSONArray zones = q.optJSONArray("zones");
        if (zones == null || zones.length() == 0) return null;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        int dow = c.get(Calendar.DAY_OF_WEEK) - 1;          // 0 = Sunday, as the app sends it
        int prev = (dow + 6) % 7;
        int next = (dow + 1) % 7;
        int current = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        Risk soonest = null;
        for (int i = 0; i < zones.length(); i++) {
            JSONObject z = zones.optJSONObject(i);
            if (z == null) continue;
            int start = z.optInt("startMin", -1);
            int end = z.optInt("endMin", -1);
            if (start < 0 || end < 0 || start > 1439 || end > 1439 || start == end) continue;
            JSONArray days = z.optJSONArray("days");
            boolean wraps = end <= start;
            boolean inside = wraps
                    ? (hasDay(days, dow) && current >= start) || (hasDay(days, prev) && current < end)
                    : hasDay(days, dow) && current >= start && current < end;
            if (inside) return new Risk(RISK_NOW, start, end, true);
            int until = -1;
            if (hasDay(days, dow) && current < start) until = start - current;
            else if (hasDay(days, next) && 1440 - current + start <= 90) until = 1440 - current + start;
            if (until >= 0 && (soonest == null || until < soonest.minutes)) soonest = new Risk(until, start, end, true);
        }
        return soonest;
    }

    private static Risk learnedRisk(JSONObject q, long now) {
        JSONObject r = q.optJSONObject("risk");
        if (r == null) return null;
        int start = r.optInt("startMin", -1);
        int end = r.optInt("endMin", -1);
        if (start < 0 || end < 0 || start > 1439 || end > 1439) return null;
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        int current = c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
        // A window can cross midnight (11pm to 1:30am), in which case it ends at an earlier minute than it starts.
        boolean wraps = end <= start;
        boolean inside = wraps ? (current >= start || current < end) : (current >= start && current < end);
        return new Risk(inside ? RISK_NOW : (start - current + 1440) % 1440, start, end, false);
    }

    /** The hard stretch to show for this habit: a red zone the person set if one is near, otherwise the learned window. */
    static Risk riskOf(JSONObject q, long now) {
        Risk z = zoneRisk(q, now);
        return z != null ? z : learnedRisk(q, now);
    }

    /**
     * Where now falls against the hard stretch: {@link #RISK_UNKNOWN}, {@link #RISK_NOW}, or the minutes until it
     * opens. The app sends windows as times of day and this works the rest out each time something draws, so it
     * stays right for days without the app writing anything.
     */
    static int riskUntil(JSONObject q, long now) {
        Risk r = riskOf(q, now);
        return r == null ? RISK_UNKNOWN : r.minutes;
    }

    /**
     * "Risk window opens in 25 min · 8:00 PM", or for hours the person set, "Red zone opens in 25 min · 10:00 PM".
     * Empty until there is something to show.
     */
    static String riskLine(JSONObject q, long now) {
        Risk r = riskOf(q, now);
        if (r == null) return "";
        if (r.minutes == RISK_NOW) {
            return r.zone ? "RED ZONE \u00B7 until " + clockOf(r.endMin) : "In your risk window \u00B7 until " + clockOf(r.endMin);
        }
        String name = r.zone ? "Red zone" : "Risk window";
        if (r.minutes <= 90) return name + " opens in " + r.minutes + " min \u00B7 " + clockOf(r.startMin);
        return name + " " + clockOf(r.startMin) + "\u2013" + clockOf(r.endMin);
    }

    /** Red while a red zone is running, gold otherwise: a heads-up, not bad news, until it is. */
    static int riskColor(JSONObject q, long now) {
        Risk r = riskOf(q, now);
        return r != null && r.zone && r.minutes == RISK_NOW ? COLOR_SLIPPED : COLOR_WARN;
    }

    /**
     * Builds what the widget shows. Separate from putting it on the screen so the instrumentation
     * test can inflate exactly this on an emulator and look at it.
     */
    static RemoteViews buildViews(Context context, int widgetId, long now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.momentum_widget);
        JSONObject snapshot = snapshot(context);

        int done = 0;
        int total = 0;
        int quitCount = 0;
        String streakText = "";

        int[] quitRows = { R.id.quit_0, R.id.quit_1 };
        int[] quitTimes = { R.id.quit_0_time, R.id.quit_1_time };
        int[] quitNames = { R.id.quit_0_name, R.id.quit_1_name };
        int[] quitDetails = { R.id.quit_0_detail, R.id.quit_1_detail };
        int[] quitRisks = { R.id.quit_0_risk, R.id.quit_1_risk };
        int[] quitButtons = { R.id.quit_0_urge, R.id.quit_1_urge };
        int[] quitHeld = { R.id.quit_0_held, R.id.quit_1_held };
        for (int rowId : quitRows) views.setViewVisibility(rowId, View.GONE);
        views.setViewVisibility(R.id.quit_divider, View.GONE);

        if (snapshot != null) {
            try {
                done = snapshot.optInt("done", 0);
                total = snapshot.optInt("total", 0);
                int streak = snapshot.optInt("streak", 0);
                if (streak > 0) streakText = streak + " day streak";

                JSONArray quitting = snapshot.optJSONArray("quitting");
                int shown = quitting == null ? 0 : Math.min(quitting.length(), MAX_QUITTING);
                for (int i = 0; i < shown; i++) {
                    JSONObject q = quitting.getJSONObject(i);
                    String id = q.optString("id", "");
                    if (id.isEmpty()) continue;
                    quitCount++;

                    long last = q.optLong("lastSlipAt", 0L);
                    boolean slipped = "slipped".equals(q.optString("state", ""));
                    views.setTextViewText(quitTimes[i], last > 0 && now >= last ? since(now - last) : "—");
                    // A slip today turns the number from calm to red — the clock is still honest,
                    // it's just no longer the good news it was an hour ago.
                    views.setTextColor(quitTimes[i], slipped ? COLOR_SLIPPED : COLOR_CLEAN);
                    views.setTextViewText(quitNames[i], q.optString("text", ""));
                    views.setTextViewText(quitDetails[i], quitDetail(context, q, now));
                    String risk = riskLine(q, now);
                    views.setTextViewText(quitRisks[i], risk);
                    views.setTextColor(quitRisks[i], riskColor(q, now));
                    views.setViewVisibility(quitRisks[i], risk.isEmpty() ? View.GONE : View.VISIBLE);
                    views.setViewVisibility(quitRows[i], View.VISIBLE);

                    // Each button needs its own PendingIntent. Android decides two are "the same"
                    // by action, data and class — extras don't count — so without a distinct URI
                    // every row's Urge would open whichever habit was set last.
                    Intent urge = new Intent(context, MainActivity.class)
                            .setAction(Intent.ACTION_VIEW)
                            .setData(new Uri.Builder().scheme(URGE_SCHEME).authority(URGE_HOST)
                                    .appendPath(id).build())
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    PendingIntent pending = PendingIntent.getActivity(
                            context, 100 + i, urge,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(quitButtons[i], pending);

                    // For two hours after a red zone ends the question is how it went: "I held it" appears beside Urge.
                    String zone = MomentumShade.heldKey(context, q, now);
                    views.setViewVisibility(quitHeld[i], zone == null ? View.GONE : View.VISIBLE);
                    if (zone != null) {
                        Intent held = new Intent().putExtra("taskId", id).putExtra("zone", zone);
                        views.setOnClickPendingIntent(quitHeld[i], tap(context, ACTION_HELD, "held", id + "/" + zone, 300 + i, held));
                    }
                }
                if (quitCount > 0) views.setViewVisibility(R.id.quit_divider, View.VISIBLE);
            } catch (Exception e) {
                streakText = "";
            }
        }

        // Your own words, turning through one at a time. The app sends them; the flipper does the turning.
        views.removeAllViews(R.id.pep_flipper);
        int pepShown = 0;
        JSONArray pep = snapshot == null ? null : snapshot.optJSONArray("pep");
        for (int i = 0; pep != null && i < Math.min(pep.length(), MAX_PEP); i++) {
            String line = pep.optString(i, "").trim();
            if (line.isEmpty()) continue;
            RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_pep_line);
            row.setTextViewText(R.id.pep_text, "\u201C" + line + "\u201D");
            views.addView(R.id.pep_flipper, row);
            pepShown++;
        }
        views.setViewVisibility(R.id.pep_flipper, pepShown > 0 ? View.VISIBLE : View.GONE);

        bindWeek(views, snapshot);
        boolean fresh = isFresh(snapshot, now);
        bindVirtue(context, views, snapshot, now, fresh);
        bindSpend(context, views, snapshot, now, fresh);

        views.setTextViewText(R.id.widget_progress,
                total > 0 ? done + " / " + total : context.getString(R.string.widget_placeholder));
        views.setTextViewText(R.id.widget_subtitle, streakText);

        // The task list. The adapter intent has to be unique per widget, or two widgets on one
        // screen would be handed each other's list.
        Intent list = new Intent(context, MomentumWidgetService.class);
        list.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        list.setData(Uri.parse(list.toUri(Intent.URI_INTENT_SCHEME)));
        views.setRemoteAdapter(R.id.widget_list, list);
        views.setEmptyView(R.id.widget_list, R.id.widget_list_empty);

        // Tapping a task opens the app. List rows can't take a plain click handler; they take a
        // template that each row fills in. The template must be mutable for that on Android 12+.
        // The template goes to a small invisible activity, and each row says what it wants through the extras it fills in: its tick
        // records the tick and closes again at once, and anywhere else on the row opens the app.
        Intent open = new Intent(context, WidgetActionActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_ANIMATION);
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
        views.setPendingIntentTemplate(R.id.widget_list, PendingIntent.getActivity(
                context, 2, open, PendingIntent.FLAG_UPDATE_CURRENT | mutable));

        // Tapping anywhere else on the widget opens the app too.
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch != null) {
            PendingIntent pending = PendingIntent.getActivity(
                    context, 0, launch,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            views.setOnClickPendingIntent(R.id.widget_root, pending);
        }
        return views;
    }

    private static final int[] WEEK_DOTS = { R.id.week_0, R.id.week_1, R.id.week_2, R.id.week_3, R.id.week_4, R.id.week_5, R.id.week_6 };
    /** None planned, none done, under half, over half, all. */
    private static final int[] WEEK_COLORS = { 0xFF3A3650, 0xFF8C7442, 0xFFC9A053, 0xFFE8B75D };
    private static final int WEEK_NONE = 0xFF24212F;

    /** Seven dots for the week ending today. Hidden until the app has sent them. */
    private static void bindWeek(RemoteViews views, JSONObject snapshot) {
        JSONArray week = snapshot == null ? null : snapshot.optJSONArray("week");
        boolean show = week != null && week.length() == WEEK_DOTS.length;
        views.setViewVisibility(R.id.week_strip, show ? View.VISIBLE : View.GONE);
        if (!show) return;
        for (int i = 0; i < WEEK_DOTS.length; i++) {
            int level = week.optInt(i, -1);
            views.setTextColor(WEEK_DOTS[i], level < 0 ? WEEK_NONE : WEEK_COLORS[Math.min(level, WEEK_COLORS.length - 1)]);
            // Today, the last of them, is the one still being filled in, so it is the larger.
            views.setTextViewTextSize(WEEK_DOTS[i], android.util.TypedValue.COMPLEX_UNIT_SP, i == WEEK_DOTS.length - 1 ? 15 : 11);
        }
    }

    /** The virtue of the day on one line, with the evening question's three answers once it is time to ask. */
    private static void bindVirtue(Context context, RemoteViews views, JSONObject snapshot, long now, boolean fresh) {
        JSONObject v = snapshot == null ? null : snapshot.optJSONObject("virtue");
        String line = v == null ? "" : v.optString("line", "");
        views.setViewVisibility(R.id.virtue_row, line.isEmpty() ? View.GONE : View.VISIBLE);
        if (line.isEmpty()) return;
        views.setTextViewText(R.id.virtue_line, line);
        boolean ask = fresh && v.optBoolean("ask", false) && minuteOfDay(now) >= v.optInt("askFromMin", 18 * 60 + 30);
        views.setViewVisibility(R.id.virtue_buttons, ask ? View.VISIBLE : View.GONE);
        if (!ask) return;
        int[] buttons = { R.id.virtue_lived, R.id.virtue_partly, R.id.virtue_missed };
        int[] scores = { 2, 1, 0 };
        for (int i = 0; i < buttons.length; i++) {
            Intent extras = new Intent().putExtra("score", scores[i]);
            views.setOnClickPendingIntent(buttons[i], tap(context, ACTION_VIRTUE, "virtue", String.valueOf(scores[i]), 320 + i, extras));
        }
    }

    /** What has been spent today and the payments made again and again, one tap each. */
    private static void bindSpend(Context context, RemoteViews views, JSONObject snapshot, long now, boolean fresh) {
        JSONObject spend = snapshot == null ? null : snapshot.optJSONObject("spend");
        JSONArray chips = spend == null ? null : spend.optJSONArray("chips");
        int[] ids = { R.id.spend_chip_0, R.id.spend_chip_1, R.id.spend_chip_2 };
        double total = (fresh && spend != null ? spend.optDouble("today", 0) : 0) + pendingSpendToday(context, now);
        int shown = chips == null ? 0 : Math.min(chips.length(), Math.min(ids.length, MAX_CHIPS));
        boolean any = shown > 0 || total > 0;
        views.setViewVisibility(R.id.spend_row, any ? View.VISIBLE : View.GONE);
        if (!any) return;
        views.setTextViewText(R.id.spend_total, total > 0 ? context.getString(R.string.widget_spent_today, MomentumMoney.amountText(total)) : "");
        for (int i = 0; i < ids.length; i++) {
            JSONObject c = i < shown ? chips.optJSONObject(i) : null;
            boolean usable = c != null && c.optDouble("amount", 0) > 0 && !c.optString("catId", "").isEmpty();
            views.setViewVisibility(ids[i], usable ? View.VISIBLE : View.GONE);
            if (!usable) continue;
            views.setTextViewText(ids[i], c.optString("label", ""));
            Intent extras = new Intent().putExtra("amount", c.optDouble("amount", 0))
                    .putExtra("catId", c.optString("catId", "")).putExtra("payee", c.optString("payee", ""));
            views.setOnClickPendingIntent(ids[i], tap(context, ACTION_CHIP, "chip", String.valueOf(i), 340 + i, extras));
        }
    }

    private static void render(Context context, AppWidgetManager manager, int widgetId) {
        manager.updateAppWidget(widgetId, buildViews(context, widgetId, System.currentTimeMillis()));
        // The list reads its data through the service, which only re-reads when told to.
        manager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_list);
    }
}
