import { addDays, dstr, formatTime12, parseD } from "./date.js";
import { WK_ORDER } from "../data/constants.js";
import { isFinished } from "./tasks.js";
import { calmNoteParts, lastSlipAt, slipsOf } from "./urges.js";
import { ACTIONS } from "./nudges.js";
import { pinnedHabit } from "./shade.js";

// The red zone: when someone sets out to quit something they usually know the hours it gets
// them — late at night, after work, Saturday afternoons. They say so when they add the habit, and
// the app is there for those hours, from the first day, with no log to learn from.
//
// A zone is days of the week plus a start and an end time. It belongs to the day it STARTS on, so
// "Friday 22:00 to 02:00" is a Friday zone that runs into Saturday. An end at or before the start
// means the next day, which is how "22:00 to 00:00" works.
//
// This is loaded when notifications are being planned or a zone is being shown, not at start-up.

const ALL = WK_ORDER.slice(1).concat("sun"); // mon … sun, the order people read a week in
export const MIN_ZONE_MINUTES = 20;
export const MAX_ZONE_MINUTES = 12 * 60;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = 86400000;
const MINUTE = 60000;
// Long enough that a zone ending at midnight can still be answered over breakfast.
const ASK_WINDOW = 14 * 3600000;

export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

/** Ready-made zones for the commonest hard hours, so most people never touch a time picker. */
export const ZONE_PRESETS = [
  { id: "late", label: "Late night", sub: "10 pm to midnight, every night", days: ALL, from: "22:00", to: "00:00" },
  { id: "after-work", label: "After work", sub: "5 to 8 pm, weekdays", days: ["mon", "tue", "wed", "thu", "fri"], from: "17:00", to: "20:00" },
  { id: "weekend", label: "Weekend afternoons", sub: "2 to 6 pm, Saturday and Sunday", days: ["sat", "sun"], from: "14:00", to: "18:00" },
  { id: "morning", label: "Early morning", sub: "7 to 9 am, every day", days: ALL, from: "07:00", to: "09:00" },
];

export const INTENSITIES = [
  { id: "light", label: "Light", desc: "When it starts, and a check on how it went." },
  { id: "steady", label: "Steady", desc: "A heads-up first, the start, the halfway point, then how it went." },
  { id: "close", label: "Close", desc: "Everything in Steady, plus a nudge every half hour inside the zone." },
];
export const DEFAULT_REDZONE = { on: true, intensity: "steady", lead: 30 };

export function redZoneSettings(settings) {
  const s = settings?.redZone || {};
  return {
    on: s.on !== false,
    intensity: INTENSITIES.some((i) => i.id === s.intensity) ? s.intensity : DEFAULT_REDZONE.intensity,
    lead: [15, 30, 45, 60].includes(s.lead) ? s.lead : DEFAULT_REDZONE.lead,
  };
}

// ---- Zones ----

