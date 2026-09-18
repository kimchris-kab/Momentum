import { addDays, daysBetween, dstr, todayStr } from "./date.js";
import { isDone, occursOn } from "./tasks.js";
import { habitReliability } from "./habits.js";

// Completion and automaticity are different things, and the gap between them is the most
// useful thing this app can show you. You can hit 100% for eight weeks and still be
// white-knuckling it; the streak cannot tell the difference, so it gets measured directly.
//
// SRBAI — the 4-item Self-Report Behavioural Automaticity Index (Gardner, Abraham, Lally &
// de Bruijn, 2012), the automaticity subscale of the Self-Report Habit Index. Scored 1–7.
// It is a validated self-report proxy, not a devaluation test, so it is treated as a
// practical signal rather than proof of a true stimulus–response habit.
export const SRBAI_ITEMS = [
  "I do automatically",
  "I do without having to consciously remember",
  "I do without thinking",
  "I start doing before I realise I'm doing it",
];
export const SRBAI_MIN = 1;
export const SRBAI_MAX = 7;
export const SRBAI_STEM = "Behaviour X is something…";

// Asking more often than this turns a measure into a chore, and fortnightly is roughly the
// cadence at which a real change in automaticity becomes visible.
export const ASK_EVERY_DAYS = 14;
// Don't ask about a habit with no history — there is nothing yet to introspect on.
const MIN_AGE_DAYS = 10;
const MIN_COMPLETIONS = 5;

// "High" on a 1–7 scale. Deliberately not the ceiling: demanding 7/7 would mean almost
// nothing ever graduates, and the literature's own measure is noisy.
export const GRADUATION_MEAN = 5.5;
// Plateaued, not still climbing: a habit that is still rising is still forming.
const PLATEAU_DELTA = 0.5;

export const newSrbaiEntry = ({ taskId, scores, at = Date.now() }) => {
  const clean = (scores || []).slice(0, 4).map((n) => Math.min(SRBAI_MAX, Math.max(SRBAI_MIN, Number(n) || SRBAI_MIN)));
  return {
    id: `s-${at}-${Math.random().toString(36).slice(2, 6)}`,
    taskId,
    date: dstr(new Date(at)),
    scores: clean,
    mean: clean.length ? Math.round((clean.reduce((a, b) => a + b, 0) / clean.length) * 10) / 10 : null,
    at,
  };
};

export const srbaiHistory = (entries, taskId) =>
  (entries || []).filter((e) => e.taskId === taskId).sort((a, b) => a.date.localeCompare(b.date));

export const latestSrbai = (entries, taskId) => {
  const h = srbaiHistory(entries, taskId);
  return h.length ? h[h.length - 1] : null;
};

// Completions recorded for this habit, whatever day they landed on.
export function completionCount(task, dayLog) {
  let n = 0;
  Object.values(dayLog || {}).forEach((day) => { if (day?.[task.id]?.done) n++; });
  return n;
}

const ageInDays = (task, today) => {
  const start = task.startDate || dstr(new Date(task.createdAt || Date.now()));
  return Math.max(0, daysBetween(start, today));
};

// Is it worth asking about this habit today?
export function srbaiDue(task, entries, dayLog, today = todayStr()) {
  if (task.kind !== "build" || !task.recurrence || task.archivedAt) return false;
  if (ageInDays(task, today) < MIN_AGE_DAYS) return false;
  if (completionCount(task, dayLog) < MIN_COMPLETIONS) return false;
  const last = latestSrbai(entries, task.id);
  if (!last) return true;
  return daysBetween(last.date, today) >= ASK_EVERY_DAYS;
}

export const dueForSrbai = (tasks, entries, dayLog, today = todayStr()) =>
  tasks.filter((t) => srbaiDue(t, entries, dayLog, today));

export const STATUS = {
  new: { id: "new", label: "Not measured yet", hint: "Give it a couple of weeks, then rate how automatic it feels." },
  building: { id: "building", label: "Still effortful", hint: "This one still needs its cue and its prompts. Keep them." },
  strengthening: { id: "strengthening", label: "Getting automatic", hint: "Climbing. Leave the scaffolding in place a while longer." },
  graduated: { id: "graduated", label: "Graduated", hint: "High and steady. Prompts and rewards can come off — the cue is doing the work." },
};

/**
 * Where a habit sits on the automaticity ladder.
 * Graduation needs BOTH a high score and a flat one: a habit still climbing is still
 * forming, and pulling its scaffolding early is exactly how it comes apart.
 */
export function graduationStatus(task, entries) {
  const h = srbaiHistory(entries, task.id);
  if (!h.length) return { ...STATUS.new, mean: null, history: h, plateaued: false };
  const latest = h[h.length - 1];
  const mean = latest.mean;

  if (mean < GRADUATION_MEAN) {
    const rising = h.length >= 2 && mean - h[h.length - 2].mean >= PLATEAU_DELTA;
    return {
      ...(mean >= GRADUATION_MEAN - 1.5 || rising ? STATUS.strengthening : STATUS.building),
      mean, history: h, plateaued: false,
    };
  }

  // High. Plateaued if the last two readings are both high and not materially rising.
  const prev = h.length >= 2 ? h[h.length - 2] : null;
  const plateaued = !!prev && prev.mean >= GRADUATION_MEAN && Math.abs(mean - prev.mean) < PLATEAU_DELTA;
  if (!plateaued) return { ...STATUS.strengthening, mean, history: h, plateaued: false };
  return { ...STATUS.graduated, mean, history: h, plateaued: true };
}

export const isGraduated = (task, entries) => graduationStatus(task, entries).id === "graduated";

/**
 * Notification state. The evidence here is uncomfortable for habit apps: Stawarz et al.
 * (2015) found reminders support repetition but HINDER habit development, because the app
 * becomes the cue instead of the context. So a graduated habit's prompt is withdrawn by
 * default — the point is to hand the job back to the cue, not to keep pinging forever.
 * An explicit keepReminder overrides this, because someone may want the nudge anyway.
 */
export function reminderMode(task, entries) {
  if (task.reminder === false) return "off";
  if (task.keepReminder) return "on";
  return isGraduated(task, entries) ? "faded" : "on";
}

// Once a habit runs itself, the two-minute version has done its job and the behaviour can
// grow. Only offered — scaling up on the app's say-so is how a kept habit gets broken.
export function scaleUpSuggestion(task, entries) {
  if (!isGraduated(task, entries)) return null;
  const current = task.timerMinutes || null;
  if (!current) return { from: null, to: null, text: "Ready to ask more of this one?" };
  const to = current <= 5 ? current * 4 : Math.round(current * 1.5);
  return { from: current, to, text: `Scale it up: ${current} → ${to} min?` };
}

// The headline comparison: how reliably you do it, against how automatic it feels.
// These diverge often, and the divergence is the signal.
export function automaticityReport(tasks, entries, dayLog, days = 28) {
  return tasks
    .filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt)
    .map((t) => {
      const status = graduationStatus(t, entries);
      const reliability = habitReliability(t, dayLog, days);
      return {
        task: t,
        status,
        mean: status.mean,
        pct: reliability.pct,
        // Doing it every time while it still feels effortful is the interesting case:
        // the streak says "solved", the habit says "not yet".
        effortfulButKept: reliability.pct !== null && reliability.pct >= 80
          && status.mean !== null && status.mean < GRADUATION_MEAN,
      };
    })
    .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
}
