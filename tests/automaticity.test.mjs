import { atDate, suite } from "./harness.mjs";
import {
  ASK_EVERY_DAYS, GRADUATION_MEAN, SRBAI_ITEMS, automaticityReport, completionCount,
  dueForSrbai, graduationStatus, isGraduated, latestSrbai, newSrbaiEntry, reminderMode,
  scaleUpSuggestion, srbaiDue, srbaiHistory,
} from "../src/lib/automaticity.js";
import {
  CUE_BY_ID, DEFAULT_CUE, contextStability, cueOf, implementationIntention, intentionText,
  stabilityBand,
} from "../src/lib/cues.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";

const t = suite("automaticity and cues");

const TODAY = "2026-09-19";
const CLOCK = `${TODAY}T12:00:00`;
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const habit = (patch) => newTask({
  id: "h1", kind: "build", text: "Morning walk", startDate: "2026-06-01",
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const entry = (taskId, date, mean) => ({
  id: `s-${date}`, taskId, date, scores: [mean, mean, mean, mean], mean, at: new Date(`${date}T09:00:00`).getTime(),
});
const completions = (n, id = "h1", from = "2026-09-01") => {
  const out = {};
  const d = new Date(`${from}T00:00:00`);
  for (let i = 0; i < n; i++) {
    out[d.toISOString().slice(0, 10)] = { [id]: { done: true, doneAt: d.getTime() } };
    d.setDate(d.getDate() + 1);
  }
  return out;
};

t.group("the measure itself");
{
  t.eq("four items, as published", SRBAI_ITEMS.length, 4);
  const e = newSrbaiEntry({ taskId: "h1", scores: [5, 6, 5, 6], at: new Date(`${TODAY}T09:00:00`).getTime() });
  t.eq("the mean is kept to one decimal", e.mean, 5.5);
  t.eq("it lands on a date", e.date, TODAY);
  // The scale is 1–7 and nothing outside it can mean anything.
  t.eq("scores are clamped to the scale", newSrbaiEntry({ taskId: "x", scores: [0, 9, 4, 4] }).scores, [1, 7, 4, 4]);
  t.eq("junk scores fall to the floor rather than making NaN",
    newSrbaiEntry({ taskId: "x", scores: [null, "abc", 4, 4] }).scores, [1, 1, 4, 4]);
  t.eq("only four items are taken", newSrbaiEntry({ taskId: "x", scores: [4, 4, 4, 4, 7] }).scores.length, 4);

  const entries = [entry("h1", "2026-08-01", 3), entry("h2", "2026-08-02", 6), entry("h1", "2026-09-01", 5)];
  t.eq("history is per habit, oldest first", srbaiHistory(entries, "h1").map((x) => x.mean), [3, 5]);
  t.eq("the latest is the latest", latestSrbai(entries, "h1").mean, 5);
  t.eq("a habit never rated has no history", latestSrbai(entries, "nope"), null);
}

t.group("when to ask");
{
  const dayLog = completions(6);
  t.eq("fortnightly", ASK_EVERY_DAYS, 14);
  t.ok("a habit with enough history is asked about", srbaiDue(habit(), [], dayLog, TODAY));
  // Nothing to introspect on yet — asking would produce noise, not a measurement.
  t.ok("a brand new habit isn't", !srbaiDue(habit({ startDate: "2026-09-15" }), [], dayLog, TODAY));
  t.ok("nor is one barely done", !srbaiDue(habit(), [], completions(2), TODAY));
  t.ok("nor is a one-off", !srbaiDue(newTask({ id: "h1" }), [], dayLog, TODAY));
  t.ok("nor a break habit", !srbaiDue(habit({ kind: "break" }), [], dayLog, TODAY));
  t.ok("nor an archived one", !srbaiDue(habit({ archivedAt: 1 }), [], dayLog, TODAY));
  t.ok("not again the day after a rating", !srbaiDue(habit(), [entry("h1", "2026-09-18", 4)], dayLog, TODAY));
  t.ok("but yes a fortnight later", srbaiDue(habit(), [entry("h1", "2026-09-05", 4)], dayLog, TODAY));
  t.eq("and the list is filtered the same way",
    dueForSrbai([habit(), habit({ id: "h2", startDate: TODAY })], [], dayLog, TODAY).map((x) => x.id), ["h1"]);
  t.eq("completions are counted wherever they landed", completionCount(habit(), dayLog), 6);
}

t.group("graduation");
{
  t.eq("the bar", GRADUATION_MEAN, 5.5);
  t.eq("never rated", graduationStatus(habit(), []).id, "new");
  t.eq("low and flat is still effortful", graduationStatus(habit(), [entry("h1", "2026-08-01", 2.5)]).id, "building");
  t.eq("close to the bar is strengthening", graduationStatus(habit(), [entry("h1", "2026-08-01", 4.5)]).id, "strengthening");
  t.eq("climbing fast is strengthening even from low down",
    graduationStatus(habit(), [entry("h1", "2026-08-01", 1.5), entry("h1", "2026-09-01", 3)]).id, "strengthening");

  // High on its own isn't enough: one good reading could be a good week.
  t.eq("a single high reading isn't graduation",
    graduationStatus(habit(), [entry("h1", "2026-09-01", 6)]).id, "strengthening");
  // Still climbing means still forming, and pulling the scaffolding early breaks it.
  t.eq("high but still climbing isn't either",
    graduationStatus(habit(), [entry("h1", "2026-08-01", 5.5), entry("h1", "2026-09-01", 6.8)]).id, "strengthening");

  const grad = [entry("h1", "2026-08-01", 6), entry("h1", "2026-09-01", 6.2)];
  t.eq("high and plateaued graduates", graduationStatus(habit(), grad).id, "graduated");
  t.ok("...and says so", graduationStatus(habit(), grad).plateaued && isGraduated(habit(), grad));
  t.eq("a fall back below the bar un-graduates it",
    graduationStatus(habit(), [...grad, entry("h1", "2026-09-15", 4)]).id, "building");
  // ...and isn't described as climbing, whatever level it lands on: "leave the scaffolding
  // in place" is the wrong advice for a habit coming apart.
  t.ok("...and is marked as falling",
    graduationStatus(habit(), [...grad, entry("h1", "2026-09-15", 4)]).falling);
  t.eq("a habit sitting at the same level without falling is still strengthening",
    graduationStatus(habit(), [entry("h1", "2026-08-01", 4), entry("h1", "2026-09-01", 4)]).id, "strengthening");
  t.ok("a reminder comes back when a graduated habit falls apart",
    reminderMode(habit(), [...grad, entry("h1", "2026-09-15", 4)]) === "on");
}

t.group("reminders fade on purpose");
{
  const grad = [entry("h1", "2026-08-01", 6), entry("h1", "2026-09-01", 6.2)];
  // Stawarz et al. (2015): reminders support repetition but hinder habit formation, because
  // the app becomes the cue. So a graduated habit's prompt is withdrawn by default.
  t.eq("an effortful habit keeps its reminder", reminderMode(habit(), []), "on");
  t.eq("a graduated one has it withdrawn", reminderMode(habit(), grad), "faded");
  t.eq("...unless it's explicitly kept", reminderMode(habit({ keepReminder: true }), grad), "on");
  t.eq("off is off", reminderMode(habit({ reminder: false }), grad), "off");
  t.eq("...even when it was explicitly kept, since off was the later decision",
    reminderMode(habit({ reminder: false, keepReminder: true }), grad), "off");
}

t.group("scaling up");
{
  const grad = [entry("h1", "2026-08-01", 6), entry("h1", "2026-09-01", 6.2)];
  t.eq("nothing offered while it's still effortful", scaleUpSuggestion(habit(), []), null);
  t.eq("a two-minute version can grow a lot", scaleUpSuggestion(habit({ timerMinutes: 5 }), grad).to, 20);
  t.eq("a longer one grows gently", scaleUpSuggestion(habit({ timerMinutes: 30 }), grad).to, 45);
  t.eq("one with no timer is just asked the question", scaleUpSuggestion(habit(), grad).to, null);
}

t.group("kept but still effortful");
atDate(CLOCK, () => {
  const dayLog = completions(28, "h1", "2026-08-23");
  const report = automaticityReport([habit()], [entry("h1", "2026-09-01", 3)], dayLog, 28);
  // The whole reason SRBAI is in the app: the streak says solved, the habit says not yet.
  t.ok("doing it every time while it still feels hard is flagged", report[0].effortfulButKept);
  t.eq("...alongside the completion rate", report[0].pct, 100);
  const easy = automaticityReport([habit()], [entry("h1", "2026-09-01", 6.5)], dayLog, 28);
  t.ok("an automatic habit isn't flagged", !easy[0].effortfulButKept);
  t.eq("most automatic first",
    automaticityReport([habit(), habit({ id: "h2" })],
      [entry("h1", "2026-09-01", 3), entry("h2", "2026-09-01", 6)], dayLog, 28)
      .map((r) => r.task.id), ["h2", "h1"]);
});

t.group("cues");
{
  t.eq("a routine is the default anchor", DEFAULT_CUE, "routine");
  // Time is offered last, with the reason said out loud rather than hidden.
  t.ok("and time says it's the weakest", /weakest/i.test(CUE_BY_ID.time.help));

  t.eq("a cue reads off the task", cueOf(habit({ cueType: "routine", cueDetail: "I make coffee" })),
    { type: "routine", detail: "I make coffee", legacy: false });
  // Habits created before cues existed carried the same information in loose fields.
  t.eq("an old stackAfter is honoured", cueOf(habit({ stackAfter: "breakfast" })),
    { type: "routine", detail: "breakfast", legacy: true });
  t.eq("an old location is honoured", cueOf(habit({ location: "the gym" })).type, "location");
  t.eq("a time alone is a (weak) cue", cueOf(habit({ time: "07:00" })), { type: "time", detail: "07:00", legacy: true });
  t.eq("no cue at all", cueOf(habit()), null);

  t.eq("the if-then sentence",
    implementationIntention(habit({ cueType: "routine", cueDetail: "brew my coffee" })),
    "When I brew my coffee, I will morning walk.");
  t.eq("...for a place",
    implementationIntention(habit({ cueType: "location", cueDetail: "at my desk" })),
    "When I'm at my desk, I will morning walk.");
  t.eq("...for a time", implementationIntention(habit({ cueType: "time", cueDetail: "07:00" })),
    "At 7:00 AM, I will morning walk.");
  t.eq("no cue, no sentence", implementationIntention(habit()), null);
  t.eq("a sentence written by hand wins",
    intentionText(habit({ intention: "When the kettle clicks, I walk.", stackAfter: "coffee" })),
    "When the kettle clicks, I walk.");
}

t.group("context stability");
{
  const at = (times) => {
    const log = {};
    times.forEach(([date, time]) => {
      log[date] = { h1: { done: true, doneAt: new Date(`${date}T${time}:00`).getTime() } };
    });
    return log;
  };
  const days = ["2026-09-10", "2026-09-11", "2026-09-12", "2026-09-13", "2026-09-14", "2026-09-15"];

  t.eq("too few completions to say anything",
    contextStability(habit(), at(days.slice(0, 3).map((d) => [d, "07:00"]))).score, null);

  const tight = contextStability(habit(), at(days.map((d) => [d, "07:05"])));
  t.eq("the same moment every time scores 1", tight.score, 1);
  t.eq("...with the mean time to match", tight.meanTime, "07:05");
  t.eq("...and no spread", tight.spreadMinutes, 0);

  const scattered = contextStability(habit(), at([
    [days[0], "06:00"], [days[1], "12:00"], [days[2], "18:00"],
    [days[3], "23:00"], [days[4], "09:00"], [days[5], "15:00"],
  ]));
  t.ok("all over the day scores low", scattered.score < 0.3, scattered);
  t.eq("...and is called what it is", stabilityBand(scattered.score).id, "scattered");

  // The case linear arithmetic gets badly wrong: 23:50 and 00:10 are twenty minutes apart,
  // not twenty-three hours, so a steady bedtime habit must not read as the least stable
  // thing in the app.
  const midnight = contextStability(habit(), at([
    [days[0], "23:50"], [days[1], "00:10"], [days[2], "23:55"],
    [days[3], "00:05"], [days[4], "23:58"], [days[5], "00:02"],
  ]));
  t.ok("a habit that straddles midnight is steady, not scattered", midnight.score > 0.95, midnight);
  t.ok("...with a mean around midnight",
    ["23:59", "00:00", "00:01"].includes(midnight.meanTime), midnight.meanTime);
  t.eq("...and is called tight", stabilityBand(midnight.score).id, "tight");
  t.eq("no score, no band", stabilityBand(null), null);
}
