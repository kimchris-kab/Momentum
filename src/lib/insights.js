import { BLOCKERS, ENERGIZERS, JOURNAL_MOODS, PILLARS, P_BY_ID, WEEKDAYS, WK_ORDER } from "../data/constants.js";
import { addDays, daysBetween, monthKeyOf, todayStr, weekdayKey } from "./date.js";
import {
  countsTowardDay, isDone, isFlexible, occursOn, tasksForDate, weeklyTarget,
} from "./tasks.js";
import { txBucket } from "./money.js";

export const SPANS = [
  { id: "week", label: "7 days", days: 7 },
  { id: "month", label: "30 days", days: 30 },
  { id: "quarter", label: "90 days", days: 90 },
  { id: "all", label: "All", days: null },
];

const MIN_SAMPLE = 3;
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null);

export function earliestDate(state) {
  const dates = [
    ...state.checkins.map((c) => c.date),
    ...Object.keys(state.dayLog || {}),
    ...state.journalEntries.map((e) => e.date),
    ...state.transactions.map((t) => t.date),
  ].filter(Boolean).sort();
  return dates[0] || todayStr();
}

// Current window plus the equally long window before it, so every headline number can be
// shown as a change rather than a bare figure.
export function periodRange(state, spanId) {
  const span = SPANS.find((s) => s.id === spanId) || SPANS[0];
  const to = todayStr();
  const days = span.days ?? Math.max(1, daysBetween(earliestDate(state), to) + 1);
  const from = addDays(to, -(days - 1));
  return { days, from, to, prevFrom: addDays(from, -days), prevTo: addDays(from, -1) };
}

const inRange = (date, from, to) => date >= from && date <= to;
export const eachDay = (from, to) => {
  const out = [];
  let cursor = from;
  for (let i = 0; i < 1000 && cursor <= to; i++) { out.push(cursor); cursor = addDays(cursor, 1); }
  return out;
};

export const balanceOf = (checkin) => {
  const vals = PILLARS.map((p) => checkin.scores?.[p.id]).filter((v) => typeof v === "number");
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
};

export const checkinsIn = (checkins, from, to) => checkins.filter((c) => inRange(c.date, from, to));

// ---- Headline metrics, each comparable against the previous window ----
export function metricsFor(state, from, to) {
  const { tasks, dayLog, checkins, journalEntries, transactions, milestones, freezes } = state;
  const days = eachDay(from, to);
  const cs = checkinsIn(checkins, from, to);

  let habitDone = 0, habitScheduled = 0, perfectDays = 0, scheduledDays = 0;
  let breakDone = 0, breakScheduled = 0;
  days.forEach((d) => {
    // countsTowardDay everywhere a day is the denominator — see its definition in tasks.js.
    const build = tasksForDate(tasks, d, "build").filter((t) => countsTowardDay(t, d, dayLog));
    const doneCount = build.filter((t) => isDone(t, d, dayLog)).length;
    habitScheduled += build.length;
    habitDone += doneCount;
    if (build.length) {
      scheduledDays++;
      if (doneCount === build.length) perfectDays++;
    }
    const avoid = tasksForDate(tasks, d, "break").filter((t) => countsTowardDay(t, d, dayLog));
    breakScheduled += avoid.length;
    breakDone += avoid.filter((t) => isDone(t, d, dayLog)).length;
  });

  const tasksDone = tasks.filter((t) =>
    t.kind === "todo" && t.done && t.doneAt && inRange(dateOfTs(t.doneAt), from, to)).length;

  const income = transactions
    .filter((t) => t.type === "income" && inRange(t.date, from, to))
    .reduce((a, t) => a + t.amount, 0);
  const saved = transactions
    .filter((t) => t.type === "expense" && txBucket(t) === "savings" && inRange(t.date, from, to))
    .reduce((a, t) => a + t.amount, 0);

  return {
    days: days.length,
    balance: round1(mean(cs.map(balanceOf).filter((v) => v !== null))),
    logged: cs.length,
    feel: round1(mean(cs.map((c) => c.feel).filter(Boolean))),
    recharge: round1(mean(cs.map((c) => c.recharge).filter(Boolean))),
    habitPct: pct(habitDone, habitScheduled),
    habitDone,
    habitScheduled,
    perfectDays,
    scheduledDays,
    breakPct: pct(breakDone, breakScheduled),
    tasksDone,
    journalCount: journalEntries.filter((e) => inRange(e.date, from, to)).length,
    milestones: (milestones || []).filter((m) => inRange(m.date, from, to)).length,
    freezesUsed: Object.keys(freezes || {}).filter((d) => inRange(d, from, to)).length,
    savingsRate: income > 0 ? Math.round((saved / income) * 100) : null,
    deeds: cs.filter((c) => c.deed).length,
  };
}

