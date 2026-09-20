import { atDate, suite } from "./harness.mjs";
import {
  MAX_FOCUS, capacityOf, capacitySummary, daysLate, focusFor, goalHorizon, goalProgress,
  habitLoad, planDue, planFor, planIsEmpty, overdueTasks, tasksDueBetween, weekEnd,
  weekStart, weekTitle,
} from "../src/lib/planning.js";
import {
  entryText, filterEntries, groupByMonth, journalStats, onThisDay, toMarkdown, wordCount,
  writingStreak,
} from "../src/lib/journal.js";
import { newTask, weeklyCountRule, weeklyRule } from "../src/lib/tasks.js";

const t = suite("planning and journal");

const TODAY = "2026-09-19";          // Saturday
const CLOCK = `${TODAY}T12:00:00`;
const MONDAY = "2026-09-14";
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const habit = (patch) => newTask({
  id: "h1", kind: "build", text: "Walk", startDate: "2026-01-01",
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const days = (from, n) => {
  const out = [];
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
};
const log = (dates, id = "h1") =>
  Object.fromEntries(dates.map((d) => [d, { [id]: { done: true, doneAt: 1 } }]));

t.group("weeks");
atDate(CLOCK, () => {
  t.eq("a week is keyed by its Monday", weekStart(TODAY), MONDAY);
  t.eq("...and ends on the Sunday", weekEnd(MONDAY), "2026-09-20");
  t.eq("this one", weekTitle(MONDAY), "This week");
  t.eq("the next", weekTitle("2026-09-21"), "Next week");
  t.eq("the last", weekTitle("2026-09-07"), "Last week");
  t.ok("anything further off is just dated", /Aug/.test(weekTitle("2026-08-03")));
});

t.group("what fell through");
atDate(CLOCK, () => {
  const tasks = [
    newTask({ id: "a", dueDate: "2026-09-17" }),
    newTask({ id: "b", dueDate: "2026-09-10" }),
    newTask({ id: "c", dueDate: TODAY }),
    newTask({ id: "d", dueDate: "2026-09-10", done: true }),
    newTask({ id: "e", dueDate: "2026-09-10", archivedAt: 1 }),
    habit({ id: "f" }),
  ];
  // A one-off's due date is an exact match, so anything left undone yesterday drops off
  // today's plan entirely unless it's pulled forward.
  t.eq("late and unfinished, oldest first", overdueTasks(tasks, TODAY).map((x) => x.id), ["b", "a"]);
  t.ok("finished ones aren't late", !overdueTasks(tasks, TODAY).some((x) => x.id === "d"));
  t.ok("archived ones aren't either", !overdueTasks(tasks, TODAY).some((x) => x.id === "e"));
  t.ok("a habit is never 'overdue' — it either landed or it didn't",
    !overdueTasks(tasks, TODAY).some((x) => x.id === "f"));
  t.eq("how late", daysLate({ dueDate: "2026-09-10" }, TODAY), 9);
  t.eq("what's due in a window", tasksDueBetween(tasks, TODAY, "2026-09-30").map((x) => x.id), ["c"]);
});

t.group("capacity");
atDate(CLOCK, () => {
  const load = habitLoad([habit(), habit({ id: "h2" }), habit({ id: "h3", recurrence: weeklyRule(["mon"]) })], MONDAY);
  t.eq("a row per day", load.length, 7);
  t.eq("Monday carries all three", load[0].count, 3);
  t.eq("...and Tuesday only the daily ones", load[1].count, 2);

  t.eq("an empty day has no verdict at all", capacityOf(0), null);
  t.eq("two is room to spare", capacityOf(2).key, "light");
  t.eq("four is realistic", capacityOf(4).key, "good");
  t.eq("six is full", capacityOf(6).key, "full");
  t.eq("seven is overloaded", capacityOf(7).key, "over");

  const summary = capacitySummary(load);
  t.eq("the busiest day is named", summary.busiest.count, 3);
  t.eq("...alongside the week's total", summary.total, 15);
  t.eq("...and its daily average", summary.average, 2.1);
});

t.group("goals earn their progress");
atDate(CLOCK, () => {
  const goal = { id: "g1", text: "Run 10k", subtasks: [] };
  const todos = [
    newTask({ id: "t1", goalId: "g1", done: true }),
    newTask({ id: "t2", goalId: "g1" }),
    newTask({ id: "t3", goalId: "other" }),
  ];
  const p = goalProgress(goal, todos, {});
  t.eq("linked work counts, other work doesn't", [p.linked, p.todos, p.doneTodos], [2, 2, 1]);
  t.eq("...as a percentage", p.pct, 50);

  t.eq("with no linked work, the goal's own steps carry it",
    goalProgress({ ...goal, subtasks: [{ done: true }, { done: false }] }, [], {}).pct, 50);
  t.eq("a finished goal is finished", goalProgress({ ...goal, done: true }, [], {}).pct, 100);
  t.eq("nothing linked at all", goalProgress(goal, [], {}).pct, 0);

  // The bug this guards: counting a quota habit by days rather than by what it asked for
  // scored a kept "3× a week" at 43%.
  const quota = habit({ id: "q1", goalId: "g1", recurrence: weeklyCountRule(3) });
  const kept = log(["2026-09-08", "2026-09-10", "2026-09-12", "2026-09-15", "2026-09-17", "2026-09-19"], "q1");
  t.eq("a kept quota habit scores as kept", goalProgress(goal, [quota], kept).pct, 100);
});

t.group("goal horizons");
atDate(CLOCK, () => {
  t.eq("no date, no horizon", goalHorizon({ id: 1 }, TODAY), null);
  t.eq("overdue", goalHorizon({ targetDate: "2026-09-12" }, TODAY).label, "7d overdue");
  t.eq("today", goalHorizon({ targetDate: TODAY }, TODAY).label, "Due today");
  t.eq("this week", goalHorizon({ targetDate: "2026-09-24" }, TODAY).label, "5d left");
  t.eq("weeks out", goalHorizon({ targetDate: "2026-10-10" }, TODAY).label, "3w left");
  t.eq("months out", goalHorizon({ targetDate: "2026-12-19" }, TODAY).label, "3mo left");
  t.eq("a finished goal has arrived", goalHorizon({ targetDate: "2026-09-12", done: true }, TODAY).label, "Done");
});

t.group("the week's plan");
atDate(CLOCK, () => {
  t.eq("an unplanned week", planFor({}, MONDAY), { priorities: [], note: "" });
  t.ok("...is empty", planIsEmpty(planFor({}, MONDAY)));
  t.ok("a note alone counts as planned", !planIsEmpty({ priorities: [], note: "Ship it" }));
  // Today is a Saturday, which is when a week is worth planning.
  t.ok("a blank week is worth a prompt at the weekend", planDue({}));
  t.ok("...but not once it's planned", !planDue({ [MONDAY]: { priorities: ["a"], note: "" } }));
  t.eq("at most three things carry a day", MAX_FOCUS, 3);
  t.eq("a day with no focus set", focusFor({}, TODAY), []);
});

t.group("journal counting");
atDate(CLOCK, () => {
  t.eq("words", wordCount("  three  little   words "), 3);
  t.eq("nothing", wordCount(""), 0);
  t.eq("a gratitude list is its items", entryText({ kind: "gratitude", items: ["tea", "", "rain"] }), "tea\nrain");
  t.eq("a free entry is its text", entryText({ kind: "free", text: "A good day." }), "A good day.");

  const entries = [
    { id: 1, date: TODAY, kind: "free", text: "one two three", moods: ["calm"], favorite: true },
    { id: 2, date: "2026-09-18", kind: "free", text: "four five", moods: ["tired"], pillarId: "health" },
    { id: 3, date: "2026-08-02", kind: "gratitude", items: ["six"] },
  ];
  const stats = journalStats(entries, []);
  t.eq("entries", stats.total, 3);
  t.eq("words across all of them", stats.words, 6);
  t.eq("this month only", stats.thisMonth, 2);
  t.eq("days written on", stats.daysWritten, 3);
  t.eq("favourites", stats.favourites, 1);
  t.eq("the longest one is found", stats.longest.id, 1);

  // Both are writing; penalising one for using the other would be pointless bookkeeping.
  t.eq("a check-in reflection keeps the streak alive",
    writingStreak([{ date: TODAY }], [{ date: "2026-09-18", note: "tired but fine" }]), 2);
  t.eq("today still blank doesn't break it", writingStreak([{ date: "2026-09-18" }], []), 1);
  t.eq("a gap ends it", writingStreak([{ date: "2026-09-16" }], []), 0);
});

t.group("finding an entry again");
{
  const entries = [
    { id: 1, date: "2026-09-19", kind: "free", text: "Rain all day", moods: ["calm"], favorite: true },
    { id: 2, date: "2026-09-18", kind: "free", text: "Long run", moods: ["tired"], pillarId: "health" },
    { id: 3, date: "2026-09-17", kind: "free", text: "Quiet", prompt: "What went well?" },
  ];
  const ids = (f) => filterEntries(entries, f).map((e) => e.id);
  t.eq("by text", ids({ query: "rain" }), [1]);
  t.eq("by the prompt it answered", ids({ query: "went well" }), [3]);
  t.eq("by mood", ids({ mood: "tired" }), [2]);
  t.eq("by pillar", ids({ pillarId: "health" }), [2]);
  t.eq("favourites only", ids({ favouritesOnly: true }), [1]);
  t.eq("everything", ids({}).length, 3);

  const grouped = groupByMonth([
    { date: "2026-09-19", entries: [entries[0]] },
    { date: "2026-08-02", entries: [entries[1], entries[2]] },
  ]);
  t.eq("newest month first", grouped.map((g) => g.mKey), ["2026-09", "2026-08"]);
  t.eq("...with a readable label", /September 2026/.test(grouped[0].label), true);
  t.eq("...and a count", grouped[1].entryCount, 2);
}

t.group("on this day");
{
  const entries = [
    { id: 1, date: "2026-08-19", kind: "free", text: "A month ago" },
    { id: 2, date: "2025-09-19", kind: "free", text: "A year ago" },
    { id: 3, date: "2026-09-18", kind: "free", text: "Yesterday, which doesn't count" },
  ];
  const marks = onThisDay(entries, TODAY);
  t.eq("only the anniversaries that have something", marks.map((m) => m.entry.id), [1, 2]);
  t.eq("...each labelled", marks.map((m) => m.label), ["A month ago", "A year ago"]);
  // The 31st has no counterpart in a 30-day month; it has to land somewhere sensible.
  t.eq("a month before the 31st lands on the last day of that month",
    onThisDay([{ id: 9, date: "2026-09-30", kind: "free", text: "x" }], "2026-10-31")[0].entry.id, 9);
  t.eq("nothing to show", onThisDay([], TODAY), []);
}

t.group("exporting the journal");
{
  const md = toMarkdown(
    [{ id: 1, date: "2026-09-19", kind: "free", text: "A good day.", moods: ["calm"] }],
    [{ date: "2026-09-19", note: "Tired but fine", feel: 4 }]);
  t.ok("it's markdown", md.includes("#"));
  t.ok("the entry is in it", md.includes("A good day."));
  t.ok("so is the check-in reflection", md.includes("Tired but fine"));
}
