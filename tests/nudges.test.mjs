import { atDate, suite } from "./harness.mjs";
import {
  ACTIONS, DEFAULT_NOTIFY, buildNudges, describeNudge, inQuietHours, nextNudge, notifySettings,
} from "../src/lib/nudges.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";

const t = suite("nudges");

const TODAY = "2026-09-19";       // a Saturday
const CLOCK = `${TODAY}T06:00:00`; // early, so the whole day is still ahead
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const habit = (patch) => newTask({
  id: "h1", kind: "build", text: "Morning walk", startDate: "2026-01-01",
  recurrence: weeklyRule(EVERY_DAY), time: "07:00", ...patch,
});
const state = (patch) => ({
  tasks: [], dayLog: {}, srbai: [], checkins: [], freezes: {},
  settings: { notify: { ...DEFAULT_NOTIFY } }, ...patch,
});
const withNotify = (notify, patch) => state({ ...patch, settings: { notify: { ...DEFAULT_NOTIFY, ...notify } } });
const kinds = (nudges) => nudges.map((n) => n.kind);

t.group("settings");
{
  t.eq("defaults are conservative — only the two that follow your own choices",
    [DEFAULT_NOTIFY.habits, DEFAULT_NOTIFY.comeback, DEFAULT_NOTIFY.morning, DEFAULT_NOTIFY.evening, DEFAULT_NOTIFY.weekly],
    [true, true, null, null, null]);
  t.eq("saved settings win over defaults", notifySettings({ notify: { habits: false } }).habits, false);
  t.eq("...without losing the rest", notifySettings({ notify: { habits: false } }).quietStart, "22:00");
  t.eq("no settings at all still works", notifySettings(undefined), DEFAULT_NOTIFY);
}

t.group("quiet hours");
{
  const notify = { ...DEFAULT_NOTIFY, quiet: true, quietStart: "22:00", quietEnd: "07:00" };
  // The range wraps midnight, so 22:00–07:00 is "late evening OR early morning", not empty.
  t.ok("late evening is quiet", inQuietHours("23:30", notify));
  t.ok("the small hours are quiet", inQuietHours("03:00", notify));
  t.ok("the start is quiet", inQuietHours("22:00", notify));
  t.ok("the end is not — it's when you get up", !inQuietHours("07:00", notify));
  t.ok("the middle of the day isn't quiet", !inQuietHours("13:00", notify));
  t.ok("nothing is quiet when it's switched off", !inQuietHours("03:00", { ...notify, quiet: false }));

  const daytime = { ...notify, quietStart: "09:00", quietEnd: "17:00" };
  t.ok("a range that doesn't wrap still works", inQuietHours("12:00", daytime) && !inQuietHours("18:00", daytime));
  t.ok("an empty range is not all day", !inQuietHours("12:00", { ...notify, quietStart: "09:00", quietEnd: "09:00" }));
}

t.group("habit reminders");
atDate(CLOCK, () => {
  // Comeback nudges are tested on their own below; switching them off here keeps this
  // group about one thing.
  const only = (patch) => buildNudges(withNotify({ comeback: false }, patch), { days: 1 });

  const one = only({ tasks: [habit()] });
  t.eq("a timed habit gets one", kinds(one), ["habits"]);
  t.eq("...at its own time", one[0].at.getHours(), 7);
  t.eq("...titled with the habit", one[0].title, "Morning walk");
  t.ok("...with a done action on the notification itself",
    one[0].actions.some((a) => a.id === ACTIONS.done.id));

  t.eq("a habit with no time gets nothing — there's no moment to send at",
    only({ tasks: [habit({ time: null })] }).length, 0);
  t.eq("one already done today gets nothing",
    only({ tasks: [habit()], dayLog: { [TODAY]: { h1: { done: true } } } }).length, 0);
  t.eq("one with reminders switched off gets nothing",
    only({ tasks: [habit({ reminder: false })] }).length, 0);
  t.eq("nothing at all when the whole kind is off",
    buildNudges(withNotify({ habits: false, comeback: false }, { tasks: [habit()] }), { days: 1 }).length, 0);

  // Graduated habits have their prompt withdrawn — the cue is supposed to do the work now.
  const grad = [
    { taskId: "h1", date: "2026-08-01", mean: 6, scores: [6, 6, 6, 6] },
    { taskId: "h1", date: "2026-09-01", mean: 6.2, scores: [6, 6, 6, 7] },
  ];
  t.eq("a graduated habit is left alone", only({ tasks: [habit()], srbai: grad }).length, 0);
  t.eq("...unless it was explicitly kept",
    only({ tasks: [habit({ keepReminder: true })], srbai: grad }).length, 1);

  // A reminder at a time you chose is yours; the app doesn't get to overrule it.
  t.eq("a habit set inside quiet hours still fires", only({ tasks: [habit({ time: "23:30" })] }).length, 1);
});

