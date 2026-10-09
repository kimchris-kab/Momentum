import { examenNudges } from "./examen.js";
import { letterNudges } from "./letters.js";
import { repairNudges } from "./temper.js";
import { virtueNudges } from "./virtue.js";
import { weekNudges } from "./weekly.js";

// What Character sends, as one list. The pieces each plan their own; this joins them and decides whether Character
// has been taken up at all, because nothing here should start notifying someone who has never opened it.

/** Has this person started using Character? Any part of it counts. */
export function engaged(state) {
  return !!(state.virtue?.id || (state.letters || []).length || (state.examenLog || []).length
    || (state.temperLog || []).length || (state.weekFocus && Object.keys(state.weekFocus).length));
}

/** Character off in Settings turns all of it off. */
export const characterOn = (settings) => settings?.virtue?.on !== false;

export function characterNudges(state, { days = 7, now = Date.now() } = {}) {
  if (!characterOn(state.settings) || !engaged(state)) return [];
  const parts = [
    virtueNudges(state, { days, now }),
    examenNudges(state, { days, now }),
    letterNudges(state, { days, now }),
    repairNudges(state, { days, now }),
    weekNudges(state, { days, now }),
  ];
  return parts.flat();
}

/** Adds Character's notifications to the ordinary ones, in time order. */
export function mergeCharacterNudges(state, items, days = 7, now = Date.now()) {
  return [...items, ...characterNudges(state, { days, now })].sort((a, b) => a.at - b.at);
}
