import { atDate, suite } from "./harness.mjs";
import { PENDING_URGE_KEY, takePendingUrge, widgetSnapshot } from "../src/lib/widget.js";
import { newLapse, newUrge } from "../src/lib/urges.js";

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
  t.ok("long names are cut to fit beside the button", long.quitting[0].text.length <= 24 && long.quitting[0].text.endsWith("…"),
    long.quitting[0].text);

  t.eq("no habits being broken, an empty list rather than none",
    widgetSnapshot({ tasks: [build("b1", "Walk")], dayLog: {} }, TODAY).quitting, []);
});

t.group("every task, not the first four");
atDate(CLOCK, () => {
  // The bug that prompted this: the widget stopped at four rows, so a day with seven things on
  // it looked like a day with four.
  const names = ["Walk", "Read", "Stretch", "Water plants", "Journal", "Call mum", "Pay rent", "Floss", "Meditate"];
  const tasks = names.map((n, i) => build(`b${i}`, n));
  const dayLog = { [TODAY]: { b0: { done: true }, b2: { done: true } } };
  const snap = widgetSnapshot({ tasks, dayLog, urgeLog: [] }, TODAY);
  t.eq("all nine are in the snapshot", snap.items.length, 9);
  t.eq("...and the count agrees with the list", [snap.done, snap.total], [2, 9]);
  t.eq("what's still to do comes first, in its own order",
    snap.items.slice(0, 7).map((i) => i.text), ["Read", "Water plants", "Journal", "Call mum", "Pay rent", "Floss", "Meditate"]);
  t.eq("...and what's finished goes below it", snap.items.slice(7).map((i) => [i.text, i.done]), [["Walk", true], ["Stretch", true]]);
  t.ok("a task's id travels with it", snap.items.every((i) => i.id));

  const many = Array.from({ length: 80 }, (_, i) => build(`m${i}`, `Task ${i}`));
  const capped = widgetSnapshot({ tasks: many, dayLog: {}, urgeLog: [] }, TODAY);
  t.eq("an absurd day is capped so the stored string stays small", capped.items.length, 50);
  t.eq("...but the headline count is still the truth", capped.total, 80);

  const longName = widgetSnapshot({ tasks: [build("b1", "A".repeat(80))], dayLog: {}, urgeLog: [] }, TODAY);
  t.ok("a very long name is cut, with an ellipsis", longName.items[0].text.length <= 40 && longName.items[0].text.endsWith("…"));
  t.eq("a day with nothing on it is an empty list, not missing", widgetSnapshot({ tasks: [], dayLog: {}, urgeLog: [] }, TODAY).items, []);
});

t.group("the clean-time counter has what it needs");
atDate(CLOCK, () => {
  const slipAt = new Date("2026-09-24T21:30:00").getTime();
  const slipped = widgetSnapshot({ tasks: [quit("q1", "Doomscrolling")], dayLog: {}, urgeLog: [newLapse({ taskId: "q1", at: slipAt })] }, TODAY);
  t.eq("after a slip: the time of it, and that it was a real one", [slipped.quitting[0].lastSlipAt, slipped.quitting[0].everSlipped], [slipAt, true]);

  const fresh = widgetSnapshot({ tasks: [quit("q1", "Doomscrolling")], dayLog: {}, urgeLog: [] }, TODAY);
  t.eq("never slipped: it counts from the start, and says so", fresh.quitting[0].everSlipped, false);
  t.ok("...with a start to count from", fresh.quitting[0].lastSlipAt > 0);

  // Four +1s inside a limit of five are the plan, not slips — so they aren't "the last slip".
  const within = widgetSnapshot({
    tasks: [quit("q2", "Smoking", { limit: 5 })], dayLog: {},
    urgeLog: [1, 2, 3].map((n) => ({ ...newLapse({ taskId: "q2", at: new Date(`${TODAY}T0${n + 6}:00:00`).getTime() }), date: TODAY })),
  }, TODAY);
  t.eq("lapses inside a limit aren't counted as slips", within.quitting[0].everSlipped, false);

  const urgeAt = new Date(`${TODAY}T13:45:00`).getTime();
  const withUrge = widgetSnapshot({ tasks: [quit("q1", "Doomscrolling")], dayLog: {}, urgeLog: [newUrge({ taskId: "q1", at: urgeAt })] }, TODAY);
  t.eq("a ridden-out urge is the last urge but not a slip", [withUrge.quitting[0].lastUrgeAt, withUrge.quitting[0].everSlipped], [urgeAt, false]);
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
