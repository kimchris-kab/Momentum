import { addDays, dstr, weekStartOf, weekdayKey } from "./date.js";
import { seeded } from "./seeded.js";
import { dayStats, isDone, tasksForDate } from "./tasks.js";
import { cleanDays, quits } from "./pep.js";
import { activeVirtue, stats as virtueStats, suggestNext } from "./virtue.js";
import { examenStats } from "./examen.js";
import { isCalm, owed } from "./temper.js";

// The week in review: what the app knows about the last seven days, said once, plainly. Built to be read in two minutes
// and to end on one thing to carry into next week — the choice, not the report, is what changes anything.

export const DEFAULT_WEEK = { on: true, day: 0, time: "19:00" };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const weekSettings = (settings) => {
  const s = settings?.week || {};
  return {
    on: s.on !== false,
    day: Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 ? s.day : DEFAULT_WEEK.day,
    time: HHMM.test(s.time) ? s.time : DEFAULT_WEEK.time,
  };
};

const pct = (x) => Math.round(x * 100);

/** The Monday a given date's week starts on, which is what a week's chosen focus is filed under. */
export const focusKey = (date) => weekStartOf(date);

/** The focus chosen for the week that contains `date`, or "". */
export const focusFor = (state, date) => state.weekFocus?.[focusKey(date)] || "";

/**
 * The report for the seven days ending on `today`. Every number is counted from the logs, nothing is estimated, and
 * the sentences only claim what the counts say.
 */
export function weekReport(state, today, now = Date.now()) {
  const from = addDays(today, -6);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const prevDates = dates.map((d) => addDays(d, -7));
  const inWeek = (d) => d >= from && d <= today;

  // Habits: every planned occurrence in the window, and each habit's own rate.
  const days = dates.map((d) => dayStats(state.tasks || [], d, state.dayLog || {}));
  const total = days.reduce((a, d) => a + d.total, 0);
  const done = days.reduce((a, d) => a + d.done, 0);
  const per = (state.tasks || []).filter((t) => t.kind === "build" && !t.archivedAt).map((task) => {
    let planned = 0; let got = 0;
    dates.forEach((d) => {
      if (tasksForDate([task], d, "build").length) { planned += 1; if (isDone(task, d, state.dayLog || {})) got += 1; }
    });
    return { task, planned, done: got, ratio: planned ? got / planned : null };
  }).filter((r) => r.planned >= 2);
  const best = per.length ? per.reduce((a, r) => (r.ratio > a.ratio ? r : a)) : null;
  const worst = per.length ? per.reduce((a, r) => (r.ratio < a.ratio ? r : a)) : null;

  // Habits being quit.
  const urges = (state.urgeLog || []).filter((r) => inWeek(r.date));
  const quitting = quits(state.tasks).map((task) => {
    const mine = urges.filter((r) => r.taskId === task.id);
    return {
      task, clean: cleanDays(task, state.urgeLog || [], now),
      slips: mine.filter((r) => r.kind === "lapse").length,
      rodeOut: mine.filter((r) => r.kind === "urge" && r.outcome === "rode-out").length,
      gaveIn: mine.filter((r) => r.kind === "urge" && r.outcome === "gave-in").length,
    };
  });

  // Character.
  const v = activeVirtue(state);
  const vs = v ? virtueStats(state, v.id, today) : null;
  const virtue = v ? {
    id: v.id, name: v.name, answered: vs.week.filter((d) => d.score !== null).length,
    lived: vs.week.filter((d) => d.score === 2).length, streak: vs.streak,
  } : null;
  const ex = examenStats(state, today);
  const wells = (state.examenLog || []).filter((e) => inWeek(e.date) && e.well);
  const quote = wells.length ? wells[Math.floor(seeded(`week:${from}`)() * wells.length)].well : null;
  const log = state.temperLog || [];
  const bad = log.filter((e) => !isCalm(e));
  const thisWeek = bad.filter((e) => inWeek(e.date)).length;
  const lastWeek = bad.filter((e) => prevDates.includes(e.date)).length;
  const calm = log.filter((e) => isCalm(e) && inWeek(e.date)).length;
  const repaired = bad.filter((e) => inWeek(e.date) && e.repair?.status === "done").length;
  const owing = owed(log);
  const lettersRead = (state.letters || []).filter((l) => l.openedAt && dstr(new Date(l.openedAt)) >= from && dstr(new Date(l.openedAt)) <= today).length;

  const report = {
    from, to: today,
    habits: { done, total, ratio: total ? done / total : null, best, worst },
    quitting, virtue, examen: { nights: ex.nights, quote },
    temper: { thisWeek, lastWeek, calm, repaired, owing: owing.length, owedTo: owing[0]?.who || "" },
    lettersRead,
    focus: focusFor(state, today),
    nextWeekStart: addDays(weekStartOf(today), 7),
  };
  report.highlights = highlights(report);
  report.suggestion = suggestion(report, state, today);
  return report;
}