const dateOfTs = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function delta(cur, prev) {
  if (cur === null || prev === null || prev === undefined) return null;
  const diff = cur - prev;
  if (Math.abs(diff) < 0.05) return { diff: 0, dir: "flat" };
  return { diff: Math.round(diff * 10) / 10, dir: diff > 0 ? "up" : "down" };
}

// ---- Per-pillar movement ----
export function pillarMovement(checkins, from, to, prevFrom, prevTo) {
  const cur = checkinsIn(checkins, from, to);
  const prev = checkinsIn(checkins, prevFrom, prevTo);
  return PILLARS.map((p) => {
    const c = mean(cur.map((x) => x.scores?.[p.id]).filter((v) => typeof v === "number"));
    const q = mean(prev.map((x) => x.scores?.[p.id]).filter((v) => typeof v === "number"));
    return { id: p.id, name: p.name, color: p.color, value: round1(c), prev: round1(q), change: delta(round1(c), round1(q)) };
  });
}

// ---- Day-of-week pattern: the most actionable habit finding there is ----
export function weekdayPattern(tasks, dayLog, from, to) {
  const buckets = Object.fromEntries(WK_ORDER.map((k) => [k, { done: 0, scheduled: 0 }]));
  eachDay(from, to).forEach((d) => {
    const wk = weekdayKey(d);
    // Same rule as the day rollups: a quota habit is available every day, so counting it as
    // scheduled on all seven would inflate every weekday's denominator and invent a slump.
    tasksForDate(tasks, d, "build").filter((t) => countsTowardDay(t, d, dayLog)).forEach((t) => {
      buckets[wk].scheduled++;
      if (isDone(t, d, dayLog)) buckets[wk].done++;
    });
  });
  return WEEKDAYS.map((d) => ({
    key: d.key, label: d.short, full: d.label, letter: d.letter,
    ...buckets[d.key],
    pct: pct(buckets[d.key].done, buckets[d.key].scheduled),
  }));
}

// ---- Correlations: what actually moves your days ----
function splitAvg(checkins, predicate) {
  const withIt = checkins.filter(predicate).map(balanceOf).filter((v) => v !== null);
  const without = checkins.filter((c) => !predicate(c)).map(balanceOf).filter((v) => v !== null);
  if (withIt.length < MIN_SAMPLE || without.length < MIN_SAMPLE) return null;
  const a = mean(withIt), b = mean(without);
  return { with: round1(a), without: round1(b), lift: Math.round((a - b) * 10) / 10, n: withIt.length };
}

export function energizerImpact(checkins) {
  return ENERGIZERS
    .map((e) => ({ ...e, ...(splitAvg(checkins, (c) => (c.energizers || []).includes(e.id)) || {}) }))
    .filter((e) => e.lift !== undefined)
    .sort((a, b) => b.lift - a.lift);
}

export function blockerImpact(checkins) {
  return BLOCKERS
    .map((b) => ({ ...b, ...(splitAvg(checkins, (c) => (c.blockers || []).includes(b.id)) || {}) }))
    .filter((b) => b.lift !== undefined)
    .sort((a, b) => a.lift - b.lift);
}

