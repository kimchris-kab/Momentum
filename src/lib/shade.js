import { isFinished } from "./tasks.js";
import { lastSlipAt, lastUrgeAt, slipsOf, startedAt } from "./urges.js";

// The notification that sits in the shade with one habit's clean-time on it. Like the widget, the
// Android side reads a small snapshot rather than the app's state, written through Capacitor
// Preferences, and works out the elapsed time itself each time it draws: a timestamp does not go
// stale the way "4d 6h" does.
export const SHADE_KEY = "momentum:shade";

export const SHADE_MODES = [
  { id: "pinned", label: "The one I pinned", desc: "Only shows once you've pinned a habit" },
  { id: "risk", label: "Whichever is riskiest right now", desc: "Follows the urge radar through the day" },
  { id: "longest", label: "The one with the longest run", desc: "The streak you would hate to lose" },
];
const MODE_IDS = SHADE_MODES.map((m) => m.id);

// On by default, but it shows nothing until a habit is pinned, so a new install has an empty shade
// rather than one that asked for nothing. The lock screen is seen by other people, so the habit's
// name stays off it unless the person says otherwise.
export const DEFAULT_SHADE = { on: true, mode: "pinned", hideOnLock: true };

export function shadeSettings(settings) {
  const s = settings?.shade || {};
  return {
    on: s.on !== false,
    mode: MODE_IDS.includes(s.mode) ? s.mode : DEFAULT_SHADE.mode,
    hideOnLock: s.hideOnLock !== false,
  };
}

const candidates = (tasks) => (tasks || []).filter((t) => t.kind === "break" && !t.archivedAt && !isFinished(t));

/**
 * The habit that was pinned most recently. A pin is a timestamp rather than a flag so that pinning
 * one habit un-pins the rest without touching them: two phones can each pin something while apart,
 * and the later one simply wins when they meet, with nobody left holding two.
 */
export function pinnedHabit(tasks) {
  let best = null;
  candidates(tasks).forEach((t) => {
    if (Number(t.shadePin) > 0 && (!best || t.shadePin > best.shadePin)) best = t;
  });
  return best;
}

const RISK_RANK = { high: 2, rising: 1 };

/**
 * Which habit gets the shade, or null. `riskLevel(task)` is supplied by the caller because the radar
 * is only loaded when something needs it; without it, "riskiest" falls back to the pinned habit.
 */
export function shadeHabit(state, now = Date.now(), { riskLevel } = {}) {
  const { on, mode } = shadeSettings(state.settings);
  if (!on) return null;
  const pool = candidates(state.tasks);
  if (!pool.length) return null;
  const sinceOf = (t) => now - (lastSlipAt(t, state.urgeLog) || now);
  const longest = () => pool.reduce((a, t) => (sinceOf(t) > sinceOf(a) ? t : a));

  if (mode === "longest") return longest();
  if (mode === "risk" && riskLevel) {
    let pick = null, rank = 0;
    pool.forEach((t) => {
      const r = RISK_RANK[riskLevel(t)] || 0;
      if (r > rank) { pick = t; rank = r; }
    });
    // Nothing is in a hard stretch: the pinned habit if there is one, else the longest run.
    return pick || pinnedHabit(state.tasks) || longest();
  }
  return pinnedHabit(state.tasks);
}

/**
 * The longest stretch already completed without a slip — not counting the one in progress, which the
 * notification already shows as its headline. Zero until there has been a slip to end one.
 */
export function bestPastRunMs(task, urgeLog) {
  const slips = slipsOf(task, urgeLog).map((r) => r.at).sort((a, b) => a - b);
  let from = startedAt(task);
  let best = 0;
  slips.forEach((at) => {
    if (from && at > from) best = Math.max(best, at - from);
    from = at;
  });
  return best;
}

export function shadeSnapshot(state, now = Date.now(), { usualWindow, riskLevel } = {}) {
  const { hideOnLock } = shadeSettings(state.settings);
  const task = shadeHabit(state, now, { riskLevel });
  if (!task) return { show: false, updatedAt: now };
  return {
    show: true,
    id: task.id,
    name: task.text.length > 40 ? `${task.text.slice(0, 39)}…` : task.text,
    hideOnLock,
    lastSlipAt: lastSlipAt(task, state.urgeLog) || null,
    everSlipped: slipsOf(task, state.urgeLog).length > 0,
    lastUrgeAt: lastUrgeAt(task, state.urgeLog) || null,
    bestPastMs: bestPastRunMs(task, state.urgeLog),
    risk: usualWindow ? usualWindow(task, state, now) : null,
    updatedAt: now,
  };
}

const prefs = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.Preferences : null);

/** Writes the snapshot and asks the native side to redraw. A no-op on the web. */
export async function publishShade(state, now = Date.now()) {
  const p = prefs();
  if (!p?.set) return { published: false, reason: "not-native" };
  let usualWindow, riskLevel;
  try {
    const radar = await import("./radar.js");
    usualWindow = radar.usualWindow;
    riskLevel = (t) => radar.radar(t, state, now).level;
  } catch { /* the shade goes without a risk line, and "riskiest" falls back */ }
  const snapshot = shadeSnapshot(state, now, { usualWindow, riskLevel });
  try {
    await p.set({ key: SHADE_KEY, value: JSON.stringify(snapshot) });
    await window.Capacitor?.Plugins?.MomentumShade?.refresh?.().catch?.(() => {});
    return { published: true, snapshot };
  } catch (e) {
    return { published: false, reason: String(e) };
  }
}

/** The reducer behind the pin switch: pinning stamps this habit, unpinning removes the stamp. */
export function setShadePin(tasks, id, on, now = Date.now()) {
  return tasks.map((t) => {
    if (t.id !== id) return t;
    if (on) return { ...t, shadePin: now };
    const { shadePin, ...rest } = t; // eslint-disable-line no-unused-vars
    return rest;
  });
}
