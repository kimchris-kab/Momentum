import { atDate, suite } from "./harness.mjs";
import {
  agendaForDate, computeStreak, countsTowardDay, dailyRule, dayStats, dayStatus,
  describeRecurrence, groupTasks, habitStreak, isDone, isOnAgenda, monthlyRule, newTask,
  occursOn, reorderTasks, searchTasks, sortTasks, subtaskProgress, toggleDoneReducer,
  voteTally, weekProgress, weekStreak, weeklyCountRule, weeklyRule, weeklyTarget,
} from "../src/lib/tasks.js";
import { todayStr, weekStartOf } from "../src/lib/date.js";

const t = suite("tasks");

// The week under test: Mon 14th → Sun 20th September 2026. "Today" is the Saturday.
const TODAY = "2026-09-19T12:00:00";
const MON = "2026-09-14", TUE = "2026-09-15", WED = "2026-09-16";
const THU = "2026-09-17", FRI = "2026-09-18", SAT = "2026-09-19", SUN = "2026-09-20";

const habit = (patch) => newTask({
  id: "h1", kind: "build", text: "Walk", startDate: "2026-01-01",
  recurrence: weeklyRule(["mon", "wed", "fri"]), ...patch,
});
const log = (dates, id = "h1") =>
  Object.fromEntries(dates.map((d) => [d, { [id]: { done: true, doneAt: 1 } }]));

t.group("the fixed clock");
atDate(TODAY, () => {
  t.eq("today is the Saturday", todayStr(), SAT);
  t.eq("the week starts on the Monday", weekStartOf(todayStr()), MON);
});

t.group("shape");
{
  const task = newTask({ text: "Thing" });
  t.eq("a new task is an undated todo", [task.kind, task.dueDate, task.recurrence, task.done],
    ["todo", null, null, false]);
  t.eq("quota targets are clamped to a week", [
    weeklyCountRule(9).timesPerWeek, weeklyCountRule(1).timesPerWeek, weeklyCountRule(3.4).timesPerWeek,
  ], [7, 1, 3]);
  // Zero times a week isn't a habit, so it's read as "unset" and takes the default.
  t.eq("zero is treated as unset", weeklyCountRule(0).timesPerWeek, 3);
  t.eq("a missing target falls back to three", weeklyTarget({ recurrence: { freq: "weeklyCount" } }), 3);
  t.eq("subtask progress", subtaskProgress({ subtasks: [{ done: true }, { done: false }] }), { done: 1, total: 2 });
}

t.group("describing a schedule");
{
  t.eq("weekdays", describeRecurrence(weeklyRule(["mon", "tue", "wed", "thu", "fri"])), "Weekdays");
  t.eq("weekends", describeRecurrence(weeklyRule(["sat", "sun"])), "Weekends");
  t.eq("all seven days", describeRecurrence(weeklyRule(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])), "Every day");
  t.eq("named days keep week order", describeRecurrence(weeklyRule(["fri", "mon"])), "Mon, Fri");
  t.eq("daily", describeRecurrence(dailyRule()), "Every day");
  t.eq("every other day", describeRecurrence(dailyRule(2)), "Every 2 days");
  t.eq("monthly", describeRecurrence(monthlyRule(9)), "Monthly on day 9");
  t.eq("once a week reads as words", describeRecurrence(weeklyCountRule(1)), "Once a week");
  t.eq("twice a week reads as words", describeRecurrence(weeklyCountRule(2)), "Twice a week");
  t.eq("more than that reads as a number", describeRecurrence(weeklyCountRule(4)), "4× a week");
  t.eq("no schedule, nothing to say", describeRecurrence(null), null);
}

