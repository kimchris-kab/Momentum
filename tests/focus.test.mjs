import { atDate, suite } from "./harness.mjs";
import {
  MIN_LOGGED_SECONDS, fmtDuration, focusByDay, focusToday, focusTotals, mmss, newSession,
  shouldLog,
} from "../src/lib/focus.js";
import {
  DEFAULT_BLOCK_MIN, MIN_GAP_MIN, buildTimeline, fmtGap, minutesOf, suggestSlots, taskDuration,
  timeOf,
} from "../src/lib/timeline.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";

const t = suite("focus and timeline");

const TODAY = "2026-09-19";
const CLOCK = `${TODAY}T14:30:00`; // 14:30 = 870 minutes

t.group("logging a session");
{
  const at = new Date(`${TODAY}T09:15:00`).getTime();
  const task = newTask({ id: "t1", text: "Write", pillarId: "craft", kind: "build" });
  const s = newSession({ task, seconds: 1501.6, planned: 25, completed: true, at });
  t.eq("it belongs to the task", [s.taskId, s.taskText, s.pillarId, s.kind], ["t1", "Write", "craft", "build"]);
  t.eq("seconds are whole", s.seconds, 1502);
  t.eq("it lands on the day it ended", s.date, TODAY);
  t.eq("it remembers what was planned", [s.planned, s.completed], [25, true]);

  const adhoc = newSession({ task: null, seconds: 60, at });
  t.eq("a session with no task still has a name", [adhoc.taskId, adhoc.taskText], [null, "Focus"]);

  // A sheet opened and closed again isn't work, and logging it would bury the real thing.
  t.eq("the floor", MIN_LOGGED_SECONDS, 30);
  t.ok("under the floor isn't logged", !shouldLog(29) && !shouldLog(0));
  t.ok("at the floor it is", shouldLog(30) && shouldLog(1200));
}

t.group("reading a duration");
{
  t.eq("seconds", fmtDuration(45), "45s");
  t.eq("minutes", fmtDuration(1500), "25m");
  t.eq("an exact hour", fmtDuration(3600), "1h");
  t.eq("hours and minutes", fmtDuration(5400), "1h 30m");
  t.eq("nothing", fmtDuration(0), "0s");
  t.eq("a negative can't happen, but doesn't print one", fmtDuration(-10), "0s");
  t.eq("a countdown", mmss(90), "1:30");
  t.eq("...padded", mmss(65), "1:05");
  t.eq("...and floored at zero", mmss(-5), "0:00");
}

t.group("totals");
{
  const sessions = [
    { date: "2026-09-17", seconds: 600, taskId: "a", taskText: "Write", pillarId: "craft" },
    { date: "2026-09-18", seconds: 1200, taskId: "a", taskText: "Write", pillarId: "craft" },
    { date: "2026-09-18", seconds: 300, taskId: "b", taskText: "Read", pillarId: "mind" },
    { date: "2026-09-19", seconds: 900, taskId: null, taskText: "Focus", pillarId: null },
    { date: "2026-08-01", seconds: 9999, taskId: "a", taskText: "Write", pillarId: "craft" },
  ];
  const totals = focusTotals(sessions, "2026-09-17", "2026-09-19");
  t.eq("only the window counts", totals.seconds, 3000);
  t.eq("sessions counted", totals.count, 4);
  t.eq("by pillar", totals.byPillar, { craft: 1800, mind: 300 });
  t.eq("top tasks, longest first", totals.topTasks.map((x) => x.text), ["Write", "Focus", "Read"]);
  t.eq("...with their session counts", totals.topTasks[0].count, 2);
  t.eq("an untasked session groups under its own name", totals.topTasks[1].seconds, 900);

  const days = focusByDay(sessions, "2026-09-17", "2026-09-19");
  t.eq("a row per day, including empty ones", days.length, 3);
  t.eq("summed per day", days.map((d) => d.seconds), [600, 1500, 900]);
  t.eq("today's total", focusToday(sessions, TODAY), 900);
  t.eq("a day with nothing on it", focusToday(sessions, "2026-09-16"), 0);
  t.eq("no sessions at all", focusTotals(null, "2026-09-17", "2026-09-19").seconds, 0);
}

