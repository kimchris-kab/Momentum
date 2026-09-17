import { addDays, daysBetween, dstr, parseD, todayStr, weekStartOf, weekdayKey } from "./date.js";
import { WK_ORDER } from "../data/constants.js";

// A single Task shape backs all three kinds of thing the app tracks:
//   kind "todo"  — an ad-hoc task (Google Tasks style)
//   kind "build" — a habit you're building (shows in the day's plan, feeds streaks + identity votes)
//   kind "break" — a habit you're avoiding (checking it off means you stayed clean)
// Recurrence is what used to be the weekday "routine" template; a task with no recurrence is a
// one-off that lives on its due date (or in "No date" until you give it one).
export const newTask = (patch = {}) => ({
  id: `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  kind: "todo",
  listId: "inbox",
  text: "",
  notes: "",
  starred: false,
  priority: "med",
  pillarId: null,
  dueDate: null,
  time: null,
  recurrence: null,
  subtasks: [],
  location: null,
  stackAfter: null,
  bundle: null,
  twoMin: null,
  trigger: null,
  done: false,
  doneAt: null,
  order: Date.now(),
  createdAt: Date.now(),
  archivedAt: null,
  ...patch,
});

export const weeklyRule = (weekdays) => ({ freq: "weekly", interval: 1, weekdays, monthDay: null });
export const dailyRule = (interval = 1) => ({ freq: "daily", interval, weekdays: [], monthDay: null });
export const monthlyRule = (monthDay) => ({ freq: "monthly", interval: 1, weekdays: [], monthDay });
// "3× a week" — a quota, not a set of days. The week is the unit of judgement, so which
// days you use is up to you. Pinning it to fixed weekdays (as this app used to) reports a
// kept habit as four missed days every week.
export const weeklyCountRule = (timesPerWeek = 3) => ({
  freq: "weeklyCount", interval: 1, weekdays: [], monthDay: null,
  timesPerWeek: Math.max(1, Math.min(7, Math.round(timesPerWeek) || 3)),
});

export const isFlexible = (task) => task?.recurrence?.freq === "weeklyCount";
export const weeklyTarget = (task) =>
  Math.max(1, Math.min(7, task?.recurrence?.timesPerWeek || 3));
export const streakUnit = (task) => (isFlexible(task) ? "week" : "day");

// How far into this week's quota you are. `dateStr` can be any day in the week you're asking about.
export function weekProgress(task, dayLog, dateStr = todayStr()) {
  const target = weeklyTarget(task);
  const start = weekStartOf(dateStr);
  let done = 0;
  for (let i = 0; i < 7; i++) {
    if (dayLog?.[addDays(start, i)]?.[task.id]?.done) done++;
  }
  return { done, target, met: done >= target, remaining: Math.max(0, target - done), weekStart: start };
}

export function describeRecurrence(rec) {
  if (!rec) return null;
  if (rec.freq === "daily") return rec.interval > 1 ? `Every ${rec.interval} days` : "Every day";
  if (rec.freq === "monthly") return `Monthly on day ${rec.monthDay}`;
  if (rec.freq === "weeklyCount") {
    const n = Math.max(1, Math.min(7, rec.timesPerWeek || 3));
    return n === 1 ? "Once a week" : n === 2 ? "Twice a week" : `${n}× a week`;
  }
  const days = rec.weekdays || [];
  if (days.length === 7) return "Every day";
  if (days.length === 5 && ["mon", "tue", "wed", "thu", "fri"].every((d) => days.includes(d))) return "Weekdays";
  if (days.length === 2 && days.includes("sat") && days.includes("sun")) return "Weekends";
  if (days.length === 0) return "Weekly";
  const order = WK_ORDER.filter((d) => days.includes(d));
  return order.map((d) => d[0].toUpperCase() + d.slice(1, 3)).join(", ");
}

// Does this task land on the given date?
export function occursOn(task, dateStr) {
  if (task.archivedAt) return false;
  const rec = task.recurrence;
  if (!rec) return task.dueDate === dateStr;
  const startsOn = task.startDate || dstr(new Date(task.createdAt || Date.now()));
  if (dateStr < startsOn) return false;
  // A quota habit is available every day; the week decides whether you kept it.
  if (rec.freq === "weeklyCount") return true;
  if (rec.freq === "daily") {
    const step = Math.max(1, rec.interval || 1);
    return daysBetween(startsOn, dateStr) % step === 0;
  }
  if (rec.freq === "monthly") return parseD(dateStr).getDate() === rec.monthDay;
  return (rec.weekdays || []).includes(weekdayKey(dateStr));
}

export const tasksForDate = (tasks, dateStr, kind) =>
  tasks.filter((t) => (kind ? t.kind === kind : true) && occursOn(t, dateStr));

// What a day still wants from you. A quota habit drops off once the week's target is met,
// rather than sitting there asking for a tap it no longer needs.
export const isOnAgenda = (task, dateStr, dayLog) => {
  if (!occursOn(task, dateStr)) return false;
  if (!isFlexible(task)) return true;
  if (isDone(task, dateStr, dayLog)) return true;
  return !weekProgress(task, dayLog, dateStr).met;
};

export const agendaForDate = (tasks, dateStr, dayLog, kind) =>
  tasksForDate(tasks, dateStr, kind).filter((t) => isOnAgenda(t, dateStr, dayLog));

// Recurring tasks record completion per date; one-off tasks carry it on the task itself.
export const isDone = (task, dateStr, dayLog) =>
  task.recurrence ? !!dayLog?.[dateStr]?.[task.id]?.done : !!task.done;

export function toggleDoneReducer(task, dateStr, tasks, dayLog) {
  const nowDone = !isDone(task, dateStr, dayLog);
  if (task.recurrence) {
    const day = { ...(dayLog[dateStr] || {}) };
    if (nowDone) day[task.id] = { done: true, doneAt: Date.now() };
    else delete day[task.id];
    return { tasks, dayLog: { ...dayLog, [dateStr]: day } };
  }
  return {
    tasks: tasks.map((t) => t.id === task.id ? { ...t, done: nowDone, doneAt: nowDone ? Date.now() : null } : t),
    dayLog,
  };
}

export const subtaskProgress = (task) => {
  const list = task.subtasks || [];
  return { done: list.filter((s) => s.done).length, total: list.length };
};

// ---- Day-level rollups ----
// A quota habit is judged by its week, never by its day: it can add credit to a day but can
// never make one look incomplete. Counting it as "scheduled" every day is what made "3× a
// week" read as four misses a week.
export const countsTowardDay = (task, dateStr, dayLog) =>
  !isFlexible(task) || isDone(task, dateStr, dayLog);

export function dayStats(tasks, dateStr, dayLog, kind = "build") {
  const counted = tasksForDate(tasks, dateStr, kind).filter((t) => countsTowardDay(t, dateStr, dayLog));
  const done = counted.filter((t) => isDone(t, dateStr, dayLog)).length;
  return { total: counted.length, done, ratio: counted.length ? done / counted.length : null };
}

// null = nothing was scheduled, so the day neither breaks nor extends a streak
export function dayStatus(tasks, dateStr, dayLog, kind = "build") {
  const { total, done } = dayStats(tasks, dateStr, dayLog, kind);
  if (total === 0) return null;
  return done === total;
}

export function computeStreak(tasks, dayLog, kind = "build") {
  let n = 0;
  let cursor = todayStr();
  if (dayStatus(tasks, cursor, dayLog, kind) === false) cursor = addDays(cursor, -1);
  for (let guard = 0; guard < 400; guard++) {
    const status = dayStatus(tasks, cursor, dayLog, kind);
    if (status === false) break;
    if (status === true) n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

// Consecutive weeks a quota habit hit its target. The current week only counts once the
// quota is met — until then it's still in progress, not broken, so the streak is measured
// from last week rather than reading as zero every Monday morning.
export function weekStreak(task, dayLog, today = todayStr()) {
  let cursor = weekStartOf(today);
  if (!weekProgress(task, dayLog, cursor).met) cursor = addDays(cursor, -7);
  let n = 0;
  for (let i = 0; i < 260; i++) {
    if (!weekProgress(task, dayLog, cursor).met) break;
    n++;
    cursor = addDays(cursor, -7);
  }
  return n;
}

// Consecutive completed occurrences of one recurring task, walking back through its own schedule
export function habitStreak(task, tasks, dayLog) {
  if (!task.recurrence) return 0;
  if (isFlexible(task)) return weekStreak(task, dayLog);
  let cursor = todayStr();
  let guard = 0;
  while (!occursOn(task, cursor) && guard < 400) { cursor = addDays(cursor, -1); guard++; }
  if (cursor === todayStr() && !isDone(task, cursor, dayLog)) {
    cursor = addDays(cursor, -1);
    while (!occursOn(task, cursor) && guard < 800) { cursor = addDays(cursor, -1); guard++; }
  }
  let n = 0;
  for (let i = 0; i < 200; i++) {
    if (!isDone(task, cursor, dayLog)) break;
    n++;
    cursor = addDays(cursor, -1);
    let inner = 0;
    while (!occursOn(task, cursor) && inner < 400) { cursor = addDays(cursor, -1); inner++; }
  }
  return n;
}

export function heatmapDays(tasks, dayLog, numDays = 84) {
  const out = [];
  let cursor = addDays(todayStr(), -(numDays - 1));
  for (let i = 0; i < numDays; i++) {
    out.push({ date: cursor, ratio: dayStats(tasks, cursor, dayLog, "build").ratio });
    cursor = addDays(cursor, 1);
  }
  return out;
}

// Every completed build-habit is a vote for the identity behind its pillar
export function voteTally(tasks, dayLog) {
  const tally = {};
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));
  Object.values(dayLog || {}).forEach((day) => {
    Object.entries(day).forEach(([taskId, entry]) => {
      const t = byId[taskId];
      if (entry?.done && t?.pillarId && t.kind === "build") tally[t.pillarId] = (tally[t.pillarId] || 0) + 1;
    });
  });
  tasks.forEach((t) => {
    if (!t.recurrence && t.done && t.pillarId) tally[t.pillarId] = (tally[t.pillarId] || 0) + 1;
  });
  return tally;
}

// ---- Tasks-view grouping, sorting, search ----
export const SORT_MODES = [
  { id: "manual", label: "My order" },
  { id: "date", label: "Date" },
  { id: "starred", label: "Starred" },
  { id: "priority", label: "Priority" },
];
const PRIORITY_RANK = { high: 0, med: 1, low: 2 };

export function sortTasks(list, mode) {
  const copy = [...list];
  if (mode === "date") {
    copy.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return a.order - b.order;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return a.dueDate.localeCompare(b.dueDate) || (a.time || "").localeCompare(b.time || "");
    });
  } else if (mode === "starred") {
    copy.sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || a.order - b.order);
  } else if (mode === "priority") {
    copy.sort((a, b) => PRIORITY_RANK[a.priority || "med"] - PRIORITY_RANK[b.priority || "med"] || a.order - b.order);
  } else {
    copy.sort((a, b) => a.order - b.order);
  }
  return copy;
}

export function searchTasks(tasks, query) {
  const q = query.trim().toLowerCase();
  if (!q) return tasks;
  return tasks.filter((t) =>
    t.text.toLowerCase().includes(q) ||
    (t.notes || "").toLowerCase().includes(q) ||
    (t.subtasks || []).some((s) => s.text.toLowerCase().includes(q)));
}

export function groupTasks(tasks) {
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  const weekEnd = addDays(today, 7);
  const groups = { overdue: [], today: [], tomorrow: [], week: [], later: [], noDate: [], completed: [] };
  tasks.forEach((t) => {
    if (t.done) { groups.completed.push(t); return; }
    if (t.recurrence) {
      if (occursOn(t, today)) groups.today.push(t);
      else groups.later.push(t);
      return;
    }
    if (!t.dueDate) { groups.noDate.push(t); return; }
    if (t.dueDate < today) groups.overdue.push(t);
    else if (t.dueDate === today) groups.today.push(t);
    else if (t.dueDate === tomorrow) groups.tomorrow.push(t);
    else if (t.dueDate <= weekEnd) groups.week.push(t);
    else groups.later.push(t);
  });
  groups.completed.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  return groups;
}

// Move a task up or down within the list it is shown in, by rewriting `order`
export function reorderTasks(tasks, movingId, siblingIds, direction) {
  const idx = siblingIds.indexOf(movingId);
  const swapWith = siblingIds[idx + direction];
  if (idx < 0 || swapWith === undefined) return tasks;
  const a = tasks.find((t) => t.id === movingId);
  const b = tasks.find((t) => t.id === swapWith);
  if (!a || !b) return tasks;
  return tasks.map((t) => {
    if (t.id === a.id) return { ...t, order: b.order };
    if (t.id === b.id) return { ...t, order: a.order };
    return t;
  });
}

export const DEFAULT_LISTS = [
  { id: "inbox", name: "My Tasks", color: "#E8B75D", order: 0, createdAt: 0 },
];