t.group("when a task lands");
{
  const h = habit();
  t.eq("on its weekdays", [occursOn(h, MON), occursOn(h, WED), occursOn(h, FRI)], [true, true, true]);
  t.eq("and not on the others", [occursOn(h, TUE), occursOn(h, SAT)], [false, false]);
  t.ok("never before it started", !occursOn(habit({ startDate: "2026-09-16" }), MON));
  t.ok("never once archived", !occursOn(habit({ archivedAt: 1 }), MON));

  const every2 = habit({ recurrence: dailyRule(2), startDate: MON });
  t.eq("a daily interval counts from the start date",
    [occursOn(every2, MON), occursOn(every2, TUE), occursOn(every2, WED)], [true, false, true]);

  const monthly = habit({ recurrence: monthlyRule(16) });
  t.eq("a monthly rule lands on its day", [occursOn(monthly, WED), occursOn(monthly, THU)], [true, false]);

  const quota = habit({ recurrence: weeklyCountRule(3) });
  t.ok("a quota habit is available every day", [MON, TUE, SAT, SUN].every((d) => occursOn(quota, d)));

  const oneOff = newTask({ id: "o1", dueDate: WED });
  t.eq("a one-off lands on its due date only", [occursOn(oneOff, WED), occursOn(oneOff, THU)], [true, false]);
  t.ok("an undated one-off lands nowhere", !occursOn(newTask({ id: "o2" }), WED));
}

t.group("a quota habit's week");
{
  const quota = habit({ recurrence: weeklyCountRule(3) });
  const twice = log([MON, WED]);
  t.eq("progress counts the whole week from any day in it",
    weekProgress(quota, twice, SAT), { done: 2, target: 3, met: false, remaining: 1, weekStart: MON });
  const thrice = log([MON, WED, FRI]);
  t.ok("met once the target is reached", weekProgress(quota, thrice, SAT).met);

  t.ok("it stays on the agenda while the quota is open", isOnAgenda(quota, SAT, twice));
  t.ok("it drops off the agenda once the week is met", !isOnAgenda(quota, SAT, thrice));
  t.ok("...but a day it was done on still shows it", isOnAgenda(quota, FRI, thrice));
  t.eq("the agenda filters the list", agendaForDate([quota], SAT, thrice, "build").length, 0);

  // The bug this shape exists to fix: a kept "3× a week" used to read as four missed days.
  t.ok("an unmet quota day never counts against the day", !countsTowardDay(quota, TUE, twice));
  t.ok("a day it was done on does count", countsTowardDay(quota, MON, twice));
  const fixed = habit({ id: "h2", recurrence: weeklyRule(["sat"]) });
  const day = { ...twice, [SAT]: { h2: { done: true, doneAt: 1 } } };
  t.eq("so a day of kept habits is complete despite an open quota",
    dayStats([quota, fixed], SAT, day, "build"), { total: 1, done: 1, ratio: 1 });
}

t.group("marking things done");
{
  const h = habit();
  const done = toggleDoneReducer(h, FRI, [h], {});
  t.ok("a recurring task records the date", done.dayLog[FRI].h1.done === true);
  t.ok("...and leaves the task alone", done.tasks[0].done === false);
  const undone = toggleDoneReducer(h, FRI, [h], done.dayLog);
  t.eq("toggling back removes the entry", undone.dayLog[FRI], {});

  const oneOff = newTask({ id: "o1", dueDate: FRI });
  const off = toggleDoneReducer(oneOff, FRI, [oneOff], {});
  t.ok("a one-off carries it on the task", off.tasks[0].done === true && off.tasks[0].doneAt > 0);
  t.ok("...and writes nothing to the log", Object.keys(off.dayLog).length === 0);
  t.ok("isDone reads the right place", isDone(h, FRI, done.dayLog) && isDone(off.tasks[0], FRI, {}));
}

t.group("a day's verdict");
{
  const h = habit();
  t.eq("nothing scheduled is not a failure", dayStatus([h], SAT, {}, "build"), null);
  t.eq("scheduled and missed", dayStatus([h], FRI, {}, "build"), false);
  t.eq("scheduled and kept", dayStatus([h], FRI, log([FRI]), "build"), true);
  t.eq("a day with nothing on it has no ratio", dayStats([h], SAT, {}, "build").ratio, null);
}

