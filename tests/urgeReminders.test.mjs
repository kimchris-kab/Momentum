import { atDate, suite } from "./harness.mjs";
import { DEFAULT_NOTIFY, NUDGE_KINDS, buildNudges } from "../src/lib/nudges.js";
import { URGE_LEAD_MINUTES, urgeWindow } from "../src/lib/breakInsights.js";
import { lastUrgeAt, urgeEvents } from "../src/lib/urges.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";
import { widgetSnapshot } from "../src/lib/widget.js";

const t = suite("urgeReminders");

// Tracking when urges come, and warning ahead of the usual hour. The rule behind all of it is
// the app's usual one: nothing is said without enough behind it. A warning at a time the app
// made up would be worse than no warning, so below the evidence threshold there simply isn't one.
const TODAY = "2026-10-04";            // a Sunday
const CLOCK = `${TODAY}T06:00:00`;
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const quit = (patch = {}) => newTask({
  id: "q1", kind: "break", text: "Doomscrolling", startDate: "2026-01-01",
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const NOW = new Date(CLOCK).getTime();
// An event on a given day at a given local time, `daysAgo` before the test clock.
const ev = (daysAgo, hhmm, over = {}) => {
  const d = new Date(`${TODAY}T${hhmm}:00`);
  d.setDate(d.getDate() - daysAgo);
  return { id: `e-${daysAgo}-${hhmm}-${Math.random()}`, taskId: "q1", kind: "urge", outcome: "rode-out", at: d.getTime(), ...over };
};
const evenings = [ev(1, "21:00"), ev(2, "21:20"), ev(3, "21:10"), ev(4, "21:40"), ev(5, "21:05", { kind: "lapse" }), ev(6, "21:30")];
const state = (patch = {}) => ({
  tasks: [quit()], dayLog: {}, srbai: [], checkins: [], freezes: {}, urgeLog: evenings,
  settings: { notify: { ...DEFAULT_NOTIFY } }, ...patch,
});
const urgeNudges = (st) => buildNudges(st, { days: 3, now: NOW }).filter((n) => n.kind === "urges");

t.group("the last urge");
{
  const log = [ev(3, "20:00"), ev(1, "22:15", { kind: "lapse" }), ev(2, "09:00"), { ...ev(0, "08:00"), taskId: "other" }];
  t.eq("it's the most recent of urges and lapses together", lastUrgeAt(quit(), log), log[1].at);
  t.eq("another habit's urge isn't this one's", lastUrgeAt(quit({ id: "nope" }), log), null);
  t.eq("no urges, no last urge", lastUrgeAt(quit(), []), null);
  t.eq("an empty or missing log is fine", [lastUrgeAt(quit(), undefined), urgeEvents(quit(), null)], [null, []]);
  t.eq("events come back oldest first", urgeEvents(quit(), log).map((r) => r.at), [log[0].at, log[2].at, log[1].at]);
  t.ok("a day-log style record that isn't an urge or lapse is ignored",
    urgeEvents(quit(), [{ taskId: "q1", kind: "note", at: 5 }]).length === 0);
}

t.group("the usual hour — only once there's enough to say");
atDate(CLOCK, () => {
  t.eq("four urges aren't enough", urgeWindow(quit(), evenings.slice(0, 4), { now: NOW }), null);
  const w = urgeWindow(quit(), evenings, { now: NOW });
  t.ok("six evening urges are", !!w);
  t.eq("it centres on the evening", w.around >= "21:00" && w.around <= "21:30", true);
  t.eq("the warning comes before the usual start, by the lead time", w.warnAt < "21:00", true);
  t.eq("...20 minutes before the early quartile", URGE_LEAD_MINUTES, 20);
  t.eq("it says how much was behind it", [w.n, w.of, w.share], [6, 6, 100]);

  const scattered = ["03:00", "08:30", "11:00", "14:30", "17:00", "20:00", "23:30"].map((h, i) => ev(i + 1, h));
  t.eq("urges spread all over the day name no hour", urgeWindow(quit(), scattered, { now: NOW }), null);

  // 4 of 10 in the window is 40% — enough; 3 of 10 is not.
  const thin = [...evenings.slice(0, 3), ...["03:00", "06:00", "09:00", "12:00", "15:00", "18:00", "00:30"].map((h, i) => ev(i + 7, h))];
  t.eq("three in a stretch out of ten is not a pattern", urgeWindow(quit(), thin, { now: NOW }), null);
});

t.group("the usual hour — across midnight");
atDate(CLOCK, () => {
  // 23:30, 23:50, 00:10, 00:20, 23:40 — one cluster that happens to span the date change.
  const late = [ev(1, "23:30"), ev(2, "23:50"), ev(3, "00:10"), ev(4, "00:20"), ev(5, "23:40"), ev(6, "00:05")];
  const w = urgeWindow(quit(), late, { now: NOW });
  t.ok("a cluster either side of midnight is still one cluster", !!w);
  t.ok("...and its warning lands late in the evening, not at noon", w.warnAt >= "22:30" || w.warnAt <= "00:10", w);
});

t.group("the usual hour — what it ignores");
atDate(CLOCK, () => {
  const old = [ev(100, "21:00"), ev(110, "21:10"), ev(120, "21:20"), ev(130, "21:30"), ev(140, "21:40"), ev(150, "21:05")];
  t.eq("urges from months ago don't count", urgeWindow(quit(), old, { now: NOW }), null);
  // One stray early urge shouldn't drag the warning to 7:40.
  const stray = [...evenings, ev(7, "20:05")];
  const w = urgeWindow(quit(), stray, { now: NOW });
  t.ok("one stray earlier urge doesn't drag the warning with it", w.warnAt >= "20:30", w);
  t.eq("another habit's urges aren't this one's", urgeWindow(quit({ id: "x" }), evenings, { now: NOW }), null);
});

t.group("the warning nudge");
atDate(CLOCK, () => {
  const n = urgeNudges(state());
  t.eq("one a day for each day ahead", n.length, 3);
  t.eq("...on consecutive days", n.map((x) => x.date), ["2026-10-04", "2026-10-05", "2026-10-06"]);
  t.ok("...in the evening", n.every((x) => x.at.getHours() === 20 || x.at.getHours() === 21), n.map((x) => x.at.toString()));
  t.ok("...before the hour it usually hits", n.every((x) => x.at.getHours() * 60 + x.at.getMinutes() < 21 * 60 + 10));
  t.eq("it knows which habit", n[0].taskId, "q1");
  t.ok("it names the habit and the time", /Doomscrolling usually pulls at you around 9:\d\d/.test(n[0].body), n[0].body);
  t.eq("a stable id per day, so rescheduling replaces", n[0].id, "urge:q1:2026-10-04");
  t.eq("it offers to ride it out", n[0].actions.map((a) => a.id), ["urge", "open"]);

  t.eq("with too little on record it sends nothing", urgeNudges(state({ urgeLog: evenings.slice(0, 3) })), []);
  t.eq("...and with no log at all", urgeNudges(state({ urgeLog: undefined })), []);
});

t.group("the warning nudge — in their own words");
atDate(CLOCK, () => {
  const withWhy = quit({ calmNote: { why: "I want my evenings back.", after: "ashamed" } });
  const a = urgeNudges(state({ tasks: [withWhy] }))[0];
  t.ok("it quotes what they wrote", a.body.includes("You wrote: “I want my evenings back.”"), a.body);
  t.ok("...and only the 'why', not the rest", !a.body.includes("ashamed"));

  const long = urgeNudges(state({ tasks: [quit({ calmNote: { why: "x".repeat(300) } })] }))[0];
  t.ok("a long note is cut rather than overflowing the notification", long.body.length < 220 && long.body.includes("…"), long.body.length);

  const instead = urgeNudges(state({ tasks: [quit({ competingResponse: "walk round the block" })] }))[0];
  t.ok("no note: the planned replacement", instead.body.includes("Instead: walk round the block"), instead.body);
  const bare = urgeNudges(state())[0];
  t.ok("neither: a plain instruction, not blank", /Get ahead of it/.test(bare.body), bare.body);
});

t.group("the warning nudge — when it stays quiet");
atDate(CLOCK, () => {
  t.eq("the setting turns it off", urgeNudges(state({ settings: { notify: { ...DEFAULT_NOTIFY, urges: false } } })), []);
  t.eq("the habit's own switch turns it off", urgeNudges(state({ tasks: [quit({ urgeReminder: false })] })), []);
  t.eq("a paused habit doesn't warn", urgeNudges(state({ tasks: [quit({ archivedAt: 5 })] })), []);
  t.eq("a habit being built isn't a habit being quit", urgeNudges(state({ tasks: [quit({ kind: "build" })] })), []);

  const weekdays = quit({ recurrence: weeklyRule(["mon", "tue"]) });
  t.eq("only on the days the habit is on", urgeNudges(state({ tasks: [weekdays] })).map((x) => x.date), ["2026-10-05", "2026-10-06"]);

  // At half past nine the warning for tonight has gone.
  const late = buildNudges(state(), { days: 2, now: new Date(`${TODAY}T21:30:00`).getTime() }).filter((n) => n.kind === "urges");
  t.eq("a warning whose time has passed isn't sent", late.map((x) => x.date), ["2026-10-05"]);

  t.eq("on by default", DEFAULT_NOTIFY.urges, true);
  t.ok("and listed among the nudges the person can switch", NUDGE_KINDS.some((k) => k.id === "urges" && k.kind === "toggle"));
});

t.group("the warning nudge — and quiet hours");
atDate(CLOCK, () => {
  // A habit that hits at 11pm: its warning lands at 22:40, inside the default 22:00–07:00.
  const lateNight = [ev(1, "23:00"), ev(2, "23:20"), ev(3, "23:10"), ev(4, "23:40"), ev(5, "23:05"), ev(6, "23:30")];
  const n = urgeNudges(state({ urgeLog: lateNight }));
  t.eq("it's sent even though it lands in quiet hours — that's when it hits", n.length, 3);
  t.ok("...which is the point of it being its own switch", n[0].at.getHours() >= 22, n[0].at.toString());
});

t.group("delivery");
{
  const scheduled = [];
  const plugin = {
    checkPermissions: async () => ({ display: "granted" }),
    requestPermissions: async () => ({ display: "granted" }),
    registerActionTypes: async (arg) => { scheduled.types = arg.types; },
    schedule: async (arg) => { scheduled.push(...arg.notifications); },
    getPending: async () => ({ notifications: [] }),
    cancel: async () => {},
  };
  globalThis.window = { Capacitor: { isNativePlatform: () => true, Plugins: { LocalNotifications: plugin } } };
  const real = Date.now;
  const fixed = new Date(CLOCK).getTime();
  Date.now = () => fixed;
  try {
    // A fresh copy of the module: it remembers having registered the action types, so one that
    // another test file already used would skip registering and leave nothing to look at.
    const { scheduleNudges } = await import("../src/lib/notify.js?urge-delivery");
    await atDate(CLOCK, async () => scheduleNudges(state()));
  } finally { Date.now = real; delete globalThis.window; }
  const urge = scheduled.filter((n) => n.extra?.kind === "urges");
  t.ok("urge warnings reach the OS scheduler", urge.length > 0, scheduled.length);
  t.ok("...with the action type that has the Ride it out button", urge.every((n) => n.actionTypeId === "urge"));
  t.ok("...and it was registered", (scheduled.types || []).some((x) => x.id === "urge" && x.actions.some((a) => a.id === "urge")));
  t.ok("...carrying the habit, so the tap can open the right urge screen", urge.every((n) => n.extra.taskId === "q1"));
}

t.group("the widget knows the last urge");
atDate(`${TODAY}T12:00:00`, () => {
  const snap = widgetSnapshot({ tasks: [quit()], dayLog: {}, urgeLog: evenings }, TODAY);
  t.eq("the snapshot carries when the last urge was", snap.quitting[0].lastUrgeAt, evenings[0].at);
  t.eq("...or null when there hasn't been one", widgetSnapshot({ tasks: [quit()], dayLog: {}, urgeLog: [] }, TODAY).quitting[0].lastUrgeAt, null);
});
