import { atDate, suite } from "./harness.mjs";
import {
  carryEnd, dailyRule, describeEnd, endModeOf, endProgress, isFinished, monthlyRule, newTask,
  occursOn, settleEnds, toggleDoneReducer, weeklyCountRule, weeklyRule,
} from "../src/lib/tasks.js";
import { mergeStates } from "../src/lib/merge.js";
import { emptyState } from "../src/lib/migrate.js";
import { missedYesterday, reviewHabits } from "../src/lib/habits.js";
import { srbaiDue } from "../src/lib/automaticity.js";
import { startSmallCheck } from "../src/lib/woop.js";
import { isLapsed } from "../src/lib/rewards.js";
import { buildNudges, DEFAULT_NOTIFY } from "../src/lib/nudges.js";

const t = suite("repeatEnds");

// Habits that stop: on a date, or after a number of completions. And "every N days" counted
// from a start date the person can now actually set.
const habit = (patch = {}, rec = dailyRule(1)) => newTask({
  id: "h1", kind: "build", text: "Stretch", startDate: "2026-09-01", recurrence: rec, ...patch,
});
const withEnd = (rec, end) => ({ ...rec, ...end });
const log = (dates, id = "h1") =>
  Object.fromEntries(dates.map((d) => [d, { [id]: { done: true, doneAt: 1 } }]));

t.group("ending on a date");
{
  const h = habit({}, withEnd(dailyRule(1), { endDate: "2026-09-10" }));
  t.ok("it still occurs on the last day", occursOn(h, "2026-09-10"));
  t.ok("...and not the day after", !occursOn(h, "2026-09-11"));
  t.ok("...nor long after", !occursOn(h, "2027-01-01"));
  t.ok("it occurs before the end as normal", occursOn(h, "2026-09-05"));
  t.ok("no end date means no end", occursOn(habit(), "2030-01-01"));
  t.ok("the end is a quota habit's too", !occursOn(habit({}, withEnd(weeklyCountRule(3), { endDate: "2026-09-10" })), "2026-09-11"));
  t.ok("...and a weekly one's", !occursOn(habit({}, withEnd(weeklyRule(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), { endDate: "2026-09-10" })), "2026-09-14"));
  t.ok("...and a monthly one's", !occursOn(habit({}, withEnd(monthlyRule(15), { endDate: "2026-09-10" })), "2026-09-15"));

  t.ok("not finished while the last day is still to come", !isFinished(h, "2026-09-10"));
  t.ok("finished the day after", isFinished(h, "2026-09-11"));
  t.ok("a paused habit isn't called finished", !isFinished({ ...h, archivedAt: 5 }, "2026-09-11"));
  t.ok("a one-off task is never 'finished' by this", !isFinished(newTask({ id: "x", dueDate: "2026-01-01" }), "2026-09-11"));
}

t.group("every N days, counted from the start date");
{
  // "Every 3 days" is the start date and every third day after it — which is why the start
  // date needs to be settable, and why a changed start moves every later day.
  const h = habit({ startDate: "2026-09-02" }, dailyRule(3));
  t.eq("the 2nd, 5th, 8th", ["2026-09-02", "2026-09-05", "2026-09-08"].map((d) => occursOn(h, d)), [true, true, true]);
  t.eq("the days between are free", ["2026-09-03", "2026-09-04", "2026-09-06"].map((d) => occursOn(h, d)), [false, false, false]);
  const moved = { ...h, startDate: "2026-09-03" };
  t.ok("moving the start moves the days: the 5th is now off", !occursOn(moved, "2026-09-05"));
  t.ok("...and the 6th is on", occursOn(moved, "2026-09-06"));
  t.ok("nothing before the start", !occursOn(h, "2026-09-01"));
  const bounded = habit({ startDate: "2026-09-02" }, withEnd(dailyRule(3), { endDate: "2026-09-08" }));
  t.ok("an end and an interval together: the last one lands on the 8th", occursOn(bounded, "2026-09-08"));
  t.ok("...and the 11th, which would have been next, doesn't", !occursOn(bounded, "2026-09-11"));
}

