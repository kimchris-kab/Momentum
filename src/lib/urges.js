import { addDays, dstr, todayStr } from "./date.js";

// The break side of the app used to be a build habit with the label inverted: one tick for
// "stayed clean", and an untouched day for everything else. That made a slip and a day the
// app simply wasn't opened the same record — absence — so nothing could ever be said about
// when or why a habit breaks. This is the missing half: urges, ridden out or not, and lapses,
// each recorded at the moment rather than reconstructed later.

/** How long to ride an urge out. Urges rise, peak and fall; most are gone inside twenty. */
export const URGE_MINUTES = 15;
export const URGE_PRESETS = [5, 10, 15, 20];

// What was going on, in the terms relapse-prevention work uses. HALT — hungry, angry, lonely,
// tired — is the classic short list; the rest are the other states that turn up most in
// lapse diaries. "Just habit" is there on purpose: plenty of slips have no feeling behind
// them at all, and forcing one would make the record less true.
export const FEELINGS = [
  { id: "bored", label: "Bored" },
  { id: "stressed", label: "Stressed" },
  { id: "tired", label: "Tired" },
  { id: "lonely", label: "Lonely" },
  { id: "anxious", label: "Anxious" },
  { id: "angry", label: "Angry" },
  { id: "hungry", label: "Hungry" },
  { id: "celebrating", label: "Celebrating" },
  { id: "habit", label: "Just habit" },
];
export const FEELING_BY_ID = Object.fromEntries(FEELINGS.map((f) => [f.id, f]));

// ---- The note from calm you ----
// The hot–cold empathy gap: calm, you underestimate how strong the urge will be; in the urge,
// you can't reach the reasoning you had when calm. A note written cold and read hot is the
// bridge. It is the person's own words by design — self-generated reasons persuade far more
// than supplied ones — so the app only ever asks, it never fills anything in.
//
// Each prompt has a moment when it is easiest to answer honestly, and that is when it's asked.
export const CALM_PROMPTS = [
  {
    id: "why",
    label: "Why I'm stopping",
    placeholder: "In your own words — the reasons that are actually yours.",
    // Written while setting the habit up: the one time you're calm and thinking about it.
    moment: "setup",
  },
  {
    id: "after",
    label: "An hour after giving in, I'll feel…",
    placeholder: "Play the tape forward. Not the first five minutes — the hour after.",
    // Asked straight after a slip, which is the only time the answer isn't a guess.
    moment: "lapse",
  },
  {
    id: "passes",
    label: "What I know about this urge",
    placeholder: "It peaks and fades. What got you through last time?",
    // Asked straight after riding one out, while what helped is still fresh.
    moment: "rodeOut",
  },
];
export const CALM_PROMPT_BY_ID = Object.fromEntries(CALM_PROMPTS.map((p) => [p.id, p]));

const clean = (s) => (typeof s === "string" ? s.trim() : "");

/** The note's parts that have something in them, in reading order. */
export const calmNoteParts = (task) =>
  CALM_PROMPTS
    .map((p) => ({ ...p, text: clean(task?.calmNote?.[p.id]) }))
    .filter((p) => p.text);

export const hasCalmNote = (task) => calmNoteParts(task).length > 0;

/** Which prompt to put in front of someone after an event, or null if there's nothing to ask. */
export const promptAfter = (event) =>
  CALM_PROMPTS.find((p) => p.moment === (event === "lapse" ? "lapse" : "rodeOut")) || null;

/** Writes one part of the note, leaving the others as they were. Blank clears it. */
export function withCalmNote(task, promptId, text) {
  if (!CALM_PROMPT_BY_ID[promptId]) return task.calmNote || {};
  const next = { ...(task.calmNote || {}) };
  const value = clean(text);
  if (value) next[promptId] = value;
  else delete next[promptId];
  return next;
}