t.group("the day's shape");
{
  const at = (id, time, timerMinutes) => newTask({
    id, text: id, time, timerMinutes, kind: "build", startDate: "2026-01-01",
    recurrence: weeklyRule(["sat"]),
  });
  t.eq("a task with no timer still occupies real time", taskDuration(newTask({})), DEFAULT_BLOCK_MIN);
  t.eq("...and one with a timer occupies that", taskDuration(newTask({ timerMinutes: 50 })), 50);
  t.eq("minutes in and out", [minutesOf("07:30"), timeOf(450)], [450, "07:30"]);
  t.eq("no time, no minutes", minutesOf(null), null);
  t.eq("a gap reads in plain words", [fmtGap(45), fmtGap(120), fmtGap(150)],
    ["45 min free", "2h free", "2h 30m free"]);

  // Another day, so no now-marker gets in the way of the arithmetic.
  const plan = buildTimeline([at("a", "09:00"), at("b", "11:00", 60), newTask({ id: "c", text: "loose" })],
    "2026-09-26", {});
  t.eq("timed blocks, in order", plan.scheduled.map((b) => b.task.id), ["a", "b"]);
  t.eq("untimed tasks are kept aside", plan.unscheduled.map((x) => x.id), ["c"]);
  t.eq("busy time", plan.busyMinutes, 90);
  t.eq("the gap between them", plan.items.filter((i) => i.kind === "gap").map((g) => g.minutes), [90]);
  t.eq("first and last", [plan.firstStart, plan.lastEnd], [540, 720]);

  const tight = buildTimeline([at("a", "09:00"), at("b", "09:40")], "2026-09-26", {});
  t.eq("a gap under the floor is changeover, not free time",
    tight.items.filter((i) => i.kind === "gap").length, 0);
  t.eq("the floor", MIN_GAP_MIN, 20);

  // Two things pinned to the same time is a planning error worth showing, not hiding.
  const clash = buildTimeline([at("a", "09:00", 60), at("b", "09:30")], "2026-09-26", {});
  t.ok("an overlap is flagged", clash.items.some((i) => i.kind === "task" && i.overlap));
}

t.group("the now-marker");
atDate(CLOCK, () => {
  const at = (id, time, timerMinutes) => newTask({
    id, text: id, time, timerMinutes, kind: "build", startDate: "2026-01-01",
    recurrence: weeklyRule(["sat"]),
  });
  const kinds = (items) => items.map((i) => i.kind);

  const day = buildTimeline([at("morning", "09:00"), at("evening", "18:00")], TODAY, {});
  t.ok("the marker is on the day you're living", kinds(day.items).includes("now"));
  t.eq("another day has no marker",
    kinds(buildTimeline([at("morning", "09:00")], "2026-09-26", {}).items).includes("now"), false);

  // The marker lands inside the long gap, and the elapsed part of that gap is not free
  // time any more — otherwise "9h free" sits above a line saying it's already half two.
  const gap = day.items.find((i) => i.kind === "gap");
  t.eq("a gap the marker falls inside is trimmed to what's left", gap.start, 870);
  t.eq("...and its length with it", gap.minutes, 18 * 60 - 870);
  t.eq("free time ahead counts only what's ahead", day.freeAhead, 18 * 60 - 870);

  // If now falls inside a task, that task is in progress, so the marker goes after it.
  const during = buildTimeline([at("long", "14:00", 60), at("later", "16:00")], TODAY, {});
  t.eq("a task in progress keeps the marker below it",
    kinds(during.items).slice(0, 2), ["task", "now"]);

  const past = buildTimeline([at("done", "09:00")], TODAY, {});
  t.eq("a day that's already over puts the marker at the end", kinds(past.items), ["task", "now"]);
});

t.group("where something could go");
atDate(CLOCK, () => {
  const at = (id, time, timerMinutes) => newTask({ id, text: id, time, timerMinutes });
  const slots = suggestSlots([at("a", "15:00", 60)], TODAY, 30);
  t.ok("nothing is suggested in the past", slots.every((s) => s.start >= 870));
  // Half an hour from 14:45 would run into the 15:00 block, so the first offer is after it.
  t.eq("nothing is offered that would collide", slots[0].time, "16:00");
  t.ok("...and more after that", slots.length === 3 && slots[2].start > slots[1].start);
  // With the block an hour later there is room in front of it, rounded to a quarter hour.
  t.eq("a gap in front is used when it actually fits",
    suggestSlots([at("a", "16:00", 60)], TODAY, 30)[0].time, "14:45");
  t.ok("slots land on quarter hours", slots.every((s) => s.start % 15 === 0));
  t.ok("they're labelled for reading", slots[0].label.endsWith("PM"));

  const full = suggestSlots([at("a", "14:30", 600)], TODAY, 30);
  t.ok("a day packed to the evening offers nothing left", full.length === 0);

  const other = suggestSlots([], "2026-09-26", 30);
  t.eq("another day starts from the morning", other[0].time, "08:00");
});