t.group("ending after N times");
{
  const h = habit({}, withEnd(dailyRule(1), { endAfter: 3 }));
  t.eq("mode is read from the rule", [endModeOf(h.recurrence), endModeOf(dailyRule(1)), endModeOf(withEnd(dailyRule(1), { endDate: "2026-10-01" }))], ["count", "never", "date"]);

  t.eq("nothing done: nothing stamped", settleEnds([h], {})[0].endedOn ?? null, null);
  t.eq("two of three: still going", settleEnds([h], log(["2026-09-01", "2026-09-02"]))[0].endedOn ?? null, null);
  const done3 = settleEnds([h], log(["2026-09-01", "2026-09-02", "2026-09-04"]))[0];
  t.eq("the third stamps the day it was done", done3.endedOn, "2026-09-04");
  t.ok("the last one's day still occurs", occursOn(done3, "2026-09-04"));
  t.ok("the next day does not", !occursOn(done3, "2026-09-05"));
  t.ok("a day earlier than the last still does, so history reads right", occursOn(done3, "2026-09-03"));

  // More than N done (say, backfilled): the Nth is what ends it, not the latest.
  const over = settleEnds([h], log(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]))[0];
  t.eq("extra ticks beyond N don't move the end", over.endedOn, "2026-09-03");

  t.eq("progress counts up", endProgress(h, log(["2026-09-01"])), { done: 1, of: 3, left: 2 });
  t.eq("...and stops at N", endProgress(h, log(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04"])), { done: 3, of: 3, left: 0 });
  t.eq("a habit with no count has no progress", endProgress(habit(), {}), null);

  t.ok("finished once stamped", isFinished(done3, "2026-09-04"));
  t.ok("not finished before", !isFinished(h, "2026-09-04"));
}

t.group("ticking drives it, and so does unticking");
{
  const h = habit({}, withEnd(dailyRule(1), { endAfter: 2 }));
  let tasks = [h], dayLog = {};
  ({ tasks, dayLog } = toggleDoneReducer(tasks[0], "2026-09-01", tasks, dayLog));
  t.ok("one tick doesn't end it", !tasks[0].endedOn);
  ({ tasks, dayLog } = toggleDoneReducer(tasks[0], "2026-09-02", tasks, dayLog));
  t.eq("the second does, on its own day", tasks[0].endedOn, "2026-09-02");
  ({ tasks, dayLog } = toggleDoneReducer(tasks[0], "2026-09-02", tasks, dayLog));
  t.ok("taking it back un-ends it", !tasks[0].endedOn);
  t.ok("...and it's due again the day after", occursOn(tasks[0], "2026-09-03"));
}

t.group("settleEnds is cheap when nothing changed");
{
  const tasks = [habit(), newTask({ id: "x", text: "one-off", dueDate: "2026-09-01" })];
  t.ok("returns the same array when no ending is in play", settleEnds(tasks, log(["2026-09-01"])) === tasks);
  const counted = [habit({}, withEnd(dailyRule(1), { endAfter: 5 }))];
  t.ok("...and when a count is in play but not reached", settleEnds(counted, log(["2026-09-01"])) === counted);
  const once = settleEnds([habit({}, withEnd(dailyRule(1), { endAfter: 1 }))], log(["2026-09-01"]));
  t.ok("...but a new array when it moves", once[0].endedOn === "2026-09-01");
  t.ok("...and the same again the second time", settleEnds(once, log(["2026-09-01"])) === once);
  t.ok("it leaves updatedAt alone, so two phones don't fight over it", !("updatedAt" in once[0]) || once[0].updatedAt === undefined);
}

t.group("editing the ending");
{
  // 7 done, "after 10": still going. Edit it to 5 and it has already finished — on the 5th.
  const dates = ["01", "02", "03", "04", "05", "06", "07"].map((d) => `2026-09-${d}`);
  const h = habit({}, withEnd(dailyRule(1), { endAfter: 10 }));
  t.ok("7 of 10 is still going", !settleEnds([h], log(dates))[0].endedOn);
  const lowered = settleEnds([{ ...h, recurrence: { ...h.recurrence, endAfter: 5 } }], log(dates))[0];
  t.eq("lowered to 5: it ended on the fifth done", lowered.endedOn, "2026-09-05");
  const raised = settleEnds([{ ...lowered, recurrence: { ...lowered.recurrence, endAfter: 12 } }], log(dates))[0];
  t.ok("raised again: it carries on — the stamp doesn't stick", !raised.endedOn);
  const dropped = settleEnds([{ ...lowered, recurrence: { ...lowered.recurrence, endAfter: null } }], log(dates))[0];
  t.ok("no ending at all: the stamp clears", !dropped.endedOn);
  const noRepeat = settleEnds([{ ...lowered, recurrence: null }], log(dates))[0];
  t.ok("no repeat at all: likewise", !noRepeat.endedOn);
}

t.group("changing the pattern keeps the ending");
{
  const from = withEnd(dailyRule(2), { endDate: "2026-10-31", endAfter: null });
  t.eq("weekly keeps it", carryEnd(weeklyRule(["mon"]), from).endDate, "2026-10-31");
  t.eq("a quota keeps it", carryEnd(weeklyCountRule(3), from).endDate, "2026-10-31");
  t.eq("monthly keeps it", carryEnd(monthlyRule(5), from).endDate, "2026-10-31");
  t.eq("a count carries too", carryEnd(dailyRule(1), { endAfter: 7 }).endAfter, 7);
  t.eq("coming from nothing, there's no ending", [carryEnd(dailyRule(1), null).endDate, carryEnd(dailyRule(1), null).endAfter], [null, null]);
  t.eq("a null rule stays null", carryEnd(null, from), null);
}

t.group("how it reads");
{
  atDate("2026-09-19T12:00:00", () => {
    t.eq("a date", describeEnd({ endDate: "2026-10-31" }), "Until Oct 31");
  });
  t.eq("a count", describeEnd({ endAfter: 10 }), "10 times");
  t.eq("once", describeEnd({ endAfter: 1 }), "Once");
  t.eq("nothing", describeEnd(dailyRule(1)), null);
  t.eq("no rule", describeEnd(null), null);
}

t.group("a merge across two phones");
{
  // Phone A did the last of a 3. Phone B hasn't synced and still has the habit running. The
  // merged state has to end it, whichever copy of the habit won.
  const h = habit({ updatedAt: 100 }, withEnd(dailyRule(1), { endAfter: 3 }));
  const a = { ...emptyState(), tasks: [{ ...h, updatedAt: 100 }], dayLog: log(["2026-09-01", "2026-09-02"]), savedAt: 10 };
  const b = { ...emptyState(), tasks: [{ ...h, updatedAt: 200 }], dayLog: log(["2026-09-03"]), savedAt: 20 };
  const merged = mergeStates(a, b);
  t.eq("the merged log has all three", Object.keys(merged.dayLog).length, 3);
  t.eq("so the habit has ended, on the third's day", merged.tasks.find((x) => x.id === "h1").endedOn, "2026-09-03");

  // And the other way round: one phone's copy carries a stamp that the merged log doesn't back.
  const stale = { ...emptyState(), tasks: [{ ...h, updatedAt: 300, endedOn: "2026-09-03" }], dayLog: log(["2026-09-01"]), savedAt: 30 };
  const other = { ...emptyState(), tasks: [{ ...h, updatedAt: 100 }], dayLog: log(["2026-09-02"]), savedAt: 5 };
  const m2 = mergeStates(stale, other);
  t.ok("a stamp the merged log doesn't support is dropped", !m2.tasks.find((x) => x.id === "h1").endedOn);
}

t.group("a finished habit stops asking things of you");
atDate("2026-09-20T09:00:00", () => {
  // Its last day was yesterday, and it went undone. There's no today for it.
  const ended = habit({ id: "e1", text: "Summer challenge", startDate: "2026-08-01" }, withEnd(dailyRule(1), { endDate: "2026-09-19" }));
  const live = habit({ id: "l1", text: "Stretch", startDate: "2026-08-01" });
  t.eq("it isn't offered as a miss to come back from", missedYesterday([ended, live], {}, {}).map((x) => x.id), ["l1"]);
  t.eq("...so no 'never miss twice' nudge names it",
    buildNudges({ tasks: [ended], dayLog: {}, settings: { notify: { ...DEFAULT_NOTIFY } } }, { days: 2, now: new Date("2026-09-20T05:00:00").getTime() })
      .filter((n) => n.kind === "comeback"), []);
  t.eq("a habit whose last day is today still counts as live", missedYesterday([{ ...ended, recurrence: { ...ended.recurrence, endDate: "2026-09-20" } }], {}, {}).map((x) => x.id), ["e1"]);

  const dates = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
  const richLog = log(dates, "e1");
  t.ok("it isn't asked 'how automatic is it now?'", !srbaiDue(ended, [], richLog, "2026-09-20"));
  t.ok("...though the same habit, still running, would be", srbaiDue({ ...ended, recurrence: dailyRule(1) }, [], richLog, "2026-09-20"));
  t.ok("it isn't given a verdict", !reviewHabits([ended], richLog).some((r) => (r.task || r).id === "e1"));
  t.eq("it doesn't count towards 'too many habits'",
    startSmallCheck({ tasks: [ended, ended, ended, ended].map((e, i) => ({ ...e, id: `e${i}`, startDate: "2026-09-10" })) }, "2026-09-20"), null);
  // Three scheduled days in the last four, none done — drifted, unless the habit has finished.
  const endedRecently = habit({ id: "e9", startDate: "2026-08-01" }, withEnd(dailyRule(1), { endDate: "2026-09-22" }));
  t.ok("a still-running habit left alone for days has drifted", isLapsed([{ ...endedRecently, recurrence: dailyRule(1) }], {}, "2026-09-24"));
  t.ok("...but one that has finished isn't something you've drifted from", !isLapsed([endedRecently], {}, "2026-09-24"));
});