// Does hitting every habit actually make the day feel better?
export function habitMoodLink(state, from, to) {
  const { tasks, dayLog, checkins } = state;
  const full = [], partial = [];
  checkinsIn(checkins, from, to).forEach((c) => {
    const build = tasksForDate(tasks, c.date, "build").filter((t) => countsTowardDay(t, c.date, dayLog));
    if (!build.length || !c.feel) return;
    const done = build.filter((t) => isDone(t, c.date, dayLog)).length;
    (done === build.length ? full : partial).push(c.feel);
  });
  if (full.length < MIN_SAMPLE || partial.length < MIN_SAMPLE) return null;
  return {
    full: round1(mean(full)), partial: round1(mean(partial)),
    lift: Math.round((mean(full) - mean(partial)) * 10) / 10,
    nFull: full.length, nPartial: partial.length,
  };
}

export function weekdayBalance(checkins, from, to) {
  const buckets = Object.fromEntries(WK_ORDER.map((k) => [k, []]));
  checkinsIn(checkins, from, to).forEach((c) => {
    const b = balanceOf(c);
    if (b !== null) buckets[weekdayKey(c.date)].push(b);
  });
  return WEEKDAYS.map((d) => ({
    key: d.key, label: d.short, n: buckets[d.key].length, value: round1(mean(buckets[d.key])),
  }));
}

