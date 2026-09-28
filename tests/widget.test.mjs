import { atDate, suite } from "./harness.mjs";
import { PENDING_URGE_KEY, takePendingUrge, widgetSnapshot } from "../src/lib/widget.js";
import { newLapse } from "../src/lib/urges.js";

const t = suite("widget");

const TODAY = "2026-09-28";
const CLOCK = `${TODAY}T15:00:00`;
const daily = { freq: "daily", interval: 1 };
const build = (id, text) => ({ id, kind: "build", text, recurrence: daily, startDate: "2026-09-01", createdAt: 1 });
const quit = (id, text, patch = {}) => ({
  id, kind: "break", text, recurrence: daily, startDate: "2026-09-01", createdAt: 1, ...patch,
});

t.group("the break side on the home screen");
atDate(CLOCK, () => {
  const lastSlip = new Date("2026-09-24T21:30:00").getTime();
  const state = {
    tasks: [
      build("b1", "Morning walk"),
      quit("q1", "Doomscrolling"),
      quit("q2", "Smoking", { limit: 5 }),
      quit("q3", "Energy drinks"),
      quit("gone", "Old habit", { archivedAt: 1 }),
    ],
    dayLog: {},
    urgeLog: [
      newLapse({ taskId: "q1", at: lastSlip }),
      { ...newLapse({ taskId: "q2", at: new Date(`${TODAY}T09:00:00`).getTime() }), date: TODAY },
      { ...newLapse({ taskId: "q2", at: new Date(`${TODAY}T12:00:00`).getTime() }), date: TODAY },
    ],
  };
  const snap = widgetSnapshot(state, TODAY);

  // Before this the widget showed habits being built and to-dos, and nothing being broken.
  t.ok("habits being broken are on the widget now", Array.isArray(snap.quitting) && snap.quitting.length > 0);
  t.eq("...two of them, since each row carries a button", snap.quitting.length, 2);
  t.ok("...never an archived one", !snap.quitting.some((q) => q.id === "gone"));
  t.ok("...and they don't count toward today's done/total", snap.total === 1, snap);

  const scroll = snap.quitting.find((q) => q.id === "q1");
  // A timestamp, not "3d 17h": the widget works the gap out when it draws, so it doesn't sit
  // frozen at whatever it was when the app last wrote.
  t.eq("the last slip goes as a time, for the widget to count from", scroll.lastSlipAt, lastSlip);
  t.eq("...with the day's state", scroll.state, "open");
  t.eq("...and no count for a habit being stopped", [scroll.limit, scroll.count], [0, 0]);

  const smoke = snap.quitting.find((q) => q.id === "q2");
  t.eq("one being cut down carries where the day stands", [smoke.count, smoke.limit], [2, 5]);

  const long = widgetSnapshot({ ...state, tasks: [quit("q9", "Scrolling through short videos before bed")] }, TODAY);
  t.ok("long names are cut to fit beside the button", long.quitting[0].text.length <= 22 && long.quitting[0].text.endsWith("…"),
    long.quitting[0].text);

  t.eq("no habits being broken, an empty list rather than none",
    widgetSnapshot({ tasks: [build("b1", "Walk")], dayLog: {} }, TODAY).quitting, []);
});

t.group("picking up a tap from the widget");
{
  // The native side leaves the id here; the app takes it and clears it, so it opens once.
  const store = {};
  globalThis.window = {
    Capacitor: { Plugins: { Preferences: {
      get: async ({ key }) => ({ value: store[key] ?? null }),
      remove: async ({ key }) => { delete store[key]; },
    } } },
  };
  store[PENDING_URGE_KEY] = "q1";
  t.eq("a waiting tap is picked up", await takePendingUrge(), "q1");
  t.eq("...and cleared, so it opens exactly once", await takePendingUrge(), null);
  t.eq("nothing waiting is nothing", await takePendingUrge(), null);

  globalThis.window = {};
  t.eq("on the web, where there's no widget, it's quietly nothing", await takePendingUrge(), null);
  delete globalThis.window;
  t.eq("...and with no window at all", await takePendingUrge(), null);

  globalThis.window = { Capacitor: { Plugins: { Preferences: { get: async () => { throw new Error("boom"); } } } } };
  t.eq("a failing store doesn't throw into the app", await takePendingUrge(), null);
  delete globalThis.window;
}
