import { addDays, daysBetween, parseD, todayStr, weekStartOf } from "./date.js";
import { isDone, occursOn } from "./tasks.js";
import { isFrozen } from "./habits.js";
import { GRADUATION_MEAN, graduationStatus } from "./automaticity.js";

// Spec items 8, 9 and 11, plus the "rewards paradox" row: extrinsic rewards help a habit
// START but crowd out intrinsic motivation once it's running (Lepper, Greene & Nisbett 1973;
// SDT). The answer isn't to ban points — it's to use them early and take them away as
// automaticity rises, which is exactly what the SRBAI signal is for.
export const REWARD_TYPES = [
  {
    id: "intrinsic",
    label: "The thing itself",
    help: "Nothing bolted on — you do it because the doing is worth it. The most durable kind, and the one every habit should end up at.",
  },
  {
    id: "bundled",
    label: "Bundled",
    help: "Pair it with something you already enjoy — the audiobook you only get at the gym (Milkman's temptation bundling). Immediate, and it doesn't crowd out the habit.",
  },
  {
    id: "extrinsic",
    label: "A treat at a milestone",
    help: "Useful to get started. It fades on its own as the habit becomes automatic, because a reward that outlives its usefulness starts replacing the motivation it was meant to seed.",
  },
];
export const REWARD_BY_ID = Object.fromEntries(REWARD_TYPES.map((r) => [r.id, r]));
export const DEFAULT_REWARD_TYPE = "intrinsic";

export const rewardTypeOf = (task) =>
  task?.rewardType || (task?.reward?.text ? "extrinsic" : DEFAULT_REWARD_TYPE);

/**
 * How much of the extrinsic scaffolding is still in place. Fades from 1 to 0 as SRBAI climbs
 * toward graduation; a graduated habit keeps nothing.
 */
export function rewardTaper(task, srbai) {
  if (rewardTypeOf(task) !== "extrinsic") return { active: true, fade: 0, status: null };
  const status = graduationStatus(task, srbai);
  if (status.mean === null) return { active: true, fade: 0, status };
  if (status.id === "graduated") return { active: false, fade: 1, status };
  // Linear from "no reading yet" to the graduation threshold.
  const fade = Math.max(0, Math.min(1, (status.mean - 2) / (GRADUATION_MEAN - 2)));
  return { active: true, fade: Math.round(fade * 100) / 100, status };
}

// ---- Comeback: the Milkman megastudy's top intervention ----
// Of 54 interventions across 61,293 people, the best-performing one rewarded RETURNING after
// a missed session. Momentum rewards streaks; it never rewarded the return. This does.
const LOOKBACK = 14;

/** Did this habit miss a scheduled day recently and then come back today? */
export function comebackToday(task, dayLog, freezes, today = todayStr()) {
  if (task.kind !== "build" || !task.recurrence) return null;
  if (!isDone(task, today, dayLog)) return null;

  // Walk back over the habit's own schedule looking for a miss, stopping at the first
  // earlier completion — a comeback is about the gap immediately behind you.
  let missed = 0;
  let cursor = addDays(today, -1);
  for (let i = 0; i < LOOKBACK; i++) {
    if (occursOn(task, cursor)) {
      if (isDone(task, cursor, dayLog)) break;
      if (!isFrozen(freezes, cursor)) missed++;
    }
    cursor = addDays(cursor, -1);
  }
  if (!missed) return null;
  return { task, missedDays: missed, date: today };
}

export function comebacksToday(tasks, dayLog, freezes, today = todayStr()) {
  return tasks
    .map((t) => comebackToday(t, dayLog, freezes, today))
    .filter(Boolean);
}

export const COMEBACK_COPY = {
  1: "You missed one and came straight back. That's the whole skill — the streak was never the point, the returning is.",
  2: "Two days off and you're back. Most people don't come back at all; this is the move that separates a lapse from a relapse.",
  default: "Back after a gap. Nothing about the time away matters now — what matters is that the chain starts again today.",
};
export const comebackMessage = (missedDays) =>
  COMEBACK_COPY[missedDays] || COMEBACK_COPY.default;

// ---- Fresh starts (spec item 11) ----
// Dai, Milkman & Riis (2014): aspirational behaviour spikes after temporal landmarks, via a
// new "mental accounting period" that files past failures under the old self. With Dai's own
// 2018 caveat attached, and honoured below: resets DEMOTIVATE people who were already
// succeeding, so anyone on track never sees this.
export const LANDMARKS = [
  { id: "year", label: "a new year", test: (d) => d.getMonth() === 0 && d.getDate() <= 3 },
  { id: "month", label: "a new month", test: (d) => d.getDate() <= 2 },
  { id: "week", label: "a new week", test: (d) => d.getDay() === 1 },
  { id: "birthday", label: "your birthday", test: () => false },   // set from settings below
];

export function landmarkFor(dateStr = todayStr(), birthday = null) {
  const d = parseD(dateStr);
  if (birthday) {
    const [bm, bd] = String(birthday).split("-").map(Number);
    if (d.getMonth() + 1 === bm && d.getDate() === bd) {
      return { id: "birthday", label: "your birthday" };
    }
  }
  return LANDMARKS.find((l) => l.test(d)) || null;
}

const LAPSED_DAYS = 4;

/** Has the person actually drifted? Nothing kept in the last few scheduled days. */
export function isLapsed(tasks, dayLog, today = todayStr(), days = LAPSED_DAYS) {
  const habits = tasks.filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt);
  if (!habits.length) return false;
  let scheduled = 0;
  let done = 0;
  for (let i = 1; i <= days; i++) {
    const d = addDays(today, -i);
    habits.forEach((t) => {
      if (!occursOn(t, d)) return;
      scheduled++;
      if (isDone(t, d, dayLog)) done++;
    });
  }
  if (scheduled < 2) return false;
  return done / scheduled < 0.25;
}

/**
 * The fresh-start prompt, or null. Two gates, both required: a temporal landmark, and
 * actually having drifted. Offering a reset to someone mid-streak is the documented way to
 * put them off.
 */
export function freshStart(state, today = todayStr()) {
  const landmark = landmarkFor(today, state.settings?.birthday);
  if (!landmark) return null;
  if (!isLapsed(state.tasks || [], state.dayLog || {}, today)) return null;
  if ((state.freshStarts || []).some((f) => f.date === today)) return null;

  return {
    id: `${landmark.id}:${today}`,
    landmark,
    date: today,
    title: `It's ${landmark.label}`,
    body: "Whatever the last stretch looked like, it belongs to the old accounting period. "
      + "Pick one habit — just one — and start the count from today.",
  };
}