export function moodCounts(journalEntries, from, to) {
  const counts = {};
  journalEntries.filter((e) => inRange(e.date, from, to))
    .forEach((e) => (e.moods || []).forEach((m) => { counts[m] = (counts[m] || 0) + 1; }));
  return JOURNAL_MOODS.map((m) => ({ ...m, count: counts[m.id] || 0 }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function habitTrends(state, from, to, prevFrom, prevTo) {
  const { tasks, dayLog } = state;
  const rate = (task, a, b) => {
    let done = 0, scheduled = 0;
    // A quota habit asks for target × weeks over the window, not one per day it appears on.
    if (isFlexible(task)) {
      const all = eachDay(a, b);
      all.forEach((d) => { if (isDone(task, d, dayLog)) done++; });
      scheduled = weeklyTarget(task) * Math.max(1, Math.round(all.length / 7));
      return { done, scheduled, pct: Math.min(100, pct(done, scheduled) ?? 0) };
    }
    eachDay(a, b).forEach((d) => {
      if (!occursOn(task, d)) return;
      scheduled++;
      if (isDone(task, d, dayLog)) done++;
    });
    return { done, scheduled, pct: pct(done, scheduled) };
  };
  return tasks
    .filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt)
    .map((t) => {
      const cur = rate(t, from, to);
      const prev = rate(t, prevFrom, prevTo);
      return {
        id: t.id, text: t.text, pillarId: t.pillarId,
        ...cur,
        prevPct: prev.pct,
        change: cur.pct !== null && prev.pct !== null ? cur.pct - prev.pct : null,
      };
    })
    .filter((h) => h.scheduled > 0)
    .sort((a, b) => b.pct - a.pct);
}

// ---- Generated findings: plain sentences, each backed by the numbers behind it ----
export function buildFindings(state, range) {
  const { from, to, prevFrom, prevTo } = range;
  const cs = checkinsIn(state.checkins, from, to);
  const out = [];

  // Nothing here should speak with confidence about a handful of days. Without a real base of
  // evidence the honest answer is "not yet", not a pattern reverse-engineered from noise.
  const totals = metricsFor(state, from, to);
  if (cs.length < MIN_SAMPLE && totals.habitDone < 5) return out;

  const energizers = energizerImpact(cs);
  if (energizers.length && energizers[0].lift > 0.2) {
    const e = energizers[0];
    out.push({
      tone: "good", label: e.label,
      text: `Days with ${e.label.toLowerCase()} score ${e.lift.toFixed(1)} higher on average (${e.with} vs ${e.without}). Protect it — it's your strongest lever.`,
    });
  }

  const blockers = blockerImpact(cs);
  if (blockers.length && blockers[0].lift < -0.2) {
    const b = blockers[0];
    out.push({
      tone: "bad", label: b.label,
      text: `${b.label} costs you ${Math.abs(b.lift).toFixed(1)} points on the days it shows up (${b.with} vs ${b.without}). ${b.tip}`,
    });
  }

  const link = habitMoodLink(state, from, to);
  if (link && link.lift > 0.2) {
    out.push({
      tone: "good", label: "Habits lift mood",
      text: `You feel ${link.lift.toFixed(1)} better on days you finish every habit (${link.full} vs ${link.partial} out of 5). The plan is working on you, not just your checklist.`,
    });
  }

  // Each weekday needs several occurrences of its own, and the window needs a real body of
  // completed reps, before "you're bad at Tuesdays" is a claim rather than a coincidence.
  const wk = weekdayPattern(state.tasks, state.dayLog, from, to).filter((d) => d.scheduled >= 4);
  if (wk.length >= 3 && totals.habitDone >= 8) {
    const worst = [...wk].sort((a, b) => a.pct - b.pct)[0];
    const best = [...wk].sort((a, b) => b.pct - a.pct)[0];
    if (best.pct - worst.pct >= 25) {
      out.push({
        tone: "bad", label: `${worst.full} is your weak day`,
        text: `You hit ${worst.pct}% of habits on ${worst.full}s versus ${best.pct}% on ${best.full}s. Either shrink what's scheduled on ${worst.full} or move it to a day that works.`,
      });
    }
  }

  const cur = metricsFor(state, from, to);
  const prev = metricsFor(state, prevFrom, prevTo);
  const habitChange = delta(cur.habitPct, prev.habitPct);
  if (habitChange && habitChange.dir !== "flat" && prev.habitScheduled >= MIN_SAMPLE) {
    out.push({
      tone: habitChange.dir === "up" ? "good" : "bad",
      label: habitChange.dir === "up" ? "Trending up" : "Slipping",
      text: `Habit completion ${habitChange.dir === "up" ? "rose" : "fell"} ${Math.abs(habitChange.diff)} ${Math.abs(habitChange.diff) === 1 ? "point" : "points"} versus the previous ${cur.days} days (${prev.habitPct}% → ${cur.habitPct}%).`,
    });
  }

  const moved = pillarMovement(state.checkins, from, to, prevFrom, prevTo)
    .filter((p) => p.change && p.change.dir !== "flat");
  const climbed = [...moved].sort((a, b) => b.change.diff - a.change.diff)[0];
  const dropped = [...moved].sort((a, b) => a.change.diff - b.change.diff)[0];
  if (climbed && climbed.change.diff > 0.2) {
    out.push({
      tone: "good", label: climbed.name,
      text: `${climbed.name} climbed ${climbed.change.diff.toFixed(1)} points to ${climbed.value}. Whatever changed there, keep doing it.`,
    });
  }
  if (dropped && dropped.change.diff < -0.2 && dropped.id !== climbed?.id) {
    out.push({
      tone: "bad", label: dropped.name,
      text: `${dropped.name} fell ${Math.abs(dropped.change.diff).toFixed(1)} to ${dropped.value}. One small habit there would even out your map.`,
    });
  }

  if (cur.recharge !== null && cur.recharge <= 2.4 && cs.length >= MIN_SAMPLE) {
    out.push({
      tone: "bad", label: "Running low",
      text: `Your average recharge is ${cur.recharge} out of 5 across ${cs.length} check-ins. That's the burnout range — plan an easier week before your body plans it for you.`,
    });
  }

  if (cur.perfectDays >= 3 && cur.scheduledDays) {
    out.push({
      tone: "good", label: "Perfect days",
      text: `${cur.perfectDays} of ${cur.scheduledDays} scheduled days were a clean sweep. Those are the days worth studying — what did they have in common?`,
    });
  }

  return out;
}

// One-line summary for the top of the view
export function narrative(cur, prev, range) {
  if (!cur.logged && !cur.habitScheduled) {
    return "Nothing logged in this window yet — check in or complete a habit and this fills in.";
  }
  const bits = [];
  if (cur.habitPct !== null) {
    const d = delta(cur.habitPct, prev.habitPct);
    bits.push(`you hit ${cur.habitPct}% of your habits${d && d.dir !== "flat" ? ` (${d.dir === "up" ? "+" : ""}${d.diff} vs the ${range.days} days before)` : ""}`);
  }
  if (cur.balance !== null) bits.push(`your balance averaged ${cur.balance} out of 5`);
  if (cur.tasksDone) bits.push(`and you cleared ${cur.tasksDone} task${cur.tasksDone === 1 ? "" : "s"}`);
  return `Over the last ${range.days} days ${bits.join(", ")}.`;
}
