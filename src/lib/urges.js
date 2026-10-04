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

// ---- Cutting down, not only stopping (2) ----
// Most quitting is reduction before it is abstinence: twenty, then twelve, then five, then
// none. A habit with a limit is judged against it, so a day at three of five is a kept day
// rather than a failed one. No limit — the default — means none at all.
export const limitOf = (task) => Math.max(0, Math.floor(Number(task?.limit) || 0));

/** How many times it happened on a day, counted from the log rather than stored as a number. */
export const lapsesOn = (urgeLog, taskId, dateStr) =>
  (urgeLog || [])
    .filter((r) => r.kind === "lapse" && r.taskId === taskId && r.date === dateStr)
    .sort((a, b) => a.at - b.at);

/**
 * Brings one day's slipped mark into line with the log. The count is derived from the log —
 * which merges by union across devices — rather than kept as a number, because two phones
 * each holding "3" would otherwise merge into three rather than six. The mark follows from
 * the count: set once it goes over the limit, cleared if it no longer does (a lapse undone,
 * or a limit raised).
 */
export function syncSlip(dayLog, task, dateStr, urgeLog) {
  const lapses = lapsesOn(urgeLog, task.id, dateStr);
  const limit = limitOf(task);
  const entry = dayLog?.[dateStr]?.[task.id];
  if (lapses.length > limit) {
    // The lapse that crossed the line is when the day was lost, not the first of the day.
    const at = lapses[limit].at;
    if (entry?.slipped && entry.at === at) return dayLog;
    return { ...(dayLog || {}), [dateStr]: { ...(dayLog?.[dateStr] || {}), [task.id]: { done: false, slipped: true, at } } };
  }
  if (entry?.slipped) return unslip(dayLog, task.id, dateStr);
  return dayLog;
}

/** Every day the log has an opinion about, brought into line. Run after a merge. */
export function reconcileSlips(tasks, urgeLog, dayLog) {
  let out = dayLog || {};
  (tasks || []).filter((t) => t.kind === "break").forEach((task) => {
    const dates = new Set([
      ...(urgeLog || []).filter((r) => r.taskId === task.id && r.kind === "lapse").map((r) => r.date),
      ...Object.keys(out).filter((d) => out[d]?.[task.id]?.slipped),
    ]);
    dates.forEach((d) => { out = syncSlip(out, task, d, urgeLog); });
  });
  return out;
}

// ---- A rate, not just a run (5) ----
// A streak that goes to zero on one slip is the abstinence violation effect with a number on
// it. The run is still worth showing, but next to the best one, and next to a rate that a
// single slip barely moves. Untouched days are left out of the rate entirely: the app doesn't
// know what happened on them, and counting them either way would be making it up.
export function cleanRecord(task, dayLog, { today = todayStr(), days = 30 } = {}) {
  const state = (d) => {
    const e = dayLog?.[d]?.[task.id];
    return e?.slipped ? "slipped" : e?.done ? "clean" : "open";
  };

  let clean = 0, slipped = 0;
  for (let i = 0; i < days; i++) {
    const s = state(addDays(today, -i));
    if (s === "clean") clean++;
    else if (s === "slipped") slipped++;
  }

  // Current run: today counts if it's clean, and doesn't break the run if it isn't decided.
  let current = 0;
  let cursor = state(today) === "open" ? addDays(today, -1) : today;
  while (state(cursor) === "clean") { current++; cursor = addDays(cursor, -1); }

  // Best run over everything recorded.
  const recorded = Object.keys(dayLog || {}).filter((d) => dayLog[d]?.[task.id]).sort();
  let best = 0, run = 0, prev = null;
  recorded.forEach((d) => {
    if (state(d) === "clean") {
      run = prev && addDays(prev, 1) === d && state(prev) === "clean" ? run + 1 : 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
    prev = d;
  });

  return { current, best: Math.max(best, current), clean, slipped, recorded: clean + slipped, days };
}

// ---- Time since, and what it has bought (6) ----
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * The lapses that are slips: every one, for a habit being stopped; only the ones past the
 * day's limit, for a habit being cut down. Three on a limit of five aren't slips — they're the
 * plan — and treating them as slips is how Insights once reported a single afternoon's +1s as
 * "Mondays are where it breaks".
 */
export function slipsOf(task, urgeLog) {
  const limit = limitOf(task);
  const byDate = {};
  (urgeLog || [])
    .filter((r) => r.kind === "lapse" && r.taskId === task.id)
    .forEach((r) => { (byDate[r.date] = byDate[r.date] || []).push(r); });
  return Object.values(byDate).flatMap((list) => list.sort((a, b) => a.at - b.at).slice(limit));
}

/** One slip per day — the one that lost it. For patterns in days and times, a day is the unit. */
export function daysLost(task, urgeLog) {
  const first = {};
  slipsOf(task, urgeLog).forEach((r) => { if (!first[r.date] || r.at < first[r.date].at) first[r.date] = r; });
  return Object.values(first).sort((a, b) => a.at - b.at);
}

/**
 * Every moment this habit pulled at you that got written down: an urge ridden out, an urge
 * given in to, and a lapse. A slip is the narrowest of these and the least useful for knowing
 * when the pull comes — the urges that were ridden out never show up as slips at all.
 */
export const urgeEvents = (task, urgeLog) =>
  (urgeLog || [])
    .filter((r) => r.taskId === task.id && (r.kind === "urge" || r.kind === "lapse"))
    .sort((a, b) => a.at - b.at);

/** When it last pulled at you, however it ended. Null if it never has. */
export function lastUrgeAt(task, urgeLog) {
  const events = urgeEvents(task, urgeLog);
  return events.length ? events[events.length - 1].at : null;
}

/** When the last slip was, or when the habit started if there hasn't been one. */
export function lastSlipAt(task, urgeLog) {
  const last = slipsOf(task, urgeLog).reduce((a, r) => Math.max(a, r.at), 0);
  if (last) return last;
  const start = task.startDate ? new Date(`${task.startDate}T00:00:00`).getTime() : task.createdAt;
  return start || null;
}

/** "4d 6h", "3h 20m", "12m" — the most motivating number in quitting, kept honest to the minute. */
export function fmtSince(ms) {
  if (ms == null || ms < 0) return null;
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / HOUR);
  const m = Math.floor((ms % HOUR) / 60000);
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

/**
 * Money and time not spent, from the person's own numbers: what they did before starting,
 * against what the log says they've done since. Null unless there's a baseline to compare
 * with — without one this would be a figure made up to look encouraging.
 */
export function reclaimed(task, urgeLog, now = Date.now()) {
  const baseline = Number(task.baseline) || 0;
  if (baseline <= 0) return null;
  const startMs = task.startDate ? new Date(`${task.startDate}T00:00:00`).getTime() : task.createdAt;
  if (!startMs || now <= startMs) return null;
  const days = (now - startMs) / DAY;
  const actual = (urgeLog || []).filter((r) => r.kind === "lapse" && r.taskId === task.id && r.at >= startMs).length;
  const avoided = Math.max(0, Math.round(baseline * days - actual));
  const cost = Number(task.costPer) || 0;
  const mins = Number(task.minutesPer) || 0;
  return {
    avoided,
    days: Math.floor(days),
    money: cost > 0 ? Math.round(avoided * cost) : null,
    minutes: mins > 0 ? Math.round(avoided * mins) : null,
  };
}
