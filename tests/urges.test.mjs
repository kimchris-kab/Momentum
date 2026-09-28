import { atDate, suite } from "./harness.mjs";
import {
  CALM_PROMPTS, FEELINGS, URGE_MINUTES, calmNoteParts, cleanRecord, dayState, fmtSince, hasCalmNote,
  isSlipped, knownTriggers, lapsesOn, lastSlipAt, limitOf, newLapse, newUrge, promptAfter, reclaimed,
  reconcileSlips, slip, syncSlip, unslip, urgeTally, withCalmNote,
} from "../src/lib/urges.js";
import { isDone, toggleDoneReducer } from "../src/lib/tasks.js";
import { mergeDayLog, mergeStates } from "../src/lib/merge.js";
import { emptyState } from "../src/lib/migrate.js";

const t = suite("urges");

const TODAY = "2026-09-28";
const CLOCK = `${TODAY}T21:00:00`;
const quit = (patch = {}) => ({
  id: "q1", kind: "break", text: "Doomscrolling", recurrence: { freq: "daily", interval: 1 },
  startDate: "2026-09-01", createdAt: 1, trigger: "Boredom or waiting", ...patch,
});

t.group("three states, not two");
{
  // The defect this exists for: a slip and a day the app wasn't opened were the same record.
  const task = quit();
  t.eq("an untouched day is open, not failed", dayState(task, TODAY, {}), "open");
  t.eq("a ticked day is clean", dayState(task, TODAY, { [TODAY]: { q1: { done: true, doneAt: 1 } } }), "clean");

  const slipped = slip({}, "q1", TODAY, 500);
  t.eq("a slipped day is slipped", dayState(task, TODAY, slipped), "slipped");
  t.ok("...which the rest of the app reads as not clean, without learning anything new",
    !isDone(task, TODAY, slipped));
  t.ok("...and can ask about directly", isSlipped(task, TODAY, slipped));

  // Clean at 8pm, slipped at 11pm: the day was not clean.
  const cleanFirst = { [TODAY]: { q1: { done: true, doneAt: 100 } } };
  t.eq("a slip replaces a clean tick", dayState(task, TODAY, slip(cleanFirst, "q1", TODAY, 900)), "slipped");

  const twice = slip(slip({}, "q1", TODAY, 100), "q1", TODAY, 900);
  t.eq("the first slip of the day is the one that stands", twice[TODAY].q1.at, 100);

  t.eq("undo takes it back to open", dayState(task, TODAY, unslip(slipped, "q1", TODAY)), "open");
  t.eq("...and undoing nothing changes nothing", unslip({}, "q1", TODAY), {});
  t.ok("other habits on the same day are left alone",
    slip({ [TODAY]: { other: { done: true } } }, "q1", TODAY)[TODAY].other.done);
}

t.group("a tick can't quietly rewrite a slip");
{
  const task = quit();
  const slipped = slip({}, "q1", TODAY, 500);
  const after = toggleDoneReducer(task, TODAY, [task], slipped);
  // One mis-tap on the row would otherwise erase the only honest record of the day.
  t.eq("tapping a slipped day's checkbox leaves it slipped", dayState(task, TODAY, after.dayLog), "slipped");
  t.ok("an open day still ticks clean as before",
    isDone(task, TODAY, toggleDoneReducer(task, TODAY, [task], {}).dayLog));
}

t.group("two phones, one bad evening");
{
  // Ticked clean on the phone in the morning, slipped on the tablet at night.
  const phone = { [TODAY]: { q1: { done: true, doneAt: 100 } } };
  const tablet = { [TODAY]: { q1: { done: false, slipped: true, at: 900 } } };
  t.eq("a slip beats a clean tick in a merge", mergeDayLog(phone, tablet)[TODAY].q1.slipped, true);
  t.eq("...whichever side it came from", mergeDayLog(tablet, phone)[TODAY].q1.slipped, true);
  t.eq("between two slips, the earlier stands",
    mergeDayLog({ [TODAY]: { q1: { slipped: true, at: 900 } } }, { [TODAY]: { q1: { slipped: true, at: 300 } } })[TODAY].q1.at,
    300);

  const urgeA = newUrge({ taskId: "q1", at: 1000, seconds: 600 });
  const urgeB = newUrge({ taskId: "q1", at: 2000, seconds: 300 });
  const merged = mergeStates(
    { ...emptyState(), savedAt: 5, urgeLog: [urgeA] },
    { ...emptyState(), savedAt: 4, urgeLog: [urgeB] },
  );
  t.eq("urges ridden out on either device all survive a merge", merged.urgeLog.length, 2);
  const buried = mergeStates(
    { ...emptyState(), savedAt: 5, urgeLog: [], graveyard: { [urgeA.id]: Date.now() } },
    { ...emptyState(), savedAt: 4, urgeLog: [urgeA] },
  );
  t.eq("...and an undone one doesn't come back", buried.urgeLog.length, 0);
  t.eq("a fresh state starts with an empty log", emptyState().urgeLog, []);
}

