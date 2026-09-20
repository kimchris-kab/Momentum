import { atDate, suite } from "./harness.mjs";
import {
  SPANS, balanceOf, blockerImpact, buildFindings, delta, eachDay, earliestDate,
  energizerImpact, habitMoodLink, habitTrends, metricsFor, moodCounts, periodRange,
  pillarMovement, weekdayPattern,
} from "../src/lib/insights.js";
import { newTask, weeklyCountRule, weeklyRule } from "../src/lib/tasks.js";

const t = suite("insights");

const TODAY = "2026-09-19";
const CLOCK = `${TODAY}T12:00:00`;
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const habit = (patch) => newTask({
  id: "h1", kind: "build", text: "Walk", startDate: "2026-01-01",
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const days = (from, n) => {
  const out = [];
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < n; i++) { out.push(d.toISOString().slice(0, 10)); d.setDate(d.getDate() + 1); }
  return out;
};
const log = (dates, id = "h1") =>
  Object.fromEntries(dates.map((d) => [d, { [id]: { done: true, doneAt: 1 } }]));
const state = (patch) => ({
  tasks: [], dayLog: {}, checkins: [], journalEntries: [], transactions: [],
  milestones: [], freezes: {}, focusSessions: [], ...patch,
});
const checkin = (date, patch) => ({
  date, feel: 3, recharge: 3, scores: { health: 3, growth: 3 }, energizers: [], blockers: [], ...patch,
});

t.group("windows");
atDate(CLOCK, () => {
  const r = periodRange(state(), "week");
  t.eq("seven days ending today", [r.from, r.to, r.days], ["2026-09-13", TODAY, 7]);
  // Every headline number is shown as a change, so the window before it has to be the same
  // length and sit immediately behind.
  t.eq("with an equal window behind it", [r.prevFrom, r.prevTo], ["2026-09-06", "2026-09-12"]);
  t.eq("a month", periodRange(state(), "month").days, 30);
  t.eq("'all' runs from the first thing you ever logged",
    periodRange(state({ checkins: [checkin("2026-09-10")] }), "all").from, "2026-09-10");
  t.eq("a new user's 'all' is today", periodRange(state(), "all").from, TODAY);
  t.eq("the spans on offer", SPANS.map((s) => s.id), ["week", "month", "quarter", "all"]);
  t.eq("days in a range", eachDay("2026-09-17", "2026-09-19").length, 3);
  t.eq("the earliest thing across every kind of record",
    earliestDate(state({ checkins: [checkin("2026-09-10")], transactions: [{ date: "2026-08-01" }] })), "2026-08-01");
});

t.group("headline metrics");
atDate(CLOCK, () => {
  const week = days("2026-09-13", 7);
  const s = state({
    tasks: [habit(), habit({ id: "h2", kind: "break", text: "No scrolling" })],
    dayLog: {
      ...log(week.slice(0, 5)),
      ...Object.fromEntries(week.slice(0, 3).map((d) => [d, { h1: { done: true }, h2: { done: true } }])),
    },
    checkins: [checkin(week[0], { feel: 4 }), checkin(week[1], { feel: 2 }), checkin(week[2], { feel: 3 })],
    journalEntries: [{ date: week[0] }],
    transactions: [
      { type: "income", amount: 1000, date: week[0] },
      { type: "expense", amount: 200, catId: "saving", date: week[1] },
    ],
  });
  const m = metricsFor(s, "2026-09-13", TODAY);
  t.eq("habits done out of scheduled", [m.habitDone, m.habitScheduled], [5, 7]);
  t.eq("...as a percentage", m.habitPct, 71);
  t.eq("break habits are counted separately", m.breakPct, 43);
  t.eq("clean sweeps", m.perfectDays, 5);
  t.eq("days something was scheduled", m.scheduledDays, 7);
  t.eq("check-ins logged", m.logged, 3);
  t.eq("how it felt, on average", m.feel, 3);
  t.eq("journal entries", m.journalCount, 1);
  t.eq("savings rate", m.savingsRate, 20);
  t.eq("no income means no rate rather than a zero", metricsFor(state(), "2026-09-13", TODAY).savingsRate, null);
  t.eq("nothing scheduled means no percentage", metricsFor(state(), "2026-09-13", TODAY).habitPct, null);

  // A quota habit is available every day but only asks for its target, so counting it as
  // scheduled seven times a week would drag every headline down.
  const quota = state({ tasks: [habit({ recurrence: weeklyCountRule(3) })], dayLog: log(week.slice(0, 3)) });
  t.eq("a kept quota habit reads as kept", metricsFor(quota, "2026-09-13", TODAY).habitPct, 100);
});

t.group("change against the window before");
{
  t.eq("up", delta(70, 50), { diff: 20, dir: "up" });
  t.eq("down", delta(50, 70), { diff: -20, dir: "down" });
  t.eq("unchanged", delta(50, 50), { diff: 0, dir: "flat" });
  // Nothing to compare against isn't a change of zero, it's no answer.
  t.eq("nothing to compare against", delta(50, null), null);
  t.eq("no current value either", delta(null, 50), null);
}

t.group("the weekday pattern");
atDate(CLOCK, () => {
  const fourWeeks = days("2026-08-24", 28);
  // Kept on every day except Tuesdays.
  const kept = fourWeeks.filter((d) => new Date(`${d}T00:00:00`).getDay() !== 2);
  const pattern = weekdayPattern([habit()], log(kept), "2026-08-24", "2026-09-20");
  const tue = pattern.find((d) => d.key === "tue");
  const wed = pattern.find((d) => d.key === "wed");
  t.eq("the weak day is visible", [tue.pct, wed.pct], [0, 100]);
  t.eq("every weekday is represented", pattern.length, 7);
  t.eq("...with its own denominator", tue.scheduled, 4);
});

t.group("what moves a day");
{
  // Three of each is the floor: below that the honest answer is silence, not a pattern
  // reverse-engineered from noise.
  const few = [
    checkin("2026-09-01", { energizers: ["play"], scores: { health: 5 } }),
    checkin("2026-09-02", { scores: { health: 2 } }),
  ];
  t.eq("two days is not a finding", energizerImpact(few).length, 0);

  const many = [
    ...days("2026-09-01", 3).map((d) => checkin(d, { energizers: ["play"], scores: { health: 5, growth: 5 } })),
    ...days("2026-09-04", 3).map((d) => checkin(d, { scores: { health: 2, growth: 2 } })),
  ];
  const lift = energizerImpact(many)[0];
  t.eq("a real split is reported, biggest lift first", lift.id, "play");
  t.eq("...with both averages and the gap", [lift.with, lift.without, lift.lift], [5, 2, 3]);

  const blocked = [
    ...days("2026-09-01", 3).map((d) => checkin(d, { blockers: ["fear"], scores: { health: 2, growth: 2 } })),
    ...days("2026-09-04", 3).map((d) => checkin(d, { scores: { health: 4, growth: 4 } })),
  ];
  t.eq("blockers are reported by how much they cost", blockerImpact(blocked)[0].lift, -2);
  t.eq("balance is the mean across the pillars you scored", balanceOf(checkin("x", { scores: { health: 4, growth: 2 } })), 3);
  t.eq("an unscored check-in has no balance", balanceOf({ scores: {} }), null);
}

t.group("habits against mood");
atDate(CLOCK, () => {
  const window = days("2026-09-01", 8);
  const s = state({
    tasks: [habit()],
    dayLog: log(window.slice(0, 4)),
    checkins: [
      ...window.slice(0, 4).map((d) => checkin(d, { feel: 4 })),
      ...window.slice(4).map((d) => checkin(d, { feel: 2 })),
    ],
  });
  const link = habitMoodLink(s, "2026-09-01", "2026-09-08");
  t.eq("finished days against unfinished ones", [link.full, link.partial, link.lift], [4, 2, 2]);
  t.eq("too few of either and it says nothing",
    habitMoodLink(state({ tasks: [habit()], dayLog: {}, checkins: [checkin("2026-09-01")] }),
      "2026-09-01", "2026-09-08"), null);
});

t.group("per-habit trends");
atDate(CLOCK, () => {
  const s = state({
    tasks: [habit(), habit({ id: "h2", text: "Read" }), habit({ id: "h3", archivedAt: 1 })],
    dayLog: {
      ...Object.fromEntries(days("2026-09-13", 7).map((d) => [d, { h1: { done: true } }])),
      ...Object.fromEntries(days("2026-09-06", 3).map((d) => [d, { h2: { done: true } }])),
    },
  });
  const trends = habitTrends(s, "2026-09-13", TODAY, "2026-09-06", "2026-09-12");
  t.eq("best first", trends.map((h) => h.id), ["h1", "h2"]);
  t.eq("this window", trends[0].pct, 100);
  t.eq("...against the one before", trends[0].prevPct, 0);
  t.eq("...as a change", trends[0].change, 100);
  t.eq("a habit that has slipped shows the fall", trends[1].change, -43);
  t.ok("archived habits are left out", !trends.some((h) => h.id === "h3"));
});

t.group("findings");
atDate(CLOCK, () => {
  // The evidence gate: a handful of days is not a pattern, and saying nothing is the
  // honest answer rather than a sentence dressed up as insight.
  t.eq("a new user is told nothing",
    buildFindings(state({ tasks: [habit()] }),
      { from: "2026-09-13", to: TODAY, prevFrom: "2026-09-06", prevTo: "2026-09-12" }).length, 0);

  const window = days("2026-08-24", 27);
  const s = state({
    tasks: [habit()],
    dayLog: log(window),
    checkins: window.map((d, i) => checkin(d, {
      feel: i % 2 ? 4 : 3,
      energizers: i % 2 ? ["play"] : [],
      scores: { health: i % 2 ? 5 : 2, growth: 3 },
    })),
  });
  const findings = buildFindings(s, { from: "2026-08-24", to: "2026-09-19", prevFrom: "2026-07-28", prevTo: "2026-08-23" });
  t.ok("a real body of evidence produces findings", findings.length > 0);
  t.ok("each one carries its numbers, not just a verdict",
    findings.every((f) => /\d/.test(f.text) && f.label && f.tone));
  t.ok("perfect days are noticed", findings.some((f) => /clean sweep/i.test(f.text)));
});

t.group("moods");
{
  const entries = [
    { date: "2026-09-01", moods: ["calm", "tired"] },
    { date: "2026-09-02", moods: ["calm"] },
    { date: "2026-08-01", moods: ["calm"] },
  ];
  const counts = moodCounts(entries, "2026-09-01", "2026-09-30");
  t.eq("counted inside the window only", counts[0].count, 2);
  t.ok("most common first", counts[0].count >= (counts[1]?.count ?? 0));
  t.ok("moods never used aren't listed", counts.every((m) => m.count > 0));
}

t.group("pillar movement");
{
  const move = pillarMovement(
    [checkin("2026-09-15", { scores: { health: 4 } }), checkin("2026-09-08", { scores: { health: 2 } })],
    "2026-09-13", "2026-09-19", "2026-09-06", "2026-09-12");
  const health = move.find((p) => p.id === "health");
  t.eq("this window against the last", [health.value, health.prev], [4, 2]);
  t.eq("...as a change", health.change, { diff: 2, dir: "up" });
  t.eq("a pillar never scored has nothing to say", move.find((p) => p.id === "deeds").change, null);
}