export const newZone = ({ days, from, to, id }) => ({
  id: id || `z${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
  days: ALL.filter((d) => days.includes(d)), from, to,
});

export const zoneFromPreset = (presetId) => {
  const p = ZONE_PRESETS.find((x) => x.id === presetId);
  return p ? newZone({ days: p.days, from: p.from, to: p.to }) : null;
};

/** How long a zone lasts, in minutes. An end at or before the start runs into the next day. */
export function zoneMinutes(z) {
  const a = toMinutes(z.from), b = toMinutes(z.to);
  return b > a ? b - a : b + 1440 - a;
}

/** Why a zone can't be used, or null. Said in words, since it is shown next to the thing being typed. */
export function zoneProblem(z) {
  if (!z || !Array.isArray(z.days) || !z.days.some((d) => ALL.includes(d))) return "Pick at least one day.";
  if (!HHMM.test(z.from || "") || !HHMM.test(z.to || "")) return "Set when it starts and when it ends.";
  const m = zoneMinutes(z);
  if (z.from === z.to) return "It has to end after it starts.";
  if (m < MIN_ZONE_MINUTES) return `Make it at least ${MIN_ZONE_MINUTES} minutes.`;
  if (m > MAX_ZONE_MINUTES) return "Twelve hours is the longest a red zone can be.";
  return null;
}

/** A habit's usable zones. Anything malformed is left out rather than breaking the rest. */
export const zonesOf = (task) => (Array.isArray(task?.redZones) ? task.redZones : []).filter((z) => !zoneProblem(z));

export function describeDays(days) {
  const set = new Set(days);
  if (ALL.every((d) => set.has(d))) return "Every day";
  if (set.size === 5 && ["mon", "tue", "wed", "thu", "fri"].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has("sat") && set.has("sun")) return "Weekends";
  return ALL.filter((d) => set.has(d)).map((d) => d[0].toUpperCase() + d.slice(1, 3)).join(", ");
}

/** "Every night · 10:00 PM – 12:00 AM", for a list or a card. */
export const describeZone = (z) =>
  `${z.from === "22:00" && z.days.length === 7 ? "Every night" : describeDays(z.days)} · ${formatTime12(z.from)} – ${formatTime12(z.to)}`;

const at = (date, hhmm) => { const [y, m, d] = date.split("-").map(Number); const [h, mi] = hhmm.split(":").map(Number); return new Date(y, m - 1, d, h, mi, 0, 0).getTime(); };

/**
 * Every occurrence of a habit's zones whose span touches [fromMs, toMs]: { zoneId, date, start, end }.
 * Looks a day back, so a zone that began yesterday and is still running is found.
 */
export function occurrences(task, fromMs, toMs) {
  const out = [];
  const zones = zonesOf(task);
  if (!zones.length) return out;
  let date = dstr(new Date(fromMs - DAY));
  const last = dstr(new Date(toMs));
  for (let guard = 0; guard < 400 && date <= last; guard++) {
    const key = WK_ORDER[parseD(date).getDay()];
    zones.forEach((z) => {
      if (!z.days.includes(key)) return;
      const start = at(date, z.from);
      const end = toMinutes(z.to) > toMinutes(z.from) ? at(date, z.to) : at(addDays(date, 1), z.to);
      if (end >= fromMs && start <= toMs) out.push({ zoneId: z.id, date, start, end });
    });
    date = addDays(date, 1);
  }
  return out.sort((a, b) => a.start - b.start);
}

export const zoneKey = (taskId, occ) => `${taskId}:${occ.zoneId}:${occ.date}`;

const quits = (tasks) => (tasks || []).filter((t) => t.kind === "break" && !t.archivedAt && !isFinished(t));

/** The occurrence of this habit's zones that `now` falls inside, or null. */
export const inZone = (task, now) => occurrences(task, now, now).find((o) => now >= o.start && now < o.end) || null;

/** The first habit in a red zone right now, pinned one first: { task, occ }. */
export function activeZone(state, now = Date.now()) {
  const pin = pinnedHabit(state.tasks);
  const hits = quits(state.tasks).filter((t) => t.redZoneNudges !== false)
    .map((task) => ({ task, occ: inZone(task, now) })).filter((h) => h.occ);
  return hits.find((h) => h.task.id === pin?.id) || hits[0] || null;
}

// ---- Holding it ----

/** A person saying they got through a zone. The id is fixed, so saying it twice is the same record. */
export const newZoneHold = ({ taskId, zoneId, date, at: when = Date.now() }) =>
  ({ id: `zh:${taskId}:${zoneId}:${date}`, taskId, zoneId, date, kind: "held", at: when });

const slippedIn = (task, urgeLog, occ) => slipsOf(task, urgeLog).some((r) => r.at >= occ.start && r.at <= occ.end + 5 * MINUTE);
const heldIn = (state, task, occ) => (state.zoneLog || []).some((h) => h.id === `zh:${task.id}:${occ.zoneId}:${occ.date}`);

/** "held", "slipped" or "open" for a finished (or running) occurrence. A slip outranks a claim of holding. */
export function outcomeOf(state, task, occ) {
  if (slippedIn(task, state.urgeLog, occ)) return "slipped";
  return heldIn(state, task, occ) ? "held" : "open";
}

/**
 * How the habit's red zones have gone, over the last 60 days. `streak` is held zones in a row, newest
 * back, stopping at a slip; a zone nobody answered for is neither, and is stepped over rather than
 * counted against someone for not tapping a button.
 */
export function zoneStats(state, task, now = Date.now()) {
  const past = occurrences(task, now - 60 * DAY, now).filter((o) => o.end <= now);
  let cleared = 0, slipped = 0;
  past.forEach((o) => { const r = outcomeOf(state, task, o); if (r === "held") cleared++; if (r === "slipped") slipped++; });
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    const r = outcomeOf(state, task, past[i]);
    if (r === "slipped") break;
    if (r === "held") streak++;
  }
  return { cleared, slipped, streak, total: past.length };
}

/**
 * A zone that ended in the last fourteen hours and hasn't been answered: the question "did you hold?" still
 * has an answer, and the notification asking it may have been missed. { task, occ } or null.
 */
export function askHeld(state, now = Date.now()) {
  for (const task of quits(state.tasks)) {
    if (task.redZoneNudges === false) continue;
    const occ = occurrences(task, now - ASK_WINDOW, now).filter((o) => o.end <= now && o.end > now - ASK_WINDOW)
      .sort((a, b) => b.end - a.end)[0];
    if (occ && outcomeOf(state, task, occ) === "open") return { task, occ };
  }
  return null;
}

// ---- What the nudges say ----
// Chosen to do the job a particular moment has, in this order: plan before it, steady during it,
// own the result after it. Nothing here scolds. A slip is information, and the shape of this
// follows what is known to help someone through an urge: decide what to do in advance, make the
// habit harder to reach, remember an urge rises and falls, and be reminded of what you have
// already done — in your own words where there are any.

function seeded(seed) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  let a = Math.imul(h ^ (h >>> 16), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909);
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const quote = (s, n = 110) => `“${s.length > n ? `${s.slice(0, n - 1)}…` : s}”`;
const clock = (ms) => formatTime12(`${String(new Date(ms).getHours()).padStart(2, "0")}:${String(new Date(ms).getMinutes()).padStart(2, "0")}`);
const span = (min) => (min >= 90 && min % 60 === 0 ? `${min / 60} hours` : min >= 90 ? `${(min / 60).toFixed(1).replace(/\.0$/, "")} hours` : `${min} minutes`);

const PLAN_LINES = [
  (c) => `Make it harder now: put it out of reach, log out, or hand it to someone. Easy now, hard at ${c.startLabel}.`,
  () => "Decide what you'll do when it hits, before it hits. Then the decision is already made.",
  (c) => `Change the room, not the urge: be somewhere the habit isn't for the next ${c.length}.`,
  (c) => `Give your hands something to do for the next ${c.length}: a drink, a book, a stretch.`,
  () => "Tell one person you're about to be in a hard stretch. Saying it out loud takes some of the pull out of it.",
];
const START_LINES = [
  "An urge rises, peaks and falls, usually within 15 minutes. You don't have to do anything with it.",
  "You knew this hour was coming, and you're ready for it. Ride the first wave and the rest is easier.",
  "It doesn't need to be argued with. Notice it, breathe out slowly, let it pass.",
];
const MID_LINES = [
  "Halfway. The worst of it is usually behind you.",
  "You've held this long. Hold it a little longer.",
  "If it's rough right now, that's the zone working on you, not a sign you can't. Tap Ride it out.",
];
const CHECK_LINES = [
  "A glass of water, then ten more minutes.",
  "Stand up, change rooms, breathe out slowly for a minute.",
  "Still here? That counts. Keep your hands busy.",
  "Text someone, step outside, or put on something that needs both hands.",
];

/** What a person has done that is worth reminding them of: clean days, and urges ridden out this week. */
function proof(state, task, now) {
  const last = lastSlipAt(task, state.urgeLog);
  const days = last ? Math.max(0, Math.floor((now - last) / DAY)) : 0;
  const rode = (state.urgeLog || []).filter((r) => r.taskId === task.id && r.kind === "urge" && r.outcome === "rode-out" && r.at >= now - 7 * DAY).length;
  return { days, rode };
}

/** One of the person's own notes to themselves for this habit, chosen by chance but the same each time it's asked. */
function ownNote(state, task, rand) {
  const notes = (state.pepNotes || []).filter((n) => n.taskId === task.id);
  return notes.length ? notes[Math.floor(rand() * notes.length)] : null;
}

function copy(kind, ctx) {
  const { task, state, now, occ, rand } = ctx;
  const why = calmNoteParts(task).find((p) => p.id === "why");
  const instead = (task.competingResponse || "").trim();
  const trigger = (task.trigger || "").trim();
  const base = { startLabel: clock(occ.start), endLabel: clock(occ.end), length: span(Math.round((occ.end - occ.start) / MINUTE)) };
  const name = task.text;

  if (kind === "plan") {
    const bits = [pick(rand, PLAN_LINES)(base)];
    if (instead) bits.push(`Your plan: ${instead}.`);
    else if (trigger) bits.push(`The usual trigger: ${trigger}.`);
    return { title: `Red zone at ${base.startLabel} · ${name}`, body: bits.join(" ") };
  }
  if (kind === "start") {
    const bits = why ? [`You wrote ${quote(why.text)}`] : [pick(rand, START_LINES)];
    if (instead && why) bits.push(`Instead: ${instead}.`);
    return { title: `You're in the red zone · until ${base.endLabel}`, body: bits.join(" ") };
  }
  if (kind === "mid") {
    const note = ownNote(state, task, rand);
    if (note) return { title: `Halfway through · ${name}`, body: `${note.day ? `You, on day ${note.day}` : "A note from you"}: ${quote(note.text)}` };
    const p = proof(state, task, now);
    if (p.days >= 1) return { title: `Halfway through · ${name}`, body: `${p.days} ${p.days === 1 ? "day" : "days"} clean${p.rode ? ` and ${p.rode} ${p.rode === 1 ? "urge" : "urges"} ridden out this week` : ""}. ${pick(rand, MID_LINES)}` };
    return { title: `Halfway through · ${name}`, body: pick(rand, MID_LINES) };
  }
  if (kind === "check") return { title: `Still with it? · ${name}`, body: pick(rand, CHECK_LINES) };
  return {
    title: `Red zone over · did you hold?`,
    body: "Tap I held it and it counts. If it went the other way, log it: a slip is information, not a verdict.",
  };
}

/**
 * What to send for every red zone in the next `days`, as notification items: { id, at (Date), kind, taskId,
 * date, zone, title, body, actions }. Heads-up, start, halfway (or every half hour on Close), and the
 * question at the end. A zone that has had a slip in it sends nothing more, and one already answered
 * doesn't ask again. Not held back by quiet hours: the person chose these hours, usually because
 * they are the hours quiet hours cover.
 */
export function zoneNudges(state, now = Date.now(), { days = 7 } = {}) {
  const cfg = redZoneSettings(state.settings);
  if (!cfg.on) return [];
  const out = [];
  quits(state.tasks).filter((t) => t.redZoneNudges !== false).forEach((task) => {
    occurrences(task, now, now + days * DAY).forEach((occ) => {
      const key = zoneKey(task.id, occ);
      const length = Math.round((occ.end - occ.start) / MINUTE);
      const outcome = outcomeOf(state, task, occ);
      const slippedAt = slipsOf(task, state.urgeLog).filter((r) => r.at >= occ.start && r.at <= occ.end).reduce((a, r) => Math.max(a, r.at), 0);
      const push = (kind, whenMs, nid, actions, tag) => {
        if (whenMs <= now || whenMs > occ.end) return;
        if (slippedAt && whenMs > slippedAt) return;     // it already went the other way: nothing more to say about it
        // Each message rolls its own wording from its own seed, so switching intensity or a neighbouring
        // message being skipped never changes what another one says.
        const c = copy(kind, { task, state, now: whenMs, occ, rand: seeded(`rz:${key}:${nid}`) });
        out.push({
          id: `rz:${key}:${nid}`, at: new Date(whenMs), kind: tag || "redzone", taskId: task.id, date: occ.date,
          zone: `${occ.zoneId}@${occ.date}`, title: c.title, body: c.body, actions,
        });
      };
      if (cfg.intensity !== "light") push("plan", occ.start - cfg.lead * MINUTE, "plan", [ACTIONS.urge, ACTIONS.open]);
      push("start", occ.start, "start", [ACTIONS.urge, ACTIONS.open]);
      if (cfg.intensity === "steady" && length >= 90) push("mid", occ.start + Math.floor(length / 2) * MINUTE, "mid", [ACTIONS.urge, ACTIONS.open]);
      if (cfg.intensity === "close") {
        for (let m = 30, n = 0; m <= length - 20 && n < 5; m += 30, n++) {
          const half = Math.abs(m - length / 2) < 15;
          push(half ? "mid" : "check", occ.start + m * MINUTE, `c${m}`, [ACTIONS.urge, ACTIONS.open]);
        }
      }
      if (outcome === "open") push("end", occ.end, "end", [ACTIONS.held, ACTIONS.slipped], "redzone-end");
    });
  });
  return out.sort((a, b) => a.at - b.at);
}

/** Adds the zone nudges to the ordinary ones, dropping a learned "hard hour" warning that lands within an hour of one. */
export function mergeZoneNudges(state, items, days = 7, now = Date.now()) {
  const zone = zoneNudges(state, now, { days });
  const near = (a, b) => Math.abs(a.at.getTime() - b.at.getTime()) < 60 * MINUTE;
  const kept = items.filter((n) => n.kind !== "urges" || !zone.some((z) => z.taskId === n.taskId && near(z, n)));
  return [...kept, ...zone].sort((a, b) => a.at - b.at);
}

/**
 * Saying a red zone was held, given "zoneId@date" from a notification or a card: the record to add and what to
 * tell the person, or null if it's meaningless or already said. A slip in that zone still outranks it.
 */
export function holdResult(state, taskId, zone) {
  const [zoneId, date] = String(zone || "").split("@");
  const task = (state.tasks || []).find((t) => t.id === taskId);
  if (!task || !zoneId || !date) return null;
  const hold = newZoneHold({ taskId, zoneId, date });
  if ((state.zoneLog || []).some((h) => h.id === hold.id)) return null;
  const { streak } = zoneStats({ ...state, zoneLog: [...(state.zoneLog || []), hold] }, task);
  return { hold, message: streak > 1 ? `Red zone cleared. ${streak} in a row.` : "Red zone cleared." };
}

// ---- The widget and the shade ----

/**
 * When this habit's red zones end, for the notification in the shade to ask "did you hold?" at the right moment without the app being
 * open: every occurrence that ended in the last two hours or ends in the next day and a half and has no answer yet, as the same
 * "zone@date" key the app files an answer under.
 */
export function shadeZoneEnds(state, task, now = Date.now()) {
  if (task.redZoneNudges === false) return [];
  return occurrences(task, now - 3 * 3600000, now + 36 * 3600000)
    .filter((o) => o.end > now - 2 * 3600000 && outcomeOf(state, task, o) === "open")
    .map((o) => ({ key: `${o.zoneId}@${o.date}`, endAt: o.end }))
    .sort((a, b) => a.endAt - b.endAt);
}

/** A habit's zones for the Android side to count down to: days as 0 = Sunday, times as minutes into the day. */
export const widgetZones = (task) =>
  zonesOf(task).map((z) => ({
    days: z.days.map((d) => WK_ORDER.indexOf(d)).sort((a, b) => a - b),
    startMin: toMinutes(z.from), endMin: toMinutes(z.to),
  }));