t.group("what gets recorded");
atDate(CLOCK, () => {
  const u = newUrge({ taskId: "q1", seconds: 612.7 });
  t.eq("an urge is an urge", u.kind, "urge");
  t.eq("...ridden out unless it says otherwise", u.outcome, "rode-out");
  t.eq("...with the time it took, in whole seconds", u.seconds, 613);
  t.eq("...dated to the day it happened", u.date, TODAY);
  t.eq("giving in is recorded as giving in", newUrge({ taskId: "q1", outcome: "gave-in" }).outcome, "gave-in");
  t.ok("two urges in the same instant still get their own ids",
    newUrge({ taskId: "q1", at: 1 }).id !== newUrge({ taskId: "q1", at: 1 }).id);

  const l = newLapse({ taskId: "q1", trigger: "  Waiting for the bus ", feeling: "bored", place: "" });
  t.eq("a lapse is a lapse", l.kind, "lapse");
  t.eq("...with its trigger, trimmed", l.trigger, "Waiting for the bus");
  t.eq("...and the feeling", l.feeling, "bored");
  t.eq("...and nothing invented where nothing was given", l.place, null);
  t.eq("a feeling the app doesn't know isn't stored", newLapse({ taskId: "q1", feeling: "grumpy" }).feeling, null);
  t.ok("'just habit' is a real answer, not a missing one", FEELINGS.some((f) => f.id === "habit"));
  t.eq("an urge is ridden out for fifteen minutes by default", URGE_MINUTES, 15);
});

t.group("the tally");
atDate(CLOCK, () => {
  const log = [
    newUrge({ taskId: "q1", at: new Date(`${TODAY}T10:00:00`).getTime() }),
    newUrge({ taskId: "q1", at: new Date("2026-09-25T10:00:00").getTime() }),
    newUrge({ taskId: "q1", at: new Date("2026-09-24T10:00:00").getTime(), outcome: "gave-in" }),
    newLapse({ taskId: "q1", at: new Date("2026-09-24T10:05:00").getTime() }),
    newUrge({ taskId: "q1", at: new Date("2026-09-10T10:00:00").getTime() }),   // outside the week
    newUrge({ taskId: "other", at: new Date(`${TODAY}T11:00:00`).getTime() }), // someone else's
  ];
  const week = urgeTally(log, "q1", { today: TODAY });
  t.eq("urges ridden out this week", week.rodeOut, 2);
  t.eq("...given in to", week.gaveIn, 1);
  t.eq("...and lapses", week.lapses, 1);
  t.eq("nothing logged, nothing counted", urgeTally([], "q1", { today: TODAY }), { rodeOut: 0, gaveIn: 0, lapses: 0 });
});

t.group("triggers from evidence, not from the setup guess");
{
  const task = quit({ trigger: "Boredom or waiting" });
  const log = [
    newLapse({ taskId: "q1", trigger: "After dinner" }),
    newLapse({ taskId: "q1", trigger: "after dinner" }),
    newLapse({ taskId: "q1", trigger: "Can't sleep" }),
    newLapse({ taskId: "other", trigger: "Not mine" }),
  ];
  const known = knownTriggers(log, task);
  // Twice in real lapses outranks once, and both outrank what was typed on day one.
  t.eq("the most frequent real trigger comes first", known[0], "After dinner");
  t.eq("...then the rarer ones", known[1], "Can't sleep");
  t.eq("...and the setup guess comes last, not first", known[known.length - 1], "Boredom or waiting");
  t.ok("the same trigger in different case is one trigger", known.filter((k) => /dinner/i.test(k)).length === 1);
  t.ok("another habit's triggers don't leak in", !known.includes("Not mine"));
  t.eq("with no lapses yet, the setup trigger is all there is", knownTriggers([], task), ["Boredom or waiting"]);
  t.eq("...and with neither, nothing", knownTriggers([], quit({ trigger: null })), []);
}