t.group("what a reminder says");
atDate(CLOCK, () => {
  const only = (patch) => buildNudges(withNotify({ comeback: false }, patch), { days: 1 });
  const body = (patch) => only({ tasks: [habit(patch)] })[0].body;
  t.eq("the plan you wrote, if you wrote one", body({ intention: "When the kettle clicks, I walk." }),
    "When the kettle clicks, I walk.");
  t.eq("otherwise the cue", body({ cueType: "routine", cueDetail: "make coffee" }), "After you make coffee");
  t.eq("...and the tiny version alongside it",
    body({ cueType: "routine", cueDetail: "make coffee", twoMin: "shoes on" }),
    "After you make coffee · Hard day? Just: shoes on");
  // The clock is the least useful thing to say — they can already see the time.
  t.ok("never just the time", !/\d\d:\d\d/.test(body({})));
  t.eq("a break habit is offered the replacement behaviour, not a scolding",
    body({ kind: "break", competingResponse: "make tea instead" }), "Instead: make tea instead");
  t.ok("a two-minute version is offered as an action",
    only({ tasks: [habit({ twoMin: "shoes on" })] })[0].actions.some((a) => a.id === "twoMin"));
  t.ok("no more than three actions, since platforms cap them",
    only({ tasks: [habit({ twoMin: "shoes on" })] })[0].actions.length <= 3);
});

t.group("the app's own nudges");
atDate(CLOCK, () => {
  const morning = buildNudges(withNotify({ morning: "07:30", comeback: false }, { tasks: [habit()] }), { days: 1 });
  t.ok("a morning plan", kinds(morning).includes("morning"));
  t.ok("...that counts what's on", /1 thing on today/.test(morning.find((n) => n.kind === "morning").body));

  const evening = buildNudges(withNotify({ evening: "21:00", comeback: false }), { days: 1 });
  t.ok("an evening review", kinds(evening).includes("evening"));
  t.eq("...but not once the day is already logged",
    buildNudges(withNotify({ evening: "21:00", comeback: false }, { checkins: [{ date: TODAY }] }), { days: 1 }).length, 0);

  // Today is a Saturday, so a Sunday weekly nudge lands tomorrow, not today.
  const weekly = buildNudges(withNotify({ weekly: { day: "sun", time: "18:00" }, comeback: false }), { days: 3 });
  t.eq("a weekly nudge lands on its own day", weekly.map((n) => n.date), ["2026-09-20"]);
  t.eq("...once a week, not once a day", weekly.length, 1);

  // These are the app's idea, not yours, so quiet hours apply to them.
  t.eq("an app nudge inside quiet hours is dropped",
    buildNudges(withNotify({ morning: "05:00", comeback: false }), { days: 1 }).length, 0);
});

t.group("never miss twice");
atDate(CLOCK, () => {
  const missed = state({ tasks: [habit({ time: null })] }); // no time, so no ordinary reminder
  const nudges = buildNudges(missed, { days: 1 });
  t.eq("a missed habit yesterday earns one nudge today", kinds(nudges), ["comeback"]);
  t.ok("...that says what it's for", /never miss twice|two in a row/i.test(nudges[0].body));
  t.eq("...today only", nudges[0].date, TODAY);

  t.eq("nothing missed, nothing sent",
    buildNudges(state({ tasks: [habit({ time: null })], dayLog: { "2026-09-18": { h1: { done: true } } } }),
      { days: 1 }).length, 0);
  t.eq("a frozen yesterday isn't a miss",
    buildNudges(state({ tasks: [habit({ time: null })], freezes: { "2026-09-18": true } }), { days: 1 }).length, 0);
  t.eq("switched off means switched off",
    buildNudges(withNotify({ comeback: false }, { tasks: [habit({ time: null })] }), { days: 1 }).length, 0);

  const many = buildNudges(state({ tasks: [habit({ time: null }), habit({ id: "h2", text: "Read", time: null })] }),
    { days: 1 });
  t.eq("several misses are one nudge, not one each", many.length, 1);
  t.ok("...and it says how many", /2 habits/.test(many[0].body));
});

t.group("ordering and the past");
atDate(`${TODAY}T12:00:00`, () => {
  const later = buildNudges(
    withNotify({ morning: "07:30", evening: "21:00", comeback: false }, { tasks: [habit()] }), { days: 1 });
  // It's already noon: a 07:00 habit reminder and a 07:30 plan have both been and gone.
  t.eq("nothing in the past is scheduled", kinds(later), ["evening"]);
  t.ok("...and what's left is in time order",
    buildNudges(withNotify({ evening: "21:00", comeback: false }, { tasks: [habit({ time: "20:00" })] }), { days: 1 })
      .every((n, i, all) => i === 0 || all[i - 1].at <= n.at));
  t.eq("the next one up", nextNudge(later).kind, "evening");
  t.eq("nothing at all", nextNudge([]), null);
  t.ok("a nudge describes itself for the settings screen", /9:00 PM$/.test(describeNudge(later[0])));
});

t.group("ids are stable");
atDate(CLOCK, () => {
  // Re-scheduling must not double-book: the same nudge on the same day is the same id.
  const a = buildNudges(withNotify({ comeback: false }, { tasks: [habit()] }), { days: 2 }).map((n) => n.id);
  const b = buildNudges(withNotify({ comeback: false }, { tasks: [habit()] }), { days: 2 }).map((n) => n.id);
  t.eq("the same state gives the same ids", a, b);
  t.eq("...and they're unique", new Set(a).size, a.length);
  t.ok("...and carry the date", a[0].endsWith(TODAY));
});
