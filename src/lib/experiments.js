import { addDays, todayStr } from "./date.js";
import { adherence, endDateOf, rng } from "./experimentPlan.js";

// Everything the plan module offers is available from here too, so callers can import from one place.
export * from "./experimentPlan.js";
import { PILLARS, P_BY_ID } from "../data/constants.js";
import { countsTowardDay, isDone, occursOn, tasksForDate } from "./tasks.js";
import { slipsOf, urgeEvents } from "./urges.js";

// Experiments on yourself.
//
// "Does keeping my phone out of the bedroom actually cut my night-time urges?" is a question the
// app has the data to answer — and the usual way of answering it, trying something for a while and
// deciding it felt like it worked, is how people fool themselves. Two things go wrong. Whatever else
// changed that fortnight gets the credit, and the mind finds the improvement it was looking for.
//
// So there are two designs, and the stronger one is the default:
//
//   coin-flip days   Days come in pairs; in each pair a coin decides which day you do the thing and
//                    which you don't. Weekday, weather, mood and the slow drift of a life all land
//                    on both arms about equally, and the result is judged by a randomization test —
//                    which asks how often chance alone would pull the arms this far apart. The
//                    assignments are made once, up front, and stored, so they can't be nudged.
//   before / after   For changes that can't be switched on and off daily. It compares the days
//                    before you started with the days since, and says plainly that it can't rule
//                    out something else having changed at the same time.
//
// And the answer is worded to match the evidence: "No clear effect" is a finding, not a failure,
// and nothing is called a result below a sample that could support one.

export const MIN_PAIRS = 5;       // complete coin-flip pairs before any verdict
export const MIN_PER_WINDOW = 6;  // observed days in each window for before / after
const EXACT_LIMIT = 16;           // up to this many pairs the test enumerates every possibility
const SHUFFLES = 20000;           // beyond that it samples, from a fixed seed so the answer is stable

// ---- What can be measured ------------------------------------------------------------------
// Each is one number per day. A day with no answer is null — not zero — because "I didn't log
// anything" and "it didn't happen" are different facts, and averaging them together is how a
// quiet week looks like a good one.
export const METRIC_KINDS = [
  { kind: "urges", label: "Urges and slips", needs: "break", better: "down", unit: "a day", about: "How many times it pulled at you, ridden out or not." },
  { kind: "slips", label: "Slips", needs: "break", better: "down", unit: "a day", about: "Only the times it won." },
  { kind: "habit", label: "Doing one habit", needs: "build", better: "up", percent: true, about: "Whether you did it on the days it was due." },
  { kind: "habits", label: "All my habits", better: "up", percent: true, about: "The share of each day's habits you did." },
  { kind: "feel", label: "How the day felt", better: "up", unit: "out of 5", about: "From your check-in." },
  { kind: "recharge", label: "How recharged you felt", better: "up", unit: "out of 5", about: "From your check-in." },
  { kind: "balance", label: "Life balance", better: "up", unit: "out of 5", about: "The average of your seven pillars at check-in." },
  { kind: "pillar", label: "One pillar", needs: "pillar", better: "up", unit: "out of 5", about: "One pillar's score at check-in." },
  { kind: "spend", label: "Spending", better: "down", unit: "a day", money: true, about: "What you logged as spent." },
  { kind: "focus", label: "Focus time", better: "up", unit: "minutes a day", about: "Time in focus sessions." },
];
export const KIND_BY_ID = Object.fromEntries(METRIC_KINDS.map((k) => [k.kind, k]));