t.group("the note from calm you");
{
  // Three prompts, not an empty box: blank fields don't get filled.
  t.eq("three prompts", CALM_PROMPTS.map((p) => p.id), ["why", "after", "passes"]);
  t.ok("none of them is filled in for you", CALM_PROMPTS.every((p) => !("text" in p)));

  t.ok("a habit with no note has none", !hasCalmNote(quit()));
  t.ok("...nor one with only whitespace", !hasCalmNote(quit({ calmNote: { why: "   " } })));

  const task = quit({ calmNote: { passes: "It's gone in fifteen minutes.", why: "I want my evenings back." } });
  t.eq("the parts read in order, whatever order they were written",
    calmNoteParts(task).map((p) => p.id), ["why", "passes"]);
  t.eq("...skipping the ones left empty", calmNoteParts(task).length, 2);

  // Each prompt is asked at the moment it can be answered honestly.
  t.eq("after a slip, it asks how you feel an hour later — the one time that isn't a guess",
    promptAfter("lapse").id, "after");
  t.eq("after riding one out, it asks what got you through", promptAfter("rodeOut").id, "passes");

  const written = withCalmNote(task, "after", "  Flat, and annoyed I lost the evening.  ");
  t.eq("writing one part keeps the others", written.why, "I want my evenings back.");
  t.eq("...and stores what was written, trimmed", written.after, "Flat, and annoyed I lost the evening.");
  t.eq("clearing a part removes it rather than keeping a blank", "passes" in withCalmNote(task, "passes", "  "), false);
  t.eq("a prompt that doesn't exist changes nothing", withCalmNote(task, "nope", "x"), task.calmNote);
}

// ---- 2 · Cutting down ----

t.group("cutting down, not only stopping");
{
  const at = (hhmm) => new Date(`${TODAY}T${hhmm}:00`).getTime();
  const lapse = (hhmm, taskId = "q1") => ({ ...newLapse({ taskId, at: at(hhmm) }), date: TODAY });
  const counted = quit({ limit: 3 });

  t.eq("no limit means none at all", limitOf(quit()), 0);
  t.eq("...and nonsense means none at all too", limitOf(quit({ limit: "lots" })), 0);
  t.eq("a limit is a whole number", limitOf(quit({ limit: 2.7 })), 2);

  const two = [lapse("09:00"), lapse("13:00")];
  t.eq("the day's count comes from the log", lapsesOn(two, "q1", TODAY).length, 2);
  // Two of three is a kept day: the whole point of a limit.
  t.eq("inside the limit, the day isn't slipped", dayState(counted, TODAY, syncSlip({}, counted, TODAY, two)), "open");
  const kept = syncSlip({ [TODAY]: { q1: { done: true, doneAt: 1 } } }, counted, TODAY, two);
  t.eq("...and a tick for keeping to it stands", dayState(counted, TODAY, kept), "clean");

  const four = [...two, lapse("18:00"), lapse("22:30")];
  const over = syncSlip({}, counted, TODAY, four);
  t.eq("over the limit, it is", dayState(counted, TODAY, over), "slipped");
  // The day was lost at the lapse that crossed the line, not at the first one.
  t.eq("...marked at the one that crossed the line", over[TODAY].q1.at, at("22:30"));
  t.eq("with no limit, one is enough", dayState(quit(), TODAY, syncSlip({}, quit(), TODAY, [lapse("09:00")])), "slipped");

  // Undo a lapse, or raise the limit, and the mark has to follow.
  t.eq("dropping back under the limit clears the mark",
    dayState(counted, TODAY, syncSlip(over, counted, TODAY, four.slice(0, 3))), "open");
  t.eq("...as does raising the limit", dayState(quit({ limit: 5 }), TODAY, syncSlip(over, quit({ limit: 5 }), TODAY, four)), "open");
  t.eq("syncing an unchanged day returns the same log", syncSlip(over, counted, TODAY, four), over);
}

t.group("two phones each under the limit");
{
  // Two phones each two lapses into a limit of three: neither knew, together they're over.
  const at = (hhmm) => new Date(`${TODAY}T${hhmm}:00`).getTime();
  const counted = quit({ limit: 3 });
  const phone = { ...emptyState(), savedAt: 5, tasks: [counted],
    urgeLog: [newLapse({ taskId: "q1", at: at("09:00") }), newLapse({ taskId: "q1", at: at("12:00") })] };
  const tablet = { ...emptyState(), savedAt: 4, tasks: [counted],
    urgeLog: [newLapse({ taskId: "q1", at: at("19:00") }), newLapse({ taskId: "q1", at: at("21:00") })] };
  phone.urgeLog.forEach((r) => { r.date = TODAY; });
  tablet.urgeLog.forEach((r) => { r.date = TODAY; });
  const merged = mergeStates(phone, tablet);
  t.eq("merged, the four lapses put the day over", dayState(counted, TODAY, merged.dayLog), "slipped");
  t.eq("...and it was lost at the fourth", merged.dayLog[TODAY].q1.at, at("21:00"));

  const stale = { [TODAY]: { q1: { done: false, slipped: true, at: 1 } } };
  t.eq("a mark with no lapse behind it is cleared on reconcile",
    dayState(quit(), TODAY, reconcileSlips([quit()], [], stale)), "open");
  t.eq("reconcile leaves build habits alone",
    reconcileSlips([{ id: "b", kind: "build" }], [], { [TODAY]: { b: { done: true } } })[TODAY].b.done, true);
}