// ---- Records ----
const rid = (prefix, at) => `${prefix}-${at}-${Math.random().toString(36).slice(2, 7)}`;

/** An urge, ridden out or not. The unit of work in quitting, and the one nothing recorded. */
export const newUrge = ({ taskId, at = Date.now(), seconds = 0, outcome }) => ({
  id: rid("u", at),
  taskId,
  kind: "urge",
  outcome: outcome === "gave-in" ? "gave-in" : "rode-out",
  seconds: Math.max(0, Math.round(seconds || 0)),
  at,
  date: dstr(new Date(at)),
});

/** A lapse, with what was going on — captured when it happened, not guessed at setup. */
export const newLapse = ({ taskId, at = Date.now(), trigger = "", feeling = null, place = "" }) => ({
  id: rid("l", at),
  taskId,
  kind: "lapse",
  trigger: clean(trigger) || null,
  feeling: FEELING_BY_ID[feeling] ? feeling : null,
  place: clean(place) || null,
  at,
  date: dstr(new Date(at)),
});

// ---- The day's state ----
// Three states rather than two. A slip is stored in the day log as not-done, so everything
// that already reads the day log — streaks, the heatmap, Insights — treats it as not clean
// without having to learn anything new.
export const isSlipped = (task, dateStr, dayLog) => !!dayLog?.[dateStr]?.[task.id]?.slipped;

export function dayState(task, dateStr, dayLog) {
  const entry = dayLog?.[dateStr]?.[task.id];
  if (entry?.slipped) return "slipped";
  if (entry?.done) return "clean";
  return "open";
}

/** Marks a day slipped. It replaces a clean tick: you can't be clean on a day you slipped. */
export function slip(dayLog, taskId, dateStr, at = Date.now()) {
  const day = { ...(dayLog?.[dateStr] || {}) };
  const before = day[taskId];
  // The earliest slip of the day is the one that decides it.
  if (before?.slipped) return dayLog;
  day[taskId] = { done: false, slipped: true, at };
  return { ...(dayLog || {}), [dateStr]: day };
}

/** Takes a slip back, e.g. from the undo right after logging one by mistake. */
export function unslip(dayLog, taskId, dateStr) {
  if (!dayLog?.[dateStr]?.[taskId]?.slipped) return dayLog;
  const { [taskId]: _gone, ...rest } = dayLog[dateStr];
  return { ...dayLog, [dateStr]: rest };
}

// ---- What the record says ----
/** Urges ridden out and given in to, over the last `days` days. */
export function urgeTally(urgeLog, taskId, { days = 7, today = todayStr() } = {}) {
  const from = addDays(today, -(days - 1));
  const mine = (urgeLog || []).filter((r) => r.taskId === taskId && r.date >= from && r.date <= today);
  return {
    rodeOut: mine.filter((r) => r.kind === "urge" && r.outcome === "rode-out").length,
    gaveIn: mine.filter((r) => r.kind === "urge" && r.outcome === "gave-in").length,
    lapses: mine.filter((r) => r.kind === "lapse").length,
  };
}

/**
 * The triggers this habit has actually had, most frequent first, with the one typed at setup
 * last-in-line rather than first. The setup guess is the least informed answer the app has;
 * a trigger that has turned up four times in real lapses is evidence.
 */
export function knownTriggers(urgeLog, task, limit = 5) {
  const counts = new Map();
  (urgeLog || [])
    .filter((r) => r.taskId === task.id && r.kind === "lapse" && r.trigger)
    .forEach((r) => {
      const key = r.trigger.toLowerCase();
      const seen = counts.get(key);
      counts.set(key, { text: seen?.text || r.trigger, n: (seen?.n || 0) + 1 });
    });
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n).map((c) => c.text);
  const setup = clean(task.trigger);
  if (setup && !ranked.some((t) => t.toLowerCase() === setup.toLowerCase())) ranked.push(setup);
  return ranked.slice(0, limit);
}
