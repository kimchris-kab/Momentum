import { dstr } from "./date.js";
import { isFinished } from "./tasks.js";
import { dayState, lastSlipAt } from "./urges.js";
import { pinnedHabit } from "./shade.js";

// Notes to yourself. Once a habit being broken has gone three days clean, the app asks for one
// line a day about what you did well; those lines then come back at random moments, in your own
// words, as evidence from someone who was there. All of it is worked out here as plain data — the
// Android side only schedules the plan and shows it, and the widget only shows lines.
export const PEP_KEY = "momentum:pep";
// Where the notification's reply box leaves what was typed in it, for the app to pick up. The
// Java side writes this exact string; tests/android checks the two haven't drifted.
export const PENDING_PEP_KEY = "momentum:pendingPep";
export const PEP_MIN_DAYS = 3;
const DAY = 86400000;

export const DEFAULT_PEP = { on: true, write: true, remind: true, from: "09:00", to: "21:00" };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** The person's settings, with anything missing or silly put right. The window must be at least two hours wide. */
export function pepSettings(settings) {
  const s = settings?.pep || {};
  let from = HHMM.test(s.from) ? s.from : DEFAULT_PEP.from;
  let to = HHMM.test(s.to) ? s.to : DEFAULT_PEP.to;
  if (toMinutes(to) - toMinutes(from) < 120) { from = DEFAULT_PEP.from; to = DEFAULT_PEP.to; }
  return { on: s.on !== false, write: s.write !== false, remind: s.remind !== false, from, to };
}

// ---- The notes ----

export function newPepNote({ taskId, text, at = Date.now(), day = 0 }) {
  return {
    id: `pep-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    taskId, text: String(text).trim().slice(0, 280), at, date: dstr(new Date(at)), day,
  };
}

export const notesFor = (state, taskId) =>
  (state.pepNotes || []).filter((n) => !taskId || n.taskId === taskId).sort((a, b) => b.at - a.at);

// ---- Who is eligible to write ----

export const quits = (tasks) => (tasks || []).filter((t) => t.kind === "break" && !t.archivedAt && !isFinished(t));

/** Whole days clean in the current run: since the last slip, or since the habit began. */
export function cleanDays(task, urgeLog, now = Date.now()) {
  const last = lastSlipAt(task, urgeLog);
  return last ? Math.max(0, Math.floor((now - last) / DAY)) : 0;
}

/**
 * The habit to ask about today, and how many days clean it is — or null. One a day, across every habit
 * being broken: asked about the pinned one if it qualifies, otherwise the longest run. Not asked on a day
 * a slip was logged, or once a note has been written today.
 */
export function writeCandidate(state, now = Date.now()) {
  const today = dstr(new Date(now));
  if ((state.pepNotes || []).some((n) => n.date === today)) return null;
  const eligible = quits(state.tasks)
    .filter((t) => dayState(t, today, state.dayLog) !== "slipped")
    .map((task) => ({ task, day: cleanDays(task, state.urgeLog, now) }))
    .filter((c) => c.day >= PEP_MIN_DAYS);
  if (!eligible.length) return null;
  const pin = pinnedHabit(state.tasks);
  return eligible.find((c) => c.task.id === pin?.id) || eligible.reduce((a, c) => (c.day > a.day ? c : a));
}

// ---- Handing it to the phone ----

const prefs = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.Preferences : null);

/** Writes the plan for the Android side to schedule. A no-op on the web. */
export async function publishPep(state, now = Date.now()) {
  const p = prefs();
  if (!p?.set) return { published: false, reason: "not-native" };
  // The planner is only needed when there's something to write, so it isn't loaded with the app.
  let plan;
  try { plan = (await import("./pepPlan.js")).pepPlan(state, now); } catch (e) { return { published: false, reason: String(e) }; }
  try {
    await p.set({ key: PEP_KEY, value: JSON.stringify({ items: plan, updatedAt: now }) });
    await window.Capacitor?.Plugins?.MomentumPep?.refresh?.().catch?.(() => {});
    return { published: true, plan };
  } catch (e) {
    return { published: false, reason: String(e) };
  }
}

/** Notes typed into a notification's reply box while the app was closed. Read once, then cleared. */
export async function takePendingPepNotes() {
  const p = prefs();
  if (!p?.get) return [];
  try {
    const { value } = await p.get({ key: PENDING_PEP_KEY });
    if (!value) return [];
    await p.remove({ key: PENDING_PEP_KEY });
    const rows = JSON.parse(value);
    return Array.isArray(rows) ? rows.filter((r) => r && r.taskId && typeof r.text === "string" && r.text.trim()) : [];
  } catch {
    return [];
  }
}

