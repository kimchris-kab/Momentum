import { FEELING_BY_ID, daysLost, slipsOf, urgeEvents } from "./urges.js";

// What the lapse log says about when and why a habit breaks. The build side has had cue
// stability, automaticity and comebacks for a while; the break side had two counters. This is
// its share of the analysis — under the same rule as every other finding in the app: nothing
// is said without enough behind it, and every sentence carries the numbers it came from.

const MIN_LAPSES = 4;      // below this, a "pattern" is a coincidence with a label on it
const MIN_URGES = 5;       // same for the ridden-out rate
const DOMINANT = 0.5;      // a time of day has to hold half the slips to be named
const WEEKDAY_SHARE = 0.4; // one day in seven holding 40% is well clear of chance
const TOP_SHARE = 0.4;     // a trigger or feeling has to be most of the story to be named

export const BREAK_MINIMUMS = { MIN_LAPSES, MIN_URGES };

export const TIME_BANDS = [
  { id: "late", label: "late at night", from: 0, to: 5 },
  { id: "morning", label: "in the morning", from: 5, to: 12 },
  { id: "afternoon", label: "in the afternoon", from: 12, to: 17 },
  { id: "evening", label: "in the evening", from: 17, to: 21 },
  { id: "night", label: "at night", from: 21, to: 24 },
];
const WEEKDAYS = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

const bandOf = (at) => {
  const h = new Date(at).getHours();
  return TIME_BANDS.find((b) => h >= b.from && h < b.to);
};

const topOf = (values) => {
  const counts = new Map();
  // Not filter(Boolean): Sunday is weekday 0, and dropping falsy values would mean Sunday
  // could never be named as the day it breaks.
  values.filter((v) => v !== null && v !== undefined && v !== "").forEach((v) => {
    const k = String(v).toLowerCase();
    const seen = counts.get(k);
    counts.set(k, { value: seen ? seen.value : v, n: (seen?.n || 0) + 1 });
  });
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
  return ranked[0] || null;
};

/** When in the day it happens, if one stretch clearly dominates. */
export function peakTime(lapses) {
  if (lapses.length < MIN_LAPSES) return null;
  const top = topOf(lapses.map((l) => bandOf(l.at).id));
  if (!top || top.n / lapses.length < DOMINANT) return null;
  const band = TIME_BANDS.find((b) => b.id === top.value);
  return { band, n: top.n, of: lapses.length, share: Math.round((top.n / lapses.length) * 100) };
}

// ---- When the pull usually comes ----
// peakTime above names a broad stretch of the day from slips. This is the other question — at
// what clock time should a warning go out — so it looks at every urge, ridden out or not (the
// ones ridden out are most of the evidence, and they never show up as slips), finds the
// two-hour stretch of the day that holds the most of them, and warns shortly before it begins.
const WINDOW_MINUTES = 120;
const WINDOW_STEP = 30;
const WINDOW_MIN_HITS = 3;     // fewer than three in one stretch is a coincidence
const WINDOW_SHARE = 0.4;      // ...and so is a stretch holding less than 40% of them
const WINDOW_RECENT_DAYS = 60; // old habits of mind shouldn't outvote this month's
export const URGE_LEAD_MINUTES = 20;

const hhmm = (minutes) => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * The clock time to warn at, from this habit's own log — or null until there is enough of it.
 * `warnAt` is shortly before the pull usually starts, not when it peaks: a warning at the peak
 * arrives with the urge, and the point is to arrive ahead of it. `around` is the middle of the
 * stretch, for saying in words when it usually comes.
 */
export function urgeWindow(task, urgeLog, { now = Date.now() } = {}) {
  const since = now - WINDOW_RECENT_DAYS * 86400000;
  const events = urgeEvents(task, urgeLog).filter((r) => r.at >= since);
  if (events.length < MIN_URGES) return null;

  const minutes = events.map((r) => { const d = new Date(r.at); return d.getHours() * 60 + d.getMinutes(); });
  // Slide a two-hour window round the clock. Modulo, so 23:30 and 00:20 are neighbours.
  let best = null;
  for (let start = 0; start < 1440; start += WINDOW_STEP) {
    const inside = minutes.map((m) => (m - start + 1440) % 1440).filter((off) => off < WINDOW_MINUTES);
    if (!best || inside.length > best.offsets.length) best = { start, offsets: inside.sort((a, b) => a - b) };
  }
  const n = best.offsets.length;
  if (n < WINDOW_MIN_HITS || n / events.length < WINDOW_SHARE) return null;

  // The early quartile rather than the earliest: one stray 8:05 shouldn't drag a nine o'clock
  // habit's warning to a quarter to eight.
  const early = best.offsets[Math.floor((n - 1) * 0.25)];
  const middle = best.offsets[Math.floor((n - 1) / 2)];
  return {
    warnAt: hhmm(best.start + early - URGE_LEAD_MINUTES),
    around: hhmm(best.start + middle),
    n, of: events.length, share: Math.round((n / events.length) * 100),
  };
}