function highlights(r) {
  const out = [];
  if (r.habits.total >= 3 && r.habits.ratio >= 0.7) out.push(`You did ${r.habits.done} of ${r.habits.total} planned habits (${pct(r.habits.ratio)}%).`);
  r.quitting.filter((q) => q.slips === 0).forEach((q) => out.push(`No slips on ${q.task.text}: ${q.clean} day${q.clean === 1 ? "" : "s"} clean.`));
  const rode = r.quitting.reduce((a, q) => a + q.rodeOut, 0);
  if (rode > 0) out.push(`You rode out ${rode} urge${rode === 1 ? "" : "s"}.`);
  if (r.virtue && r.virtue.lived >= 4) out.push(`You lived ${r.virtue.name.toLowerCase()} on ${r.virtue.lived} of 7 days.`);
  if (r.examen.quote) out.push(`You wrote: “${r.examen.quote}”`);
  if (r.examen.nights >= 4) out.push(`${r.examen.nights} evening examens this week.`);
  if (r.temper.lastWeek > r.temper.thisWeek) out.push(`Fewer lost-temper moments than last week: ${r.temper.thisWeek}, against ${r.temper.lastWeek}.`);
  if (r.temper.repaired > 0) out.push(`You made it right ${r.temper.repaired} time${r.temper.repaired === 1 ? "" : "s"}.`);
  return out.slice(0, 5);
}

/** The one thing most worth carrying into next week, with a reason, in a fixed order of importance. */
function suggestion(r, state, today) {
  const slipped = r.quitting.filter((q) => q.slips > 0).sort((a, b) => b.slips - a.slips)[0];
  if (slipped) {
    return { kind: "quit", text: `${slipped.task.text}: ${slipped.slips} slip${slipped.slips === 1 ? "" : "s"} this week. Pick the hour it happens and give it a red zone, with a plan for that hour.`, taskId: slipped.task.id };
  }
  if (r.temper.owing > 0) {
    return { kind: "repair", text: `${r.temper.owedTo ? `You still owe ${r.temper.owedTo} a repair.` : "A repair is still open."} Send the short message tomorrow morning.` };
  }
  if (r.habits.worst && r.habits.worst.ratio < 0.5) {
    return { kind: "habit", text: `${r.habits.worst.task.text}: ${r.habits.worst.done} of ${r.habits.worst.planned}. Make it smaller: the two-minute version still counts.`, taskId: r.habits.worst.task.id };
  }
  if (r.virtue && r.virtue.answered < 4) {
    return { kind: "answer", text: `${r.virtue.name}: you answered ${r.virtue.answered} of 7 evenings. The question is one tap. Answering is the practice.` };
  }
  const next = suggestNext(state, today);
  return { kind: "virtue", text: `${next.reason} Worth a week of ${next.name.toLowerCase()}?`, virtue: next.id };
}

/** The review as text to copy or share. */
export function reviewText(r, prettyDate = (d) => d) {
  const lines = [`My week, ${prettyDate(r.from)} to ${prettyDate(r.to)}`, ""];
  if (r.highlights.length) lines.push(...r.highlights.map((h) => `• ${h}`), "");
  lines.push(`Next: ${r.suggestion.text}`);
  if (r.focus) lines.push(`This week's focus: ${r.focus}`);
  return lines.join("\n");
}

/** Sunday evening, or whichever day was chosen: one notification, not sent to anyone who has not started with Character. */
export function weekNudges(state, { days = 7, now = Date.now() } = {}) {
  const cfg = weekSettings(state.settings);
  if (!cfg.on) return [];
  const out = [];
  const start = dstr(new Date(now));
  // One day further than the rest: opened on the evening of the review, the next one is a full week away, which is
  // exactly one day past the horizon everything else is planned over.
  for (let i = 0; i <= days; i++) {
    const date = addDays(start, i);
    if (weekdayKey(date) !== ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][cfg.day]) continue;
    const at = new Date(`${date}T${cfg.time}:00`);
    if (at.getTime() <= now) continue;
    out.push({
      id: `week:${date}`, kind: "week", date, at,
      title: "Your week in review",
      body: "What went well, where you slipped, and the one thing to carry into next week. Two minutes.",
      actions: [{ id: "open", title: "Open" }],
    });
  }
  return out;
}

/** Is it the review's day and past its time, with no focus chosen yet for the week ahead? Then Today should say so. */
export function reviewReady(state, now = new Date()) {
  const cfg = weekSettings(state.settings);
  if (!cfg.on || now.getDay() !== cfg.day) return false;
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = dstr(now);
  return hhmm >= cfg.time && !state.weekFocus?.[addDays(weekStartOf(today), 7)];
}