// ---- 5 · A rate beside the run ----
t.group("a rate, not just a run");
{
  const task = quit();
  const day = (offset) => {
    const d = new Date(`${TODAY}T12:00:00`); d.setDate(d.getDate() - offset);
    const z = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  };
  const log = {};
  // Twelve clean days, a slip, then five clean up to yesterday; today undecided.
  for (let i = 1; i <= 5; i++) log[day(i)] = { q1: { done: true } };
  log[day(6)] = { q1: { done: false, slipped: true, at: 1 } };
  for (let i = 7; i <= 18; i++) log[day(i)] = { q1: { done: true } };
  const rec = cleanRecord(task, log, { today: TODAY });

  t.eq("the current run counts back to the last slip", rec.current, 5);
  t.eq("...and an undecided today doesn't break it", cleanRecord(task, log, { today: TODAY }).current, 5);
  t.eq("the best run is remembered", rec.best, 12);
  // The rate: one slip in eighteen recorded days barely moves it. That's the point.
  t.eq("clean days, of the ones recorded", [rec.clean, rec.recorded], [17, 18]);
  t.eq("untouched days are left out, not counted either way", rec.recorded, 18);

  const withToday = { ...log, [TODAY]: { q1: { done: true } } };
  t.eq("a clean today extends the run", cleanRecord(task, withToday, { today: TODAY }).current, 6);
  t.eq("nothing recorded", cleanRecord(task, {}, { today: TODAY }), { current: 0, best: 0, clean: 0, slipped: 0, recorded: 0, days: 30 });
}

// ---- 6 · Time since, and what it has bought ----
t.group("time since, and what it has bought");
{
  t.eq("days and hours", fmtSince((4 * 24 + 6) * 3600e3), "4d 6h");
  t.eq("whole days drop the hours", fmtSince(3 * 24 * 3600e3), "3d");
  t.eq("hours and minutes under a day", fmtSince((3 * 60 + 20) * 60e3), "3h 20m");
  t.eq("minutes under an hour", fmtSince(12 * 60e3), "12m");
  t.eq("no time at all", fmtSince(null), null);

  const start = new Date("2026-09-01T00:00:00").getTime();
  const task = quit({ startDate: "2026-09-01" });
  t.eq("never slipped: since the start", lastSlipAt(task, []), start);
  const last = new Date("2026-09-20T22:00:00").getTime();
  t.eq("otherwise since the last lapse", lastSlipAt(task, [newLapse({ taskId: "q1", at: last - 1e6 }), newLapse({ taskId: "q1", at: last })]), last);

  // Without a baseline this would be a figure made up to look encouraging.
  t.eq("no baseline, no figure", reclaimed(task, [], start + 10 * 86400e3), null);
  const priced = quit({ startDate: "2026-09-01", baseline: 10, costPer: 0.5, minutesPer: 6 });
  const ten = start + 10 * 86400e3;
  const three = [1, 2, 3].map((i) => newLapse({ taskId: "q1", at: start + i * 86400e3 }));
  const r = reclaimed(priced, three, ten);
  t.eq("ten a day for ten days, three since: ninety-seven fewer", r.avoided, 97);
  t.eq("...worth what they said each one costs", r.money, 49);
  t.eq("...and the minutes they said each one takes", r.minutes, 582);
  t.eq("a cost not given isn't guessed", reclaimed(quit({ startDate: "2026-09-01", baseline: 10 }), [], ten).money, null);
  t.eq("before the start there's nothing to count", reclaimed(priced, [], start - 1), null);
}

t.group("a slip is a lapse past the limit");
{
  const { slipsOf, daysLost } = await import("../src/lib/urges.js");
  const at = (d, hhmm) => new Date(`2026-09-${d}T${hhmm}:00`).getTime();
  const counted = quit({ limit: 2 });
  const log = [
    { ...newLapse({ taskId: "q1", at: at(27, "09:00") }), date: "2026-09-27" },
    { ...newLapse({ taskId: "q1", at: at(27, "12:00") }), date: "2026-09-27" },
    { ...newLapse({ taskId: "q1", at: at(27, "20:00") }), date: "2026-09-27" },
    { ...newLapse({ taskId: "q1", at: at(28, "10:00") }), date: "2026-09-28" },
  ];
  t.eq("inside the limit, occurrences aren't slips", slipsOf(counted, log).length, 1);
  t.eq("...the one past it is", slipsOf(counted, log)[0].at, at(27, "20:00"));
  t.eq("with no limit, every lapse is a slip", slipsOf(quit(), log).length, 4);
  t.eq("one lost day per date, earliest first", daysLost(quit(), log).map((r) => r.date), ["2026-09-27", "2026-09-28"]);
  // "Since the last slip" should not reset on a +1 that was within the plan.
  t.eq("time since counts from the last slip, not the last +1", lastSlipAt(counted, log), at(27, "20:00"));
}
