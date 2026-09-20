import { atDate, suite } from "./harness.mjs";
import {
  FREEZES_PER_MONTH, MILESTONES, WEEK_MILESTONES, atRiskToday, dayOutcome, freezesLeft,
  habitReliability, habitStreakProtected, isMilestoneFor, milestonesFor, missedYesterday,
  nextMilestoneFor, protectedStreak, quotaAtRisk, reviewDue, reviewHabits, rewardProgress,
  scopeCheck,
} from "../src/lib/habits.js";
import { newTask, weeklyCountRule, weeklyRule } from "../src/lib/tasks.js";

const t = suite("habits");

const TODAY = "2026-09-19T12:00:00";
const MON = "2026-09-14", TUE = "2026-09-15", WED = "2026-09-16";
const THU = "2026-09-17", FRI = "2026-09-18", SAT = "2026-09-19";

const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const habit = (patch) => newTask({
  id: "h1", kind: "build", text: "Walk", startDate: "2026-01-01",
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const log = (dates, id = "h1") =>
  Object.fromEntries(dates.map((d) => [d, { [id]: { done: true, doneAt: 1 } }]));
const range = (from, count) => {
  const out = [];
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < count; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return out;
};

t.group("milestones");
{
  const daily = habit();
  const quota = habit({ recurrence: weeklyCountRule(3) });
  t.eq("a daily habit counts days", milestonesFor(daily), MILESTONES);
  // A quota streak counts weeks, so a day-scale milestone would be nonsense on it.
  t.eq("a quota habit counts weeks", milestonesFor(quota), WEEK_MILESTONES);
  t.eq("the next one up", nextMilestoneFor(daily, 8), 21);
  t.eq("...for a quota habit", nextMilestoneFor(quota, 5), 12);
  t.eq("nothing left above the last one", nextMilestoneFor(daily, 400), null);
  t.ok("landing exactly on one", isMilestoneFor(daily, 66) && !isMilestoneFor(daily, 67));
  t.ok("a quota habit's 7 isn't a milestone", !isMilestoneFor(quota, 7) && isMilestoneFor(quota, 12));
}

t.group("freezes");
{
  const used = { "2026-09-03": true, "2026-09-11": true, "2026-08-02": true };
  t.eq("two a month", FREEZES_PER_MONTH, 2);
  t.eq("both spent this month", freezesLeft(used, SAT), 0);
  t.eq("last month's don't carry over", freezesLeft({ "2026-08-02": true }, SAT), 2);
  t.eq("a clean month", freezesLeft({}, SAT), 2);
}

t.group("a day's outcome");
{
  const h = habit();
  const mondayOnly = habit({ recurrence: weeklyRule(["mon"]) });
  t.eq("nothing scheduled", dayOutcome([mondayOnly], FRI, {}, {}, "build"), "empty");
  t.eq("all kept", dayOutcome([h], FRI, log([FRI]), {}, "build"), "complete");
  t.eq("missed", dayOutcome([h], FRI, {}, {}, "build"), "missed");
  t.eq("missed but frozen", dayOutcome([h], FRI, {}, { [FRI]: true }, "build"), "frozen");
  // A day nothing was scheduled on can't be "missed", so a freeze on it is wasted — the
  // empty check comes first deliberately.
  t.eq("an empty day isn't rescued by a freeze",
    dayOutcome([mondayOnly], FRI, {}, { [FRI]: true }, "build"), "empty");
}

t.group("protected streaks");
atDate(TODAY, () => {
  const h = habit();
  t.eq("a clean run", protectedStreak([h], log([WED, THU, FRI, SAT]), {}, "build"), 4);
  t.eq("today still open doesn't break it", protectedStreak([h], log([WED, THU, FRI]), {}, "build"), 3);
  t.eq("a missed day does", protectedStreak([h], log([WED, FRI]), {}, "build"), 1);
  t.eq("unless it was frozen — a frozen day is neutral, not a free win",
    protectedStreak([h], log([WED, FRI]), { [THU]: true }, "build"), 2);

  t.eq("one habit's own streak", habitStreakProtected(h, log([THU, FRI]), {}), 2);
  t.eq("...survives a frozen gap", habitStreakProtected(h, log([WED, FRI]), { [THU]: true }), 2);
  t.eq("...and a one-off has none", habitStreakProtected(newTask({ id: "x" }), {}, {}), 0);
});

t.group("what needs attention");
atDate(TODAY, () => {
  const h = habit();
  const quota = habit({ id: "q1", recurrence: weeklyCountRule(2) });
  t.eq("missed yesterday", missedYesterday([h], {}, {}).map((x) => x.id), ["h1"]);
  t.eq("...not if it was done", missedYesterday([h], log([FRI]), {}).length, 0);
  t.eq("...and never if yesterday was frozen", missedYesterday([h], {}, { [FRI]: true }).length, 0);
  // Skipping a quota habit yesterday may well have been the plan, so it isn't a miss.
  t.eq("a quota habit is never 'missed yesterday'", missedYesterday([quota], {}, {}).length, 0);

  t.eq("at risk today", atRiskToday([h], {}).map((x) => x.id), ["h1"]);
  t.eq("...not once done", atRiskToday([h], log([SAT])).length, 0);
  t.eq("a quota habit that's already met its week isn't at risk",
    atRiskToday([quota], log([MON, WED], "q1")).length, 0);

  // Saturday is day six of seven, so a 2× week with nothing done has two days left and
  // needs both: that is the moment to say something.
  t.eq("a quota week that now needs every remaining day",
    quotaAtRisk([quota], {}, SAT).map((x) => x.task.id), ["q1"]);
  t.eq("...but not while there's still slack",
    quotaAtRisk([habit({ id: "q2", recurrence: weeklyCountRule(1) })], {}, SAT).length, 0);
  t.eq("...and not on Monday, when the whole week is ahead", quotaAtRisk([quota], {}, MON).length, 0);
});

t.group("reliability over a window");
atDate(TODAY, () => {
  const h = habit(); // every day
  const fourteen = range("2026-09-06", 14);
  t.eq("a daily habit counts days scheduled",
    habitReliability(h, log(fourteen), 14), { done: 14, scheduled: 14, pct: 100 });
  t.eq("half of them", habitReliability(h, log(fourteen.slice(0, 7)), 14).pct, 50);

  const thrice = habit({ id: "q1", recurrence: weeklyRule(["mon", "wed", "fri"]) });
  t.eq("only the days it was actually scheduled on",
    habitReliability(thrice, log([MON, WED, FRI], "q1"), 7), { done: 3, scheduled: 3, pct: 100 });

  // The bug this exists to fix: a quota habit's denominator is what it asked for, not the
  // seven days a week it technically appears on.
  const quota = habit({ id: "q2", recurrence: weeklyCountRule(3) });
  t.eq("a kept quota habit reads as kept",
    habitReliability(quota, log([MON, WED, FRI], "q2"), 7), { done: 3, scheduled: 3, pct: 100 });
  t.eq("...and a half-kept one as half",
    habitReliability(quota, log([MON], "q2"), 7).pct, 33);
  t.eq("nothing scheduled gives no percentage rather than a zero",
    habitReliability(habit({ recurrence: weeklyRule([]) }), {}, 7).pct, null);
});

t.group("the weekly review");
atDate(TODAY, () => {
  const days = range("2026-08-24", 27);
  const mk = (id, keptDays) => ({
    task: habit({ id, text: id }),
    log: Object.fromEntries(keptDays.map((d) => [d, { [id]: { done: true } }])),
  });
  const rows = [
    mk("great", days),                      // 100%
    mk("ok", days.slice(0, 18)),            // ~66%
    mk("poor", days.slice(0, 10)),          // ~37%
    mk("dead", days.slice(0, 2)),           // ~7%
  ];
  const tasks = rows.map((r) => r.task);
  const dayLog = rows.reduce((acc, r) => {
    Object.entries(r.log).forEach(([d, v]) => { acc[d] = { ...(acc[d] || {}), ...v }; });
    return acc;
  }, {});

  const review = reviewHabits(tasks, dayLog, 28);
  t.eq("verdicts", review.map((r) => `${r.task.id}:${r.verdict}`),
    ["dead:stalled", "poor:slipping", "ok:holding", "great:thriving"]);
  t.eq("worst first, so the review opens on what needs the work", review[0].task.id, "dead");

  const tooNew = reviewHabits([habit({ id: "n", startDate: FRI })], {}, 28);
  t.eq("a habit with almost no history is 'too new', not a failure", tooNew[0].verdict, "new");
  t.eq("archived habits aren't reviewed",
    reviewHabits([habit({ archivedAt: 1 })], {}, 28).length, 0);
  t.eq("nor are one-offs", reviewHabits([newTask({ id: "o" })], {}, 28).length, 0);
});

t.group("how many habits is too many");
atDate(TODAY, () => {
  const days = range("2026-08-24", 27);
  const build = (specs) => {
    const tasks = [];
    const dayLog = {};
    specs.forEach(([id, keptCount]) => {
      tasks.push(habit({ id, text: id }));
      days.slice(0, keptCount).forEach((d) => {
        dayLog[d] = { ...(dayLog[d] || {}), [id]: { done: true } };
      });
    });
    return { tasks, dayLog };
  };

  // Fewer than five habits and there's nothing to say, so the app says nothing.
  const few = build([["a", 27], ["b", 2]]);
  t.eq("too few habits to claim anything", scopeCheck(few.tasks, few.dayLog, 28), null);

  const even = build([["a", 24], ["b", 23], ["c", 22], ["d", 21], ["e", 20], ["f", 19]]);
  t.eq("no split worth showing when they're all much the same", scopeCheck(even.tasks, even.dayLog, 28), null);

  const split = build([["a", 27], ["b", 26], ["c", 25], ["d", 6], ["e", 4], ["f", 2]]);
  const check = scopeCheck(split.tasks, split.dayLog, 28);
  t.ok("a real split is reported", !!check);
  t.ok("...with both halves and their averages",
    check.top.length === 3 && check.bottom.length === 3 && check.topAvg > check.bottomAvg + 30,
    check && { topAvg: check.topAvg, bottomAvg: check.bottomAvg });

  // The weaker half has to actually be struggling — a spread between "great" and "good"
  // is not evidence of overload.
  const highBoth = build([["a", 27], ["b", 27], ["c", 27], ["d", 20], ["e", 19], ["f", 18]]);
  t.eq("no claim when even the weaker half is doing fine", scopeCheck(highBoth.tasks, highBoth.dayLog, 28), null);
});

t.group("rewards and review timing");
atDate(TODAY, () => {
  const withReward = habit({ reward: { text: "New boots", atDays: 30 } });
  t.eq("counting down to a reward", rewardProgress(withReward, 22).remaining, 8);
  t.ok("ready once the streak arrives", rewardProgress(withReward, 30).ready);
  t.ok("not ready twice", !rewardProgress(
    habit({ reward: { text: "Boots", atDays: 30, claimedAt: 1 } }), 30).ready);
  t.eq("no reward, nothing to report", rewardProgress(habit(), 30), null);

  t.ok("a first review is always due", reviewDue([]));
  t.ok("...and not again the next day", !reviewDue([{ date: FRI }]));
  t.ok("...but is a week later", reviewDue([{ date: "2026-09-12" }]));
});
