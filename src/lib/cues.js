import { formatTime12, pad, todayStr } from "./date.js";

// Item 4 of the spec, rated STRONG, and the most uncomfortable finding in it for a habit
// app: Stawarz, Cox & Blandford (2015) reviewed 115 apps and ran a 4-week study —
// "relying on reminders supported repetition but hindered habit development, while the use
// of event-based cues led to increased automaticity". Buyalskaya (2023) found time-of-day
// did not predict gym-habit formation at all.
//
// So a clock is the weakest cue available, and it is the one almost every app defaults to.
// Here an existing routine is the default anchor and time is offered last, with the reason
// stated rather than hidden.
export const CUE_TYPES = [
  {
    id: "routine",
    label: "After a routine",
    tab: "Routine",
    short: "After",
    prompt: "After I…",
    placeholder: "brew my morning coffee",
    help: "Strongest anchor. An existing routine already happens reliably — borrow its reliability.",
  },
  {
    id: "location",
    label: "In a place",
    tab: "Place",
    short: "At",
    prompt: "When I'm…",
    placeholder: "at my desk",
    help: "Strong when the place is specific and you're there daily.",
  },
  {
    id: "time",
    label: "At a time",
    tab: "Time",
    short: "At",
    prompt: "At…",
    placeholder: "07:00",
    help: "Weakest anchor on the evidence — a clock can't tell you what you're doing. Good as a backstop, poor as the only cue.",
  },
];
export const CUE_BY_ID = Object.fromEntries(CUE_TYPES.map((c) => [c.id, c]));
export const DEFAULT_CUE = "routine";

/**
 * Reads the cue off a task. Habits created before this existed carried the same information
 * across three loose optional fields, so those are honoured rather than migrated away —
 * there is no way to know a stackAfter was meant as the primary anchor, only that it was set.
 */
export function cueOf(task) {
  if (!task) return null;
  if (task.cueType && (task.cueDetail || task.cueType === "time")) {
    return {
      type: task.cueType,
      detail: task.cueType === "time" ? (task.cueDetail || task.time || "") : task.cueDetail,
      legacy: false,
    };
  }
  if (task.stackAfter) return { type: "routine", detail: task.stackAfter, legacy: true };
  if (task.location) return { type: "location", detail: task.location, legacy: true };
  if (task.time) return { type: "time", detail: task.time, legacy: true };
  return null;
}

export const hasCue = (task) => !!cueOf(task);

const cuePhrase = (cue) => {
  if (!cue) return null;
  if (cue.type === "time") return `at ${formatTime12(cue.detail) || cue.detail}`;
  if (cue.type === "location") return `I'm ${cue.detail}`;
  return `I ${cue.detail}`;
};

/**
 * The implementation intention itself: "When [cue], I will [behaviour]."
 * Gollwitzer & Sheeran (2006): d ≈ .65 across 94 independent tests — one of the most
 * replicated effects in the field, and it works by pre-committing the if-then, so the
 * sentence is stored as its own thing rather than reassembled for display and forgotten.
 */
export function implementationIntention(task) {
  const cue = cueOf(task);
  const behaviour = (task?.text || "").trim();
  if (!cue || !cue.detail || !behaviour) return null;
  const when = cue.type === "time" ? cuePhrase(cue) : `when ${cuePhrase(cue)}`;
  return `${when.charAt(0).toUpperCase()}${when.slice(1)}, I will ${behaviour.toLowerCase()}.`;
}

// What the person actually wrote, if they wrote it; otherwise the composed sentence.
export const intentionText = (task) => (task?.intention || "").trim() || implementationIntention(task);

// ---- Context stability, derived rather than asked ----
// Every completion already records doneAt, so the spread of the times a habit actually
// happens is sitting in the log. A habit fired at wildly different moments is weakly cued
// whatever its completion rate says.
const MIN_SAMPLES = 5;

