import { DEFAULT_CUE } from "./cues.js";

// Section 7 of the spec: a habit's type determines which levers actually work on it, and
// roughly how long it takes. Lally's 18–254 day range is the headline finding here — the app
// shows a RANGE, never a promise, because "21 days" is Maltz's anecdote and nothing more.
//
// Each type carries its evidence-backed defaults: the cue strategy that suits it, the levers
// worth offering, and an honest time window.
export const HABIT_TYPES = [
  {
    id: "simple",
    label: "Simple / motor",
    examples: "Vitamins, flossing, a two-minute tidy",
    cue: "routine",
    weeks: [3, 10],
    note: "Fast to automate. Stack it onto an existing routine, strip the friction, and expect it to need very little from you after a month or two.",
    levers: ["Routine-stack it", "Remove every step you can"],
  },
  {
    id: "physical",
    label: "Physical / effortful",
    examples: "Exercise, walking, an early alarm",
    cue: "location",
    weeks: [9, 36],
    note: "Months, not weeks — Buyalskaya's gym data put this around 68–77 days at the median, and the range is wide. A fixed place plus gear laid out beforehand beats willpower.",
    levers: ["Same place each time", "Lay the gear out first", "Bundle it with something you enjoy"],
  },
  {
    id: "cognitive",
    label: "Cognitive / complex",
    examples: "Deep work, studying, writing, code",
    cue: "time",
    weeks: [8, 36],
    note: "The one type where a time-block genuinely helps, because the constraint is uninterrupted space rather than a trigger. Guard the block and add friction to the phone.",
    levers: ["Block the time", "Put the phone out of reach", "Measure output cautiously"],
  },
  {
    id: "emotional",
    label: "Emotional / regulatory",
    examples: "Gratitude, journalling, meditation, mood logging",
    cue: "routine",
    weeks: [4, 14],
    note: "Anchor it to a fixed daily moment — bedtime, the first coffee. Keep it small and mark it when it's done; consistency matters far more than duration here.",
    levers: ["Anchor to a daily moment", "Keep it tiny", "Mark it out loud"],
  },
  {
    id: "social",
    label: "Social / relational",
    examples: "One-to-ones, calls home, giving feedback",
    cue: "time",
    weeks: [6, 26],
    note: "These decay quietly because nothing external forces them. A calendar trigger plus telling the other person it's a standing thing does most of the work.",
    levers: ["Put it in the calendar", "Tell the other person", "Make it recurring, not ad hoc"],
  },
  {
    id: "consumptive",
    label: "Something to quit",
    examples: "Doomscrolling, sugar, late-night phone",
    cue: "routine",
    weeks: [8, 36],
    breakOnly: true,
    note: "You don't erase an old habit — the striatal pattern stays, so trying not to do it rebounds (Wegner). Disrupt the cue, add friction, and fire a competing response off the same trigger.",
    levers: ["Disrupt the cue", "Add friction", "Name a competing response"],
  },
  {
    id: "keystone",
    label: "Keystone",
    examples: "Sleep, exercise, planning the week",
    cue: "routine",
    weeks: [8, 36],
    note: "Do this one first and alone. It makes the others easier, and loading up beside it is how all of them get dropped.",
    levers: ["Sequence it before anything else", "Anchor it hard", "Don't add others until it holds"],
  },
];
export const TYPE_BY_ID = Object.fromEntries(HABIT_TYPES.map((t) => [t.id, t]));

export const typeOf = (task) => (task?.habitType ? TYPE_BY_ID[task.habitType] || null : null);

export const typesFor = (kind) =>
  HABIT_TYPES.filter((t) => (kind === "break" ? t.breakOnly || t.id === "consumptive" : !t.breakOnly));

/** The cue this kind of habit usually wants, for a sensible default rather than a guess. */
export const defaultCueFor = (habitType) => TYPE_BY_ID[habitType]?.cue || DEFAULT_CUE;

/**
 * An honest expectation, in weeks, as a RANGE. Lally 2010 modelled a 66-day average across
 * an 18–254 day spread, and only 39 of 82 participants fitted the curve at all. Any single
 * "days to habit" number in a UI is a promise the evidence cannot keep.
 */
export function expectation(task, weeksIn = null) {
  const t = typeOf(task);
  if (!t) return null;
  const [lo, hi] = t.weeks;
  const text = `Habits like this usually take somewhere between ${lo} and ${hi} weeks — the spread is genuinely that wide, and it's individual.`;
  if (weeksIn === null) return { lo, hi, text, phase: null };
  const phase = weeksIn < lo ? "early" : weeksIn <= hi ? "inRange" : "long";
  return {
    lo,
    hi,
    text,
    phase,
    hint: phase === "early"
      ? `You're ${weeksIn} week${weeksIn === 1 ? "" : "s"} in. Still early for this kind of habit — nothing's wrong.`
      : phase === "inRange"
        ? `${weeksIn} weeks in, which is inside the usual window. Keep the cue steady.`
        : `${weeksIn} weeks and it still feels effortful. That usually means the cue, not the effort — worth re-anchoring it.`,
  };
}

// ---- Precommitment (spec item 18) ----
// Giné, Karlan & Zinman's CARES deposit contracts raised quit rates; stickK-style stakes and
// Ulysses contracts work through the same mechanism. Offered, never default, and never
// financial inside the app — Momentum has no payments and shouldn't pretend to.
export const COMMITMENT_HELP =
  "A stake you've told someone about is harder to walk away from than a private intention. "
  + "Write what you're committing to and who knows about it.";

export const hasCommitment = (task) => !!(task?.commitment || "").trim();