t.group("streaks");
atDate(TODAY, () => {
  const h = habit(); // mon/wed/fri, so nothing is due on the Saturday
  const kept = log([MON, WED, FRI]);
  t.eq("a habit's streak walks its own schedule", habitStreak(h, [h], kept), 3);
  t.eq("a gap ends it", habitStreak(h, [h], log([WED, FRI])), 2);
  t.eq("no completions, no streak", habitStreak(h, [h], {}), 0);
  t.eq("a one-off has no streak", habitStreak(newTask({ id: "x" }), [], {}), 0);

  const daily = habit({ recurrence: weeklyRule(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) });
  t.eq("today still open doesn't break the day streak",
    computeStreak([daily], log([WED, THU, FRI]), "build"), 3);
  t.eq("a missed day before today does", computeStreak([daily], log([WED, FRI]), "build"), 1);

  const quota = habit({ recurrence: weeklyCountRule(2) });
  const twoWeeks = log([MON, WED, "2026-09-08", "2026-09-10"]);
  t.eq("a quota streak counts weeks, not days", weekStreak(quota, twoWeeks, SAT), 2);
  t.eq("this week still in progress measures from last week",
    weekStreak(quota, log(["2026-09-08", "2026-09-10"]), SAT), 1);
  t.eq("a habit streak defers to the week for quota habits", habitStreak(quota, [quota], twoWeeks), 2);
});

t.group("identity votes");
{
  const a = habit({ id: "h1", pillarId: "health" });
  const b = habit({ id: "h2", pillarId: "health" });
  const c = habit({ id: "h3", kind: "break", pillarId: "mind" });
  const oneOff = newTask({ id: "o1", pillarId: "mind", done: true });
  const dayLog = {
    [MON]: { h1: { done: true }, h2: { done: true }, h3: { done: true } },
    [WED]: { h1: { done: true }, h2: { done: false } },
  };
  const tally = voteTally([a, b, c, oneOff], dayLog);
  t.eq("only completed build habits vote", tally.health, 3);
  t.ok("a break habit doesn't vote", !("mind" in tally) || tally.mind === 1);
  t.eq("a finished one-off votes once", tally.mind, 1);
}

t.group("the tasks view");
{
  const list = [
    newTask({ id: "a", text: "Alpha", order: 3, priority: "low", dueDate: THU }),
    newTask({ id: "b", text: "Beta", order: 1, priority: "high", starred: true }),
    newTask({ id: "c", text: "Gamma", order: 2, priority: "med", dueDate: TUE, notes: "with a note" }),
  ];
  t.eq("manual order", sortTasks(list, "manual").map((x) => x.id), ["b", "c", "a"]);
  t.eq("by date, undated last", sortTasks(list, "date").map((x) => x.id), ["c", "a", "b"]);
  t.eq("starred first", sortTasks(list, "starred").map((x) => x.id), ["b", "c", "a"]);
  t.eq("by priority", sortTasks(list, "priority").map((x) => x.id), ["b", "c", "a"]);

  t.eq("search matches the text", searchTasks(list, "alph").map((x) => x.id), ["a"]);
  t.eq("search matches notes", searchTasks(list, "note").map((x) => x.id), ["c"]);
  t.eq("search matches a subtask",
    searchTasks([newTask({ id: "s", text: "Trip", subtasks: [{ text: "Book flights" }] })], "flights").length, 1);
  t.eq("an empty query matches everything", searchTasks(list, "  ").length, 3);

  const moved = reorderTasks(list, "a", ["b", "c", "a"], -1);
  t.eq("reordering swaps the order values",
    [moved.find((x) => x.id === "a").order, moved.find((x) => x.id === "c").order], [2, 3]);
  t.eq("moving past the end is a no-op", reorderTasks(list, "b", ["b", "c", "a"], -1), list);
}

t.group("grouping by when");
atDate(TODAY, () => {
  const groups = groupTasks([
    newTask({ id: "over", dueDate: WED }),
    newTask({ id: "today", dueDate: SAT }),
    newTask({ id: "tom", dueDate: SUN }),
    newTask({ id: "week", dueDate: "2026-09-24" }),
    newTask({ id: "later", dueDate: "2026-11-01" }),
    newTask({ id: "none" }),
    newTask({ id: "done", dueDate: WED, done: true }),
    habit({ id: "hab", recurrence: weeklyRule(["sat"]) }),
  ]);
  t.eq("overdue", groups.overdue.map((x) => x.id), ["over"]);
  t.eq("today holds both a task and a habit due today", groups.today.map((x) => x.id), ["today", "hab"]);
  t.eq("tomorrow", groups.tomorrow.map((x) => x.id), ["tom"]);
  t.eq("this week", groups.week.map((x) => x.id), ["week"]);
  t.eq("later", groups.later.map((x) => x.id), ["later"]);
  t.eq("no date", groups.noDate.map((x) => x.id), ["none"]);
  t.eq("completed, wherever they were due", groups.completed.map((x) => x.id), ["done"]);
});
