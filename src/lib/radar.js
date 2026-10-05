import { addDays, formatTime12, todayStr } from "./date.js";
import { agendaForDate, isDone } from "./tasks.js";
import { calmNoteParts, isSlipped, urgeEvents } from "./urges.js";

// The urge radar: how likely is it to pull at you right now, and when does the next hard stretch
// start? A warning notification already goes out before your usual hour; this is the live version
// of the same idea, on Today and the widget, with the reasons showing.
//
// It is held to the app's usual rule — nothing is said without enough behind it, and every
// sentence carries the numbers it came from — so it is deliberately plain statistics on your own
// log, not a model. Four things move it:
//
//   the time of day     where your logged urges actually fall, smoothed so a single one at 9:07
//                       doesn't make 9:00 a cliff edge. This is the main signal.
//   the weekday         only if your own urges lean clearly towards today.
//   a slip today        the hours after a lapse are the riskiest, which is also when "the day is
//                       ruined" thinking does its damage — so the line says the day isn't lost.
//   waves               two or more urges in the last three hours says today is a heavy one.
//
// It never says how much risk there is in absolute terms. It says how the moment compares with
// the rest of your own day, which is the only thing the data can support.

export const MIN_EVENTS = 5;          // below this the log can't say when it pulls at you
const RECENT_DAYS = 60;               // this month's pattern, not last year's
const BINS = 48;                      // half-hours
const KERNEL = [0.25, 0.5, 1, 0.5, 0.25];
const HIGH = 2.0;                     // twice your average half-hour
const RISING = 1.3;
const LOOKAHEAD_MIN = 6 * 60;
const SOON_MIN = 60;                  // a window starting within the hour counts as rising
const DAY = 86400000;
const HOUR = 3600000;
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** Half-hourly intensity of this habit's urges, as a multiple of its own average half-hour. */
export function intensity(events, now = Date.now()) {
  const raw = new Array(BINS).fill(0);
  events.filter((r) => r.at >= now - RECENT_DAYS * DAY).forEach((r) => {
    const d = new Date(r.at);
    raw[Math.floor((d.getHours() * 60 + d.getMinutes()) / 30)]++;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  if (!total) return { rel: new Array(BINS).fill(0), total: 0 };
  const norm = KERNEL.reduce((a, b) => a + b, 0);
  const smooth = raw.map((_, b) => KERNEL.reduce((acc, k, j) => acc + k * raw[(b + j - 2 + BINS) % BINS], 0) / norm);
  const mean = total / BINS;
  return { rel: smooth.map((v) => v / mean), total };
}

const MIN_REGION_HITS = 3;            // fewer than three urges in a stretch is a coincidence
const MIN_REGION_SHARE = 0.3;         // ...and so is a stretch holding under 30% of them

/**
 * Throws out any "high" stretch that too few urges actually fall in. Against a tiny average a single
 * urge looks like a spike — with urges scattered across the day, every one of them would otherwise
 * become a "risk window", and the reasons would read "1 of your last 8 urges came between 3:00 and
 * 3:30". A stretch has to be backed by several urges, and by a real share of them, to count.
 */
function credible(rel, events, now) {
  const raw = new Array(BINS).fill(0);
  events.filter((r) => r.at >= now - RECENT_DAYS * DAY).forEach((r) => {
    const d = new Date(r.at);
    raw[Math.floor((d.getHours() * 60 + d.getMinutes()) / 30)]++;
  });
  const total = raw.reduce((a, b) => a + b, 0);
  const high = rel.map((v) => v >= HIGH);
  const out = rel.slice();
  const anchor = high.findIndex((h) => !h);
  if (anchor === -1 || !total) return out;
  for (let k = 0; k < BINS;) {
    if (!high[(anchor + k) % BINS]) { k++; continue; }
    const bins = [];
    let j = k;
    while (j < BINS && high[(anchor + j) % BINS]) { bins.push((anchor + j) % BINS); j++; }
    const hits = bins.reduce((a, b) => a + raw[b], 0);
    if (hits < MIN_REGION_HITS || hits / total < MIN_REGION_SHARE) bins.forEach((b) => { out[b] = 0; });
    k = j;
  }
  return out;
}

const binOf = (ms) => { const d = new Date(ms); return Math.floor((d.getHours() * 60 + d.getMinutes()) / 30); };
const startOfBin = (ms) => { const d = new Date(ms); d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0); return d.getTime(); };

/** The hours between two timestamps as "8:30 PM". */
const clock = (ms) => {
  const d = new Date(ms);
  return formatTime12(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
};

/**
 * Where the radar is pointing for one habit being quit, right now.
 * Returns { level, ... } with level "unknown" until the log can say anything.
 */
export function radar(task, state, now = Date.now()) {
  const events = urgeEvents(task, state.urgeLog);
  const recent = events.filter((r) => r.at >= now - RECENT_DAYS * DAY);
  if (recent.length < MIN_EVENTS) return { level: "unknown", have: recent.length, need: MIN_EVENTS, reasons: [] };

  const rel = credible(intensity(recent, now).rel, recent, now);
  const today = new Date(now);
  const reasons = [];

  // ---- time of day: the core signal ----
  const here = rel[binOf(now)];
  // The stretch around the current half-hour, widened while it stays high.
  const edge = (from, step) => {
    let t = from, steps = 0;
    while (steps < 8 && rel[binOf(t + step * 30 * 60000)] >= HIGH) { t += step * 30 * 60000; steps++; }
    return t;
  };
  let inWindow = here >= HIGH;
  let startAt = null, endAt = null;
  if (inWindow) {
    startAt = startOfBin(edge(startOfBin(now), -1));
    endAt = startOfBin(edge(startOfBin(now), 1)) + 30 * 60000;
  } else {
    for (let m = 30; m <= LOOKAHEAD_MIN; m += 30) {
      const t = startOfBin(now) + m * 60000;
      if (rel[binOf(t)] >= HIGH) {
        startAt = t;
        endAt = startOfBin(edge(t, 1)) + 30 * 60000;
        break;
      }
    }
  }
  const minutesToStart = startAt === null ? null : Math.max(0, Math.round((startAt - now) / 60000));

  const hits = (a, b) => recent.filter((r) => {
    const m = new Date(r.at).getHours() * 60 + new Date(r.at).getMinutes();
    return m >= a && m < b;
  }).length;
  if (startAt !== null) {
    const sm = new Date(startAt).getHours() * 60 + new Date(startAt).getMinutes();
    const em = new Date(endAt - 1).getHours() * 60 + new Date(endAt - 1).getMinutes() + 1;
    const n = em > sm ? hits(sm, em) : hits(sm, 1440) + hits(0, em);
    reasons.push(`${n} of your last ${recent.length} urges came between ${clock(startAt)} and ${clock(endAt)}.`);
  }

  let score = here;

  // ---- the weekday, only if the log leans that way ----
  if (recent.length >= 8) {
    const byDay = recent.filter((r) => new Date(r.at).getDay() === today.getDay()).length;
    const share = byDay / recent.length;
    if (byDay >= 3 && share >= 0.22) {
      score *= Math.min(1.6, share * 7);
      reasons.push(`${WEEKDAYS[today.getDay()]} are heavier for you: ${byDay} of ${recent.length} urges.`);
    }
  }

  // ---- a slip earlier today ----
  const date = todayStr();
  const slipAt = state.dayLog?.[date]?.[task.id]?.at;
  if (isSlipped(task, date, state.dayLog) && slipAt && now - slipAt <= 6 * HOUR && now >= slipAt) {
    score *= 1.3;
    reasons.push(`You slipped at ${clock(slipAt)}. The next few hours are the riskiest, and the day isn't lost.`);
  }

  // ---- waves ----
  const lastThree = events.filter((r) => r.at > now - 3 * HOUR && r.at <= now).length;
  if (lastThree >= 2) {
    score *= 1.25;
    reasons.push(`${lastThree} urges in the last three hours: it's coming in waves today.`);
  }

  let level = score >= HIGH ? "high" : score >= RISING ? "rising" : "calm";
  // A hard stretch starting within the hour is worth a heads-up even while right now is quiet.
  if (level === "calm" && minutesToStart !== null && minutesToStart <= SOON_MIN) level = "rising";

  return {
    level, score: Math.round(score * 100) / 100, inWindow, startAt, endAt, minutesToStart,
    reasons, have: recent.length,
  };
}

/**
 * The stretch of the day this habit usually pulls at you, as minutes since midnight: { startMin, endMin }.
 * A time of day rather than a moment, so a widget can keep it correct on its own for as long as it likes
 * without the app having to write a fresh one each day. Null until the log can say.
 */
export function usualWindow(task, state, now = Date.now()) {
  const recent = urgeEvents(task, state.urgeLog).filter((r) => r.at >= now - RECENT_DAYS * DAY);
  if (recent.length < MIN_EVENTS) return null;
  const rel = credible(intensity(recent, now).rel, recent, now);
  let peak = 0;
  rel.forEach((v, i) => { if (v > rel[peak]) peak = i; });
  if (rel[peak] < HIGH) return null;
  let a = peak, b = peak, steps = 0;
  while (steps < 8 && rel[(a - 1 + BINS) % BINS] >= HIGH) { a = (a - 1 + BINS) % BINS; steps++; }
  steps = 0;
  while (steps < 8 && rel[(b + 1) % BINS] >= HIGH) { b = (b + 1) % BINS; steps++; }
  return { startMin: a * 30, endMin: ((b + 1) % BINS) * 30 };
}

/** One line for a row or a widget: where the hard stretch is. Null when there's nothing to say. */
export function radarLine(r) {
  if (!r || r.level === "unknown" || r.level === "calm") return null;
  if (r.level === "high") {
    return r.inWindow ? `High-risk stretch now, until ${clock(r.endAt)}` : "Higher risk than usual right now";
  }
  if (r.startAt === null) return "A little more likely than usual right now";
  if (r.inWindow) return `In your risk window now, until ${clock(r.endAt)}`;
  if (r.minutesToStart <= 90) return `Risk window opens in ${r.minutesToStart} min · ${clock(r.startAt)}`;
  return `Risk window ${clock(r.startAt)}–${clock(r.endAt)}`;
}

// ---- What to do about it ---------------------------------------------------------------------
/**
 * The plan to put in front of someone when the radar goes up: their own reason first (written
 * when calm, which is the whole point), then what they said they'd do instead, then making it
 * harder, then a plain fallback. Nothing here is invented — it's all things they wrote.
 */
export function rescueFor(task) {
  const steps = [];
  const why = calmNoteParts(task).find((p) => p.id === "why");
  if (why) steps.push({ kind: "why", label: "Your reason", text: why.text });
  if (task.competingResponse) steps.push({ kind: "instead", label: "Instead", text: task.competingResponse });
  if (task.friction) steps.push({ kind: "friction", label: "Make it harder", text: task.friction });
  if (!steps.length) steps.push({ kind: "default", label: "Get ahead of it", text: "Change rooms, put the phone down, a glass of water. Urges peak and fall; most are gone within twenty minutes." });
  return steps;
}

// ---- A hard day for a habit being built ------------------------------------------------------
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };

/** The hour (decimal) this habit usually gets done, from the days it was, or null with too few. */
export function usualHour(task, dayLog, today = todayStr()) {
  const hours = [];
  for (let i = 1; i <= 30; i++) {
    const done = dayLog?.[addDays(today, -i)]?.[task.id];
    if (done?.done && done.doneAt && !done.repaired) {
      const d = new Date(done.doneAt);
      hours.push(d.getHours() + d.getMinutes() / 60);
    }
  }
  return hours.length >= 5 ? median(hours) : null;
}

/** On this weekday, how often it was done over the last eight weeks: { done, due } */
export function weekdayRecord(task, dayLog, today = todayStr()) {
  const dow = new Date(`${today}T12:00:00`).getDay();
  let done = 0, due = 0;
  for (let w = 1; w <= 8; w++) {
    const d = addDays(today, -7 * w);
    if (new Date(`${d}T12:00:00`).getDay() !== dow) continue;
    if (d < (task.startDate || "0000")) continue;
    due++;
    if (dayLog?.[d]?.[task.id]?.done) done++;
  }
  return { done, due };
}

/**
 * Habits that look like they're about to slip today and have a small version to fall back on.
 * Three reasons, strongest evidence first: it's past when you usually do it; today's weekday is
 * one where it often doesn't get done; or the day is nearly over. Never more than two — a rescue
 * for everything is just a second to-do list.
 */
export function hardDay(state, now = Date.now()) {
  const today = todayStr();
  const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  const open = agendaForDate(state.tasks || [], today, state.dayLog || {}, "build")
    .filter((t) => !isDone(t, today, state.dayLog) && t.twoMin && !t.archivedAt);
  const out = [];
  for (const task of open) {
    const usual = usualHour(task, state.dayLog, today);
    const wd = weekdayRecord(task, state.dayLog, today);
    let reason = null;
    if (usual !== null && hour >= usual + 2.5 && hour >= 12) {
      const h = Math.floor(usual), m = Math.round((usual - h) * 60);
      reason = `You usually finish this by ${formatTime12(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`)}.`;
    } else if (wd.due >= 4 && wd.done / wd.due < 0.5 && hour >= 12) {
      reason = `${WEEKDAYS[new Date(now).getDay()]} are hard for this one: you've done it ${wd.done} of ${wd.due}.`;
    } else if (hour >= 20) {
      reason = "The day is nearly over.";
    }
    if (reason) out.push({ task, reason, tiny: task.twoMin });
    if (out.length === 2) break;
  }
  return out;
}
