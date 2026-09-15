import { addDays, monthKeyOf, todayStr } from "./date.js";
import { isDone, occursOn, tasksForDate } from "./tasks.js";

// Milestones that actually mean something in habit research / practice: the first week,
// three weeks, a month, the ~66-day median for automaticity, then the long hauls.
export const MILESTONES = [7, 21, 30, 66, 100, 365];
export const FREEZES_PER_MONTH = 2;

export const nextMilestone = (streak) => MILESTONES.find((m) => m > streak) || null;
export const isMilestone = (streak) => MILESTONES.includes(streak);

export const freezesUsedIn = (freezes, mKey) =>
  Object.keys(freezes || {}).filter((d) => monthKeyOf(d) === mKey).length;
export const freezesLeft = (freezes, dateStr = todayStr()) =>
  Math.max(0, FREEZES_PER_MONTH - freezesUsedIn(freezes, monthKeyOf(dateStr)));
export const isFrozen = (freezes, dateStr) => !!freezes?.[dateStr];

// A day only counts against you if something was scheduled, none of it got done, and you
// didn't spend a freeze on it. Frozen days are neutral — they neither extend nor break.
export function dayOutcome(tasks, dateStr, dayLog, freezes, kind = "build") {
  const scheduled = tasksForDate(tasks, dateStr, kind);
  if (scheduled.length === 0) return "empty";
  const done = scheduled.filter((t) => isDone(t, dateStr, dayLog)).length;
  if (done === scheduled.length) return "complete";
  if (isFrozen(freezes, dateStr)) return "frozen";
  return "missed";
}

export function protectedStreak(tasks, dayLog, freezes, kind = "build") {
  let n = 0;
  let cursor = todayStr();
  if (dayOutcome(tasks, cursor, dayLog, freezes, kind) === "missed") cursor = addDays(cursor, -1);
  for (let guard = 0; guard < 400; guard++) {
    const outcome = dayOutcome(tasks, cursor, dayLog, freezes, kind);
    if (outcome === "missed") break;
    if (outcome === "complete") n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function habitStreakProtected(task, dayLog, freezes) {
  if (!task.recurrence) return 0;
  let cursor = todayStr();
  let guard = 0;
  while (!occursOn(task, cursor) && guard < 400) { cursor = addDays(cursor, -1); guard++; }
  if (cursor === todayStr() && !isDone(task, cursor, dayLog)) {
    cursor = addDays(cursor, -1);
    while (!occursOn(task, cursor) && guard < 800) { cursor = addDays(cursor, -1); guard++; }
  }
  let n = 0;
  for (let i = 0; i < 400; i++) {
    if (isDone(task, cursor, dayLog)) n++;
    else if (!isFrozen(freezes, cursor)) break;
    cursor = addDays(cursor, -1);
    let inner = 0;
    while (!occursOn(task, cursor) && inner < 400) { cursor = addDays(cursor, -1); inner++; }
  }
  return n;
}

// The habits that were scheduled yesterday and left undone — the input to the
// never-miss-twice intervention, which is the single best predictor of quitting.
export function missedYesterday(tasks, dayLog, freezes) {
  const y = addDays(todayStr(), -1);
  if (isFrozen(freezes, y)) return [];
  return tasksForDate(tasks, y, "build").filter((t) => !isDone(t, y, dayLog));
}

export const atRiskToday = (tasks, dayLog) =>
  tasksForDate(tasks, todayStr(), "build").filter((t) => !isDone(t, todayStr(), dayLog));

// ---- Rewards ----
export const rewardProgress = (task, streak) => {
  const reward = task.reward;
  if (!reward?.text || !reward?.atDays) return null;
  return {
    ...reward,
    remaining: Math.max(0, reward.atDays - streak),
    ready: streak >= reward.atDays && !reward.claimedAt,
  };
};

// ---- Weekly review ----
export function habitReliability(task, dayLog, days = 28) {
  let done = 0, scheduled = 0;
  let cursor = addDays(todayStr(), -(days - 1));
  for (let i = 0; i < days; i++) {
    if (occursOn(task, cursor)) {
      scheduled++;
      if (isDone(task, cursor, dayLog)) done++;
    }
    cursor = addDays(cursor, 1);
  }
  return { done, scheduled, pct: scheduled ? Math.round((done / scheduled) * 100) : null };
}

export const VERDICTS = {
  thriving: { label: "Thriving", hint: "Holding strong — consider levelling it up." },
  holding: { label: "Holding", hint: "Steady. Leave it alone and let it compound." },
  slipping: { label: "Slipping", hint: "Shrink it or move it to a time that actually works." },
  stalled: { label: "Stalled", hint: "Make it two minutes, cut days, or drop it honestly." },
  new: { label: "Too new", hint: "Not enough history yet — give it another week." },
};

export function reviewHabits(tasks, dayLog, days = 28) {
  return tasks
    .filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt)
    .map((t) => {
      const r = habitReliability(t, dayLog, days);
      let verdict = "new";
      if (r.scheduled >= 3) {
        if (r.pct >= 85) verdict = "thriving";
        else if (r.pct >= 60) verdict = "holding";
        else if (r.pct >= 30) verdict = "slipping";
        else verdict = "stalled";
      }
      return { task: t, ...r, verdict };
    })
    .sort((a, b) => (a.pct ?? 101) - (b.pct ?? 101));
}

export const lastReviewDate = (reviews) =>
  (reviews || []).map((r) => r.date).sort().slice(-1)[0] || null;

export function reviewDue(reviews) {
  const last = lastReviewDate(reviews);
  if (!last) return true;
  return last <= addDays(todayStr(), -7);
}
