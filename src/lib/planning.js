import { addDays, daysBetween, longDate, parseD, prettyDate, todayStr, weekStartOf, weekdayKey } from "./date.js";
import { isDone, tasksForDate } from "./tasks.js";
// planning -> habits -> tasks; habits never imports this file back, so there is no cycle.
import { habitReliability } from "./habits.js";

// Weeks run Monday to Sunday and are keyed by their Monday. The arithmetic lives in date.js
// so the task layer can reach it without importing this module back.
export const weekStart = weekStartOf;
export const weekEnd = (key) => addDays(key, 6);
export const weekLabel = (key) => `${prettyDate(key)} – ${prettyDate(weekEnd(key))}`;
export const isCurrentWeek = (key) => key === weekStart(todayStr());
export function weekTitle(key) {
  const now = weekStart(todayStr());
  if (key === now) return "This week";
  if (key === addDays(now, 7)) return "Next week";
  if (key === addDays(now, -7)) return "Last week";
  return weekLabel(key);
}

// The execution hole this closes: a one-off task's due date is an exact match, so anything
// left undone yesterday drops off today's plan entirely unless it is pulled forward.
export const overdueTasks = (tasks, today = todayStr()) => tasks
  .filter((t) => t.kind === "todo" && !t.done && !t.archivedAt && t.dueDate && t.dueDate < today)
  .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

export const daysLate = (task, today = todayStr()) => daysBetween(task.dueDate, today);

export const tasksDueBetween = (tasks, from, to) => tasks
  .filter((t) => t.kind === "todo" && !t.archivedAt && t.dueDate && t.dueDate >= from && t.dueDate <= to)
  .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || (a.time || "").localeCompare(b.time || ""));

// What you've actually committed each day next week, so over-scheduling is visible while
// you're planning rather than four weeks later in the review.
export function habitLoad(tasks, from = weekStart()) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(from, i);
    const items = tasksForDate(tasks, date, "build");
    return { date, weekday: weekdayKey(date), label: longDate(date).split(",")[0], count: items.length, items };
  });
}

export const CAPACITY = {
  light: { label: "Room to spare", tone: "good" },
  good: { label: "Realistic", tone: "good" },
  full: { label: "Full", tone: "warn" },
  over: { label: "Overloaded", tone: "bad" },
};
export function capacityOf(count) {
  if (count === 0) return null;
  if (count <= 2) return { ...CAPACITY.light, key: "light" };
  if (count <= 4) return { ...CAPACITY.good, key: "good" };
  if (count <= 6) return { ...CAPACITY.full, key: "full" };
  return { ...CAPACITY.over, key: "over" };
}

export function capacitySummary(load) {
  const busiest = [...load].sort((a, b) => b.count - a.count)[0];
  const total = load.reduce((a, d) => a + d.count, 0);
  const overloaded = load.filter((d) => d.count > 6);
  return { busiest, total, overloaded, average: Math.round((total / 7) * 10) / 10 };
}

// Goals earn their progress from the work linked to them, not from a number you type in.
export function goalProgress(goal, tasks, dayLog) {
  const linked = tasks.filter((t) => t.goalId === goal.id && !t.archivedAt);
  const todos = linked.filter((t) => t.kind === "todo");
  const habits = linked.filter((t) => t.kind === "build" && t.recurrence);
  const doneTodos = todos.filter((t) => t.done).length;

  // A habit contributes how reliably it's been kept over the last fortnight. habitReliability
  // already knows that a quota habit's denominator is its target × weeks rather than the
  // seven days a week it shows up on — counting days here would understate every "3× a week"
  // habit attached to a goal by more than half.
  let habitPct = null;
  if (habits.length) {
    let done = 0, scheduled = 0;
    habits.forEach((h) => {
      const r = habitReliability(h, dayLog, 14);
      done += r.done;
      scheduled += r.scheduled;
    });
    habitPct = scheduled ? Math.round((done / scheduled) * 100) : null;
  }

  const subs = goal.subtasks || [];
  const subDone = subs.filter((s) => s.done).length;

  let pct = 0;
  if (todos.length) pct = Math.round((doneTodos / todos.length) * 100);
  else if (subs.length) pct = Math.round((subDone / subs.length) * 100);
  else if (habitPct !== null) pct = habitPct;

  return {
    linked: linked.length, todos: todos.length, doneTodos, habits: habits.length,
    habitPct, steps: subs.length, doneSteps: subDone, pct: goal.done ? 100 : pct,
  };
}

export function goalHorizon(goal, today = todayStr()) {
  if (!goal.targetDate) return null;
  const left = daysBetween(today, goal.targetDate);
  if (goal.done) return { left, label: "Done", tone: "good" };
  if (left < 0) return { left, label: `${Math.abs(left)}d overdue`, tone: "bad" };
  if (left === 0) return { left, label: "Due today", tone: "warn" };
  if (left <= 7) return { left, label: `${left}d left`, tone: "warn" };
  if (left <= 31) return { left, label: `${Math.ceil(left / 7)}w left`, tone: "good" };
  return { left, label: `${Math.round(left / 30)}mo left`, tone: "good" };
}

export const planFor = (weekPlans, key) => weekPlans?.[key] || { priorities: [], note: "" };
export const planIsEmpty = (plan) => !plan.priorities?.length && !(plan.note || "").trim();

// Prompt to plan at the start of the week, once, and only if the week is still blank
export function planDue(weekPlans) {
  const key = weekStart(todayStr());
  const dow = parseD(todayStr()).getDay();
  const startOfWeek = dow === 0 || dow === 1 || dow === 6;
  return startOfWeek && planIsEmpty(planFor(weekPlans, key));
}

export const focusFor = (dayFocus, date = todayStr()) => dayFocus?.[date] || [];
export const MAX_FOCUS = 3;
