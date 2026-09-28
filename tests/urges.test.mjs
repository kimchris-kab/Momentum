import { atDate, suite } from "./harness.mjs";
import {
  CALM_PROMPTS, FEELINGS, URGE_MINUTES, calmNoteParts, dayState, hasCalmNote, isSlipped,
  knownTriggers, newLapse, newUrge, promptAfter, slip, unslip, urgeTally, withCalmNote,
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