export function completionTimes(task, dayLog) {
  const out = [];
  Object.values(dayLog || {}).forEach((day) => {
    const entry = day?.[task.id];
    if (entry?.done && entry.doneAt) {
      const d = new Date(entry.doneAt);
      out.push(d.getHours() * 60 + d.getMinutes());
    }
  });
  return out;
}

/**
 * Circular statistics, because minutes-of-day wrap: 23:50 and 00:10 are twenty minutes
 * apart, not twenty-three hours. Treating them linearly would report a rock-steady bedtime
 * habit as the least stable thing in the app.
 * Returns R in 0..1 (1 = always at the same moment) plus the mean time.
 */
export function contextStability(task, dayLog) {
  const mins = completionTimes(task, dayLog);
  if (mins.length < MIN_SAMPLES) return { n: mins.length, score: null, meanTime: null, spreadMinutes: null };

  let sx = 0, sy = 0;
  mins.forEach((m) => {
    const a = (m / 1440) * 2 * Math.PI;
    sx += Math.cos(a);
    sy += Math.sin(a);
  });
  sx /= mins.length;
  sy /= mins.length;
  const R = Math.sqrt(sx * sx + sy * sy);

  let meanAngle = Math.atan2(sy, sx);
  if (meanAngle < 0) meanAngle += 2 * Math.PI;
  const meanMin = Math.round((meanAngle / (2 * Math.PI)) * 1440) % 1440;

  // Circular standard deviation, in minutes, for a number a person can actually read.
  const spread = R > 0 ? Math.round(Math.sqrt(-2 * Math.log(R)) * (1440 / (2 * Math.PI))) : null;

  return {
    n: mins.length,
    score: Math.round(R * 100) / 100,
    meanTime: `${pad(Math.floor(meanMin / 60))}:${pad(meanMin % 60)}`,
    spreadMinutes: spread,
  };
}

// Banded on the spread in minutes rather than on R, because R's relationship to clock time
// is not remotely intuitive and banding on it directly got this badly wrong: R ≥ 0.85 reads
// as "nearly perfect" and is in fact a six-hour spread, so a habit done anywhere between
// 4am and 10am was being reported as happening at the same moment each time — and the
// "running on memory" card, which keys off `scattered`, almost never fired.
export const STABILITY_BANDS = [
  { maxSpread: 30, id: "tight", label: "Same moment each time", tone: "good" },
  { maxSpread: 90, id: "loose", label: "Roughly the same window", tone: "good" },
  { maxSpread: Infinity, id: "scattered", label: "All over the day", tone: "warn" },
];

/** The band for a contextStability result, or null when there isn't enough to judge. */
export const stabilityBand = (stability) => {
  if (stability?.score === null || stability?.score === undefined) return null;
  // A null spread means R collapsed to zero — the times cancel out entirely, which is as
  // scattered as it gets rather than as unknown.
  const spread = stability.spreadMinutes === null ? Infinity : stability.spreadMinutes;
  return STABILITY_BANDS.find((b) => spread <= b.maxSpread);
};

// ---- Friction (spec item 7: "friction is the master lever") ----
// Wood's stairs-vs-elevator work: reduce steps for the behaviour you want, add steps to the
// one you don't. Free text on purpose — the useful version is specific to your kitchen.
export const FRICTION_PROMPTS = {
  build: { label: "Make it easier", placeholder: "Lay the kit out the night before" },
  break: { label: "Make it harder", placeholder: "Log out, leave the phone in another room" },
  todo: { label: "Make it easier", placeholder: "Open the file before you sit down" },
};
export const frictionPrompt = (kind) => FRICTION_PROMPTS[kind] || FRICTION_PROMPTS.todo;

// ---- Bad habits: substitution, not suppression (spec item 17) ----
// Wegner's ironic-process work is why "just don't" rebounds. Habit-reversal training
// replaces the behaviour with a competing response fired by the same trigger.
export const COMPETING_RESPONSE_HELP =
  "Trying not to do something rebounds. Name what you'll do instead when the trigger hits — same cue, different behaviour.";