/** Which day of the week, if one stands out. */
export function peakWeekday(lapses) {
  if (lapses.length < MIN_LAPSES) return null;
  const top = topOf(lapses.map((l) => new Date(l.at).getDay()));
  if (!top || top.n < 3 || top.n / lapses.length < WEEKDAY_SHARE) return null;
  return { day: WEEKDAYS[top.value], n: top.n, of: lapses.length };
}

/** The trigger or feeling behind most of them, if there is one. */
export function topCause(lapses, field) {
  const given = lapses.filter((l) => l[field]);
  if (given.length < MIN_LAPSES - 1) return null;
  const top = topOf(given.map((l) => l[field]));
  if (!top || top.n < 2 || top.n / given.length < TOP_SHARE) return null;
  return { value: top.value, n: top.n, of: given.length };
}

/** Of the urges met head-on, how many were ridden out. */
export function urgeRate(urges) {
  const met = urges.filter((u) => u.kind === "urge");
  if (met.length < MIN_URGES) return null;
  const rode = met.filter((u) => u.outcome === "rode-out").length;
  return { rode, of: met.length, pct: Math.round((rode / met.length) * 100) };
}

/**
 * Findings for every habit being broken, in the same { tone, label, text } shape as the rest
 * of Insights so they render in the same card.
 */
export function breakFindings(state) {
  const out = [];
  const log = state.urgeLog || [];
  (state.tasks || [])
    .filter((t) => t.kind === "break" && !t.archivedAt)
    .forEach((task) => {
      const mine = log.filter((r) => r.taskId === task.id);
      // Slips only — occurrences inside a cutting-down limit are the plan, not the problem.
      const lapses = slipsOf(task, log);
      // And for when-in-the-day and which-day, one per day: four in one afternoon is one
      // afternoon's evidence, and counting it four times is how a single Monday became "Mondays".
      const days = daysLost(task, log);
      const name = task.text;

      const when = peakTime(days);
      if (when) {
        out.push({
          tone: "bad",
          label: `${name} happens ${when.band.label}`,
          text: `${when.n} of your last ${when.of} slips were ${when.band.label}. That's the window to plan for — `
            + "the competing response, the phone in another room, whatever the note from calm you says.",
        });
      }

      const day = peakWeekday(days);
      if (day) {
        out.push({
          tone: "bad",
          label: `${day.day} are where it breaks`,
          text: `${day.n} of ${day.of} slips with ${name.toLowerCase()} fell on ${day.day}. `
            + "Whatever is different about that day is worth a look.",
        });
      }

      const trigger = topCause(lapses, "trigger");
      if (trigger) {
        const matchesSetup = task.trigger && task.trigger.toLowerCase() === String(trigger.value).toLowerCase();
        out.push({
          tone: "bad",
          label: `"${trigger.value}" sets it off`,
          text: `${trigger.n} of ${trigger.of} slips you gave a trigger for came back to this. `
            + (matchesSetup
              ? "It's the one you named at the start — you knew."
              : "It isn't the trigger you named at the start, which is exactly why it was worth recording each time."),
        });
      }

      const feeling = topCause(lapses, "feeling");
      if (feeling) {
        const label = FEELING_BY_ID[feeling.value]?.label || feeling.value;
        out.push({
          tone: "bad",
          label: `Mostly when ${label.toLowerCase()}`,
          text: `${feeling.n} of ${feeling.of} slips came with feeling ${label.toLowerCase()}. `
            + "Dealing with that directly may do more than resisting the habit does.",
        });
      }

      const rate = urgeRate(mine);
      if (rate) {
        out.push({
          tone: rate.pct >= 50 ? "good" : "bad",
          label: rate.pct >= 50 ? "You ride most urges out" : "Most urges win for now",
          text: `${rate.rode} of ${rate.of} urges ridden out — ${rate.pct}%. `
            + (rate.pct >= 50
              ? "Each one you ride out is practice for the next, and they get weaker."
              : "That is still more than none, and every one ridden out is practice for the next."),
        });
      }
    });
  return out;
}

export const hasBreakEvidence = (state) => breakFindings(state).length > 0;
