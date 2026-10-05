import { addDays, daysBetween, todayStr } from "./date.js";

// The part of experiments that Today needs: where an experiment is on the calendar, what today asks
// of you, and marking a day done. Kept apart from the statistics so the main bundle carries only this;
// the measuring, testing and wording live in experiments.js, which only the Experiments screen loads.

// ---- A seeded random source ---------------------------------------------------------------
// Math.random would give a different answer each time the same experiment was opened, and would
// let the assignments be re-rolled. This is deterministic from the experiment's own id.
function seedFrom(text) {
  let h = 1779033703 ^ text.length;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
export function rng(text) {
  let a = seedFrom(String(text));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const dayOfTs = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const endDateOf = (exp) => addDays(exp.startDate, exp.days - 1);

/** upcoming · running · ended — where the experiment is on the calendar. */
export function phaseOf(exp, today = todayStr()) {
  if (exp.stoppedAt) return "ended";
  if (today < exp.startDate) return "upcoming";
  if (today > endDateOf(exp)) return "ended";
  return "running";
}

export const dayNumber = (exp, today = todayStr()) => Math.max(0, Math.min(exp.days, daysBetween(exp.startDate, today) + 1));

/** What today asks of you: "do", "skip", or null if the experiment isn't live today. */
export function todayAssignment(exp, today = todayStr()) {
  if (phaseOf(exp, today) !== "running") return null;
  if (exp.mode === "flip") return exp.assignments?.[today] || null;
  return "do";
}

/** Marks a day as followed or not. Returns a new experiment. */
export function setFollowed(exp, date, followed, at = Date.now()) {
  return { ...exp, followed: { ...(exp.followed || {}), [date]: !!followed }, updatedAt: at };
}

export const stopExperiment = (exp, at = Date.now()) => ({ ...exp, stoppedAt: at, updatedAt: at });

/** The local date an experiment was stopped on, or null. */
export const stoppedDate = (exp) => (exp.stoppedAt ? dayOfTs(exp.stoppedAt) : null);

/**
 * The "today" to analyse an experiment as of. For one still running that's today. For one that has
 * run its course it's the day after it ended, so every one of its days is complete. For one stopped
 * early it's the day it was stopped: later days belong to a plan nobody was following any more, and
 * counting them would blur the result.
 */
export function asOf(exp, today = todayStr()) {
  const stop = stoppedDate(exp);
  if (stop) return stop < today ? stop : today;
  const end = endDateOf(exp);
  return end < today ? addDays(end, 1) : today;
}

/** Experiments currently asking something of today, with what they ask. */
export function liveToday(state, today = todayStr()) {
  return (state.experiments || [])
    .map((exp) => ({ exp, assignment: todayAssignment(exp, today) }))
    .filter((x) => x.assignment);
}

/** How many of the days that asked something you did it. */
export function adherence(exp, today = todayStr()) {
  let due = 0, done = 0;
  for (let i = 0; i < exp.days; i++) {
    const date = addDays(exp.startDate, i);
    if (date >= today) break;
    const asked = exp.mode === "flip" ? exp.assignments?.[date] === "do" : true;
    if (!asked) continue;
    due++;
    if (exp.followed?.[date]) done++;
  }
  return { due, done, pct: due ? Math.round((done / due) * 100) : null };
}

