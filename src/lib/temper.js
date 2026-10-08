import { dstr } from "./date.js";

// A log for the moments temper gets the better of you, and the ones where it didn't. Five seconds to write down, and
// after a handful of entries it can say something true: when it happens, what sets it off, and whether pausing first
// helps. Plain data throughout; the screen only draws what is worked out here.

export const TRIGGERS = [
  { id: "tired", label: "Tired" },
  { id: "hungry", label: "Hungry" },
  { id: "rushed", label: "Rushed" },
  { id: "criticised", label: "Criticised" },
  { id: "dismissed", label: "Ignored or dismissed" },
  { id: "disrespect", label: "Felt disrespected" },
  { id: "screen", label: "Phone or scrolling" },
  { id: "stress", label: "Stress piling up" },
  { id: "other", label: "Something else" },
];

export const REACTIONS = [
  { id: "raised", label: "Raised my voice", calm: false },
  { id: "harsh", label: "Said something harsh", calm: false },
  { id: "cold", label: "Went cold or silent", calm: false },
  { id: "sulked", label: "Sulked or sniped", calm: false },
  { id: "held", label: "Felt it, stayed calm", calm: true },
  { id: "paused", label: "Paused, then answered well", calm: true },
];

const TRIGGER = Object.fromEntries(TRIGGERS.map((t) => [t.id, t]));
const REACTION = Object.fromEntries(REACTIONS.map((r) => [r.id, r]));
export const triggerLabel = (id) => TRIGGER[id]?.label || "Something else";
export const reactionLabel = (id) => REACTION[id]?.label || "";
export const isCalm = (entry) => !!REACTION[entry?.reaction]?.calm;

const DAY = 86400000;
const clip = (s, n) => String(s || "").trim().slice(0, n);

/** A record of one moment, or null if it doesn't say what happened. */
export function newTemperEntry({ trigger, reaction, who = "", note = "", paused = false, at = Date.now() }) {
  if (!REACTION[reaction]) return null;
  const when = new Date(at);
  return {
    id: `tl-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at, date: dstr(when), hour: when.getHours(), weekday: when.getDay(),
    trigger: TRIGGER[trigger] ? trigger : "other",
    reaction, who: clip(who, 40), note: clip(note, 200), paused: !!paused,
  };
}

export const newestFirst = (log) => [...(log || [])].sort((a, b) => b.at - a.at);

/** Whole days since the last time it got the better of you, or null if it never has in the log. */
export function daysSinceLastReaction(log, now = Date.now()) {
  const last = newestFirst(log).find((e) => !isCalm(e));
  return last ? Math.max(0, Math.floor((now - last.at) / DAY)) : null;
}

export const PARTS = [
  { id: "morning", label: "mornings", from: 5, to: 12 },
  { id: "afternoon", label: "afternoons", from: 12, to: 17 },
  { id: "evening", label: "evenings", from: 17, to: 22 },
  { id: "night", label: "late at night", from: 22, to: 29 },
];
const partOf = (hour) => PARTS.find((p) => (hour >= p.from && hour < p.to) || (hour + 24 >= p.from && hour + 24 < p.to));
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

const tally = (rows, keyOf) => {
  const m = new Map();
  rows.forEach((r) => { const k = keyOf(r); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

/** Enough to say something about; below this the screen says so instead of guessing. */
export const MIN_FOR_PATTERNS = 5;

/**
 * What the log says. The times, triggers and people only count the moments that went badly, since those are what
 * there is to avoid; the calm rate and the effect of pausing use all of them.
 */
export function patterns(log, now = Date.now()) {
  const all = log || [];
  const bad = all.filter((e) => !isCalm(e));
  const calm = all.length - bad.length;
  const enough = all.length >= MIN_FOR_PATTERNS;
  const top = (list, label) => (list.length && list[0][1] >= 2 ? { key: list[0][0], label: label(list[0][0]), count: list[0][1] } : null);

  const paused = all.filter((e) => e.paused);
  const unpaused = all.filter((e) => !e.paused);
  const rate = (rows) => (rows.length ? rows.filter(isCalm).length / rows.length : null);
  const pauseEffect = paused.length >= 3 && unpaused.length >= 3
    ? { with: rate(paused), without: rate(unpaused), uses: paused.length } : null;

  const weekAgo = now - 7 * DAY;
  const thisWeek = bad.filter((e) => e.at > weekAgo).length;
  const lastWeek = bad.filter((e) => e.at <= weekAgo && e.at > weekAgo - 7 * DAY).length;
  const trend = all.length >= MIN_FOR_PATTERNS && (thisWeek + lastWeek) > 0
    ? (thisWeek < lastWeek ? "better" : thisWeek > lastWeek ? "worse" : "same") : null;

  return {
    total: all.length, calm, bad: bad.length, enough,
    calmRate: all.length ? calm / all.length : null,
    trigger: enough ? top(tally(bad, (e) => e.trigger), triggerLabel) : null,
    part: enough ? top(tally(bad, (e) => partOf(e.hour)?.id), (id) => PARTS.find((p) => p.id === id).label) : null,
    weekday: enough ? top(tally(bad, (e) => e.weekday), (d) => WEEKDAYS[d]) : null,
    who: enough ? top(tally(bad, (e) => e.who.toLowerCase()), (w) => w) : null,
    pauseEffect, thisWeek, lastWeek, trend,
    daysClear: daysSinceLastReaction(all, now),
  };
}

/** The few sentences the log supports, most useful first. Never more confident than the data. */
export function insights(log, now = Date.now()) {
  const p = patterns(log, now);
  if (!p.total) return [];
  if (!p.enough) return [`${MIN_FOR_PATTERNS - p.total} more ${MIN_FOR_PATTERNS - p.total === 1 ? "entry" : "entries"} and patterns start to show.`];
  const out = [];
  if (p.trigger) out.push(`Most often when you're ${p.trigger.label.toLowerCase()} (${p.trigger.count} times).`);
  if (p.part) out.push(`It tends to happen ${p.part.key === "night" ? p.part.label : `in the ${p.part.label}`}.`);
  if (p.weekday) out.push(`${p.weekday.label} are the hardest (${p.weekday.count} times).`);
  if (p.who) out.push(`${p.who.label.replace(/^./, (c) => c.toUpperCase())} comes up most.`);
  if (p.pauseEffect) {
    const w = Math.round(p.pauseEffect.with * 100);
    const wo = Math.round(p.pauseEffect.without * 100);
    out.push(w > wo
      ? `When you pause first, you stay calm ${w}% of the time, against ${wo}% when you don't.`
      : `Pausing first hasn't made a difference yet (${w}% against ${wo}%). Keep logging.`);
  }
  if (p.trend === "better") out.push(`Better than last week: ${p.thisWeek} against ${p.lastWeek}.`);
  if (p.trend === "worse") out.push(`A rougher week than last: ${p.thisWeek} against ${p.lastWeek}.`);
  return out;
}