// Ideas worth testing, each with the thing it's most likely to move.
export const STARTERS = [
  { id: "phone", title: "Phone out of the bedroom", change: "Charge the phone outside the bedroom overnight", metric: { kind: "recharge" }, mode: "flip", note: "Often the biggest lever on both sleep and late-night scrolling." },
  { id: "caffeine", title: "No caffeine after noon", change: "No caffeine after 12:00", metric: { kind: "recharge" }, mode: "flip", note: "Caffeine's effect on sleep lingers well past the last cup." },
  { id: "walk", title: "A ten-minute morning walk", change: "Walk for ten minutes before 10am", metric: { kind: "feel" }, mode: "flip", note: "Cheap to do, easy to doubt. Let the data say." },
  { id: "screens", title: "Screens off an hour before bed", change: "No screens for the hour before bed", metric: { kind: "recharge" }, mode: "flip", note: "" },
  { id: "write", title: "Write one line at night", change: "Write one line in the journal before bed", metric: { kind: "feel" }, mode: "flip", note: "" },
  { id: "plan", title: "Plan tomorrow tonight", change: "Spend five minutes planning tomorrow before bed", metric: { kind: "habits" }, mode: "before-after", note: "A change that's hard to switch on and off daily, so it compares before with after." },
];

const balanceOf = (checkin) => {
  const vals = PILLARS.map((p) => checkin?.scores?.[p.id]).filter((v) => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

/** Everything the metrics read from, indexed once. */
export function buildContext(state) {
  const active = new Set();
  Object.entries(state.dayLog || {}).forEach(([d, day]) => { if (day && Object.keys(day).length) active.add(d); });
  (state.checkins || []).forEach((c) => active.add(c.date));
  (state.journalEntries || []).forEach((e) => e.date && active.add(e.date));
  (state.transactions || []).forEach((t) => t.date && active.add(t.date));
  (state.urgeLog || []).forEach((r) => r.date && active.add(r.date));
  (state.focusSessions || []).forEach((s) => s.date && active.add(s.date));

  const checkins = new Map((state.checkins || []).map((c) => [c.date, c]));
  const spend = new Map();
  (state.transactions || []).filter((t) => t.type === "expense").forEach((t) => {
    spend.set(t.date, (spend.get(t.date) || 0) + (Number(t.amount) || 0));
  });
  const focus = new Map();
  (state.focusSessions || []).forEach((s) => focus.set(s.date, (focus.get(s.date) || 0) + (s.seconds || 0) / 60));
  return { state, active, checkins, spend, focus, tasks: state.tasks || [], dayLog: state.dayLog || {}, urgeLog: state.urgeLog || [] };
}

/** One day's value for a metric, or null when there's no honest answer for that day. */
export function metricValue(ctx, metric, date) {
  const seen = ctx.active.has(date);
  switch (metric.kind) {
    case "urges": {
      const task = ctx.tasks.find((t) => t.id === metric.taskId);
      if (!task || !seen) return null;
      return urgeEvents(task, ctx.urgeLog).filter((r) => r.date === date).length;
    }
    case "slips": {
      const task = ctx.tasks.find((t) => t.id === metric.taskId);
      if (!task || !seen) return null;
      return slipsOf(task, ctx.urgeLog).filter((r) => r.date === date).length;
    }
    case "habit": {
      const task = ctx.tasks.find((t) => t.id === metric.taskId);
      if (!task || !occursOn(task, date)) return null;
      return isDone(task, date, ctx.dayLog) ? 1 : 0;
    }
    case "habits": {
      const due = tasksForDate(ctx.tasks, date, "build").filter((t) => countsTowardDay(t, date, ctx.dayLog));
      if (!due.length) return null;
      return due.filter((t) => isDone(t, date, ctx.dayLog)).length / due.length;
    }
    case "feel": return ctx.checkins.get(date)?.feel ?? null;
    case "recharge": return ctx.checkins.get(date)?.recharge ?? null;
    case "balance": return balanceOf(ctx.checkins.get(date));
    case "pillar": {
      const v = ctx.checkins.get(date)?.scores?.[metric.pillarId];
      return typeof v === "number" ? v : null;
    }
    case "spend": return seen ? (ctx.spend.get(date) || 0) : null;
    case "focus": return seen ? Math.round(ctx.focus.get(date) || 0) : null;
    default: return null;
  }
}

/** Why a metric can't be measured, or null if it can. */
export function metricProblem(metric, state) {
  const kind = KIND_BY_ID[metric?.kind];
  if (!kind) return "Pick something to measure.";
  if (kind.needs === "break" || kind.needs === "build") {
    const task = (state.tasks || []).find((t) => t.id === metric.taskId);
    if (!task) return `Pick which ${kind.needs === "break" ? "habit you're quitting" : "habit"}.`;
    if (task.kind !== kind.needs) return "That's not the right kind of habit for this measure.";
  }
  if (kind.needs === "pillar" && !P_BY_ID[metric.pillarId]) return "Pick a pillar.";
  return null;
}

export function describeMetric(metric, state) {
  const kind = KIND_BY_ID[metric?.kind];
  if (!kind) return "";
  const task = (state?.tasks || []).find((t) => t.id === metric.taskId);
  if (kind.needs === "break" || kind.needs === "build") return `${kind.label.toLowerCase()} · ${task ? task.text : "(habit removed)"}`;
  if (kind.needs === "pillar") return `${P_BY_ID[metric.pillarId]?.name || "pillar"} score`;
  return kind.label.toLowerCase();
}

// ---- Setting one up ------------------------------------------------------------------------
/**
 * Days in pairs; in each pair a seeded coin decides which is the "do" day. Made once and stored,
 * so the plan can't be quietly re-rolled until it says what you hoped.
 */
export function assignmentsFor(id, startDate, days) {
  const out = {};
  for (let k = 0; k < Math.floor(days / 2); k++) {
    const first = addDays(startDate, 2 * k);
    const second = addDays(first, 1);
    const doFirst = rng(`${id}:${k}`)() < 0.5;
    out[first] = doFirst ? "do" : "skip";
    out[second] = doFirst ? "skip" : "do";
  }
  return out;
}

export function newExperiment({ title, change, metric, mode = "flip", days, startDate = todayStr(), baselineDays = 14, at = Date.now() }) {
  const kind = KIND_BY_ID[metric?.kind];
  const flip = mode !== "before-after";
  // Pairs need an even number of days.
  const length = Math.max(flip ? 8 : 7, Math.min(28, Math.round(days || 14)));
  const run = flip ? length - (length % 2) : length;
  const id = `x-${at}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    title: (title || "").trim() || (change || "").trim() || "Experiment",
    change: (change || "").trim(),
    metric: { ...metric },
    better: kind?.better || "up",
    mode: flip ? "flip" : "before-after",
    startDate,
    days: run,
    baselineDays: flip ? 0 : Math.max(7, Math.min(28, baselineDays)),
    assignments: flip ? assignmentsFor(id, startDate, run) : null,
    followed: {},
    stoppedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

// ---- The statistics ------------------------------------------------------------------------
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * Paired randomization test. Under "the change does nothing", which day of each pair got the
 * change was a coin flip, so every pair's difference is as likely to be negative as positive.
 * Enumerating (or sampling) those sign flips gives the share of outcomes at least as extreme as
 * the one seen: the p-value, with no assumptions about the shape of the data.
 */
export function pairedRandomizationP(diffs, seed = "paired") {
  const n = diffs.length;
  if (!n) return 1;
  const observed = Math.abs(mean(diffs));
  const EPS = 1e-9;
  if (n <= EXACT_LIMIT) {
    let extreme = 0;
    const total = 1 << n;
    for (let mask = 0; mask < total; mask++) {
      let sum = 0;
      for (let i = 0; i < n; i++) sum += (mask >> i) & 1 ? -diffs[i] : diffs[i];
      if (Math.abs(sum / n) >= observed - EPS) extreme++;
    }
    return extreme / total;
  }
  const next = rng(seed);
  let extreme = 1; // counting the observed arrangement itself keeps p above zero
  for (let s = 0; s < SHUFFLES; s++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += next() < 0.5 ? -diffs[i] : diffs[i];
    if (Math.abs(sum / n) >= observed - EPS) extreme++;
  }
  return extreme / (SHUFFLES + 1);
}

/** Two-window permutation test on the difference of means, for before / after. */
export function permutationP(a, b, seed = "windows") {
  if (!a.length || !b.length) return 1;
  const observed = Math.abs(mean(b) - mean(a));
  const pool = [...a, ...b];
  const next = rng(seed);
  const EPS = 1e-9;
  let extreme = 1;
  for (let s = 0; s < SHUFFLES; s++) {
    // Fisher–Yates on a copy.
    const p = pool.slice();
    for (let i = p.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    const left = p.slice(0, a.length);
    const right = p.slice(a.length);
    if (Math.abs(mean(right) - mean(left)) >= observed - EPS) extreme++;
  }
  return extreme / (SHUFFLES + 1);
}

// ---- Reading the result --------------------------------------------------------------------
/**
 * Analyses an experiment against the data so far. Only complete days count: today is still
 * being written, and half a day would drag every average toward zero.
 */
export function analyze(exp, state, today = todayStr()) {
  const ctx = buildContext(state);
  const kind = KIND_BY_ID[exp.metric?.kind] || {};
  const lastComplete = addDays(today, -1);
  const flip = exp.mode === "flip";
  const series = [];
  let base = null, treated = null, diff = null, p = 1, n = 0, need = 0;

  if (flip) {
    const diffs = [];
    const doVals = [], skipVals = [];
    for (let k = 0; k < Math.floor(exp.days / 2); k++) {
      const d1 = addDays(exp.startDate, 2 * k);
      const d2 = addDays(d1, 1);
      const doDate = exp.assignments?.[d1] === "do" ? d1 : d2;
      const skipDate = doDate === d1 ? d2 : d1;
      const vDo = d2 <= lastComplete ? metricValue(ctx, exp.metric, doDate) : null;
      const vSkip = d2 <= lastComplete ? metricValue(ctx, exp.metric, skipDate) : null;
      series.push({ date: doDate, arm: "do", value: vDo }, { date: skipDate, arm: "skip", value: vSkip });
      if (vDo !== null && vSkip !== null) { diffs.push(vDo - vSkip); doVals.push(vDo); skipVals.push(vSkip); }
    }
    n = diffs.length;
    need = Math.max(0, MIN_PAIRS - n);
    if (n) {
      treated = mean(doVals); base = mean(skipVals); diff = mean(diffs);
      p = pairedRandomizationP(diffs, exp.id);
    }
  } else {
    const before = [], after = [];
    for (let i = exp.baselineDays; i >= 1; i--) {
      const date = addDays(exp.startDate, -i);
      const v = metricValue(ctx, exp.metric, date);
      series.push({ date, arm: "before", value: v });
      if (v !== null) before.push(v);
    }
    const stop = endDateOf(exp) < lastComplete ? endDateOf(exp) : lastComplete;
    for (let date = exp.startDate; date <= stop; date = addDays(date, 1)) {
      const v = metricValue(ctx, exp.metric, date);
      series.push({ date, arm: "after", value: v });
      if (v !== null) after.push(v);
    }
    n = Math.min(before.length, after.length);
    need = Math.max(0, MIN_PER_WINDOW - n);
    if (before.length && after.length) {
      base = mean(before); treated = mean(after); diff = treated - base;
      p = permutationP(before, after, exp.id);
    }
  }

  const enough = flip ? n >= MIN_PAIRS : n >= MIN_PER_WINDOW;
  // Positive means the change moved the number in the direction that was hoped for.
  const gain = diff === null ? 0 : (exp.better === "down" ? -diff : diff);
  let verdict = "too-early";
  if (enough) {
    if (p < 0.05) verdict = gain > 0 ? "worked" : gain < 0 ? "backfired" : "nothing";
    else if (p < 0.2) verdict = gain > 0 ? "leaning-good" : gain < 0 ? "leaning-bad" : "nothing";
    else verdict = "nothing";
  }

  const adh = adherence(exp, today);
  const caveats = [];
  caveats.push(flip
    ? "Days were assigned by coin flip in pairs, so weekday, mood and the drift of ordinary life landed on both sides about equally."
    : "This compares before with after, so anything else that changed around the same time could be responsible. Coin-flip days rule that out.");
  if (adh.due >= 4 && adh.pct !== null && adh.pct < 70) {
    caveats.push(`You followed it on ${adh.done} of ${adh.due} days it asked, so this is partly a result about sticking to it.`);
  }
  if (["urges", "slips", "spend", "focus"].includes(exp.metric?.kind)) {
    caveats.push("Days count when you opened the app. A day with nothing logged is left out, not counted as a good one.");
  }

  return {
    verdict, mode: exp.mode, n, need, p, diff, gain,
    treated, base,
    pct: base !== null && base !== 0 && diff !== null ? diff / Math.abs(base) : null,
    adherence: adh, caveats, series, kind,
  };
}

const fmt = (v, kind) => {
  if (v === null || v === undefined) return "—";
  if (kind?.percent) return `${Math.round(v * 100)}%`;
  const r = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return String(r);
};

/** "about 1 in 50" — what a p-value means, in words someone can hold. */
export function chanceInWords(p) {
  if (p >= 0.5) return "about as often as not";
  const oneIn = Math.max(2, Math.round(1 / p));
  return `about 1 time in ${oneIn}`;
}

/**
 * The headline and the supporting line for a result. Careful in both directions: it won't call a
 * small sample a finding, and it won't dress "nothing" up as failure.
 */
export function describeResult(result, exp) {
  const kind = result.kind || {};
  const unit = kind.percent ? "" : kind.unit ? ` ${kind.unit}` : "";
  const label = (kind.label || "the measure").toLowerCase();
  const doWord = exp.mode === "flip" ? "On the days you did it" : "Since you started";
  const otherWord = exp.mode === "flip" ? "on the days you didn't" : "before";
  const gap = result.diff === null ? null : `${fmt(Math.abs(result.diff), kind)}${unit}`;
  const direction = result.diff === null ? "" : (result.diff < 0 ? "lower" : "higher");
  const numbers = result.treated === null ? ""
    : `${doWord}, ${label} averaged ${fmt(result.treated, kind)}${unit}, against ${fmt(result.base, kind)}${unit} ${otherWord}.`;
  const chance = `A gap this size would turn up by chance ${chanceInWords(result.p)}.`;
  // Left out when the starting point was zero: "infinity percent" says nothing.
  const percent = result.pct === null ? "" : ` (${Math.abs(Math.round(result.pct * 100))}%)`;

  switch (result.verdict) {
    case "too-early":
      return {
        headline: "Too early to say",
        body: result.n === 0
          ? "There aren't any complete days to compare yet."
          : `${result.n} ${exp.mode === "flip" ? (result.n === 1 ? "pair is" : "pairs are") : (result.n === 1 ? "day is" : "days are")} in. It needs ${result.need} more before it will say anything — a verdict on this little data would be a guess.`,
        numbers,
      };
    case "worked":
      return { headline: "It looks like it helped", body: `${gap} ${direction}${percent}. ${chance}`, numbers };
    case "backfired":
      return { headline: "It moved the wrong way", body: `${gap} ${direction}, which is the opposite of what you wanted. ${chance}`, numbers };
    case "leaning-good":
      return { headline: "Leaning in your favour", body: `${gap} ${direction}, but ${chance} Not enough to be sure — more days would settle it.`, numbers };
    case "leaning-bad":
      return { headline: "Leaning the wrong way", body: `${gap} ${direction}, but ${chance} Not enough to be sure.`, numbers };
    default:
      return {
        headline: "No clear effect",
        body: `A gap this size would turn up by chance ${chanceInWords(result.p)}, so it isn't evidence of an effect. That's an answer: this change probably isn't what's moving ${label}, and you can stop doing it without losing anything.`,
        numbers,
      };
  }
}
