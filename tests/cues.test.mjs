import { suite } from "./harness.mjs";
import {
  CUE_BY_ID, CUE_TYPES, DEFAULT_CUE, completionTimes, contextStability, cueOf, hasCue,
  implementationIntention, intentionText, stabilityBand,
} from "../src/lib/cues.js";

const t = suite("cues");

// Times are written as local wall-clock strings and turned into epoch ms the same way the
// app does when it stamps doneAt, so the arithmetic under test is the real one.
const at = (date, hhmm) => {
  const [h, m] = hhmm.split(":").map(Number);
  const [y, mo, d] = date.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};
const logOf = (taskId, entries) => Object.fromEntries(
  entries.map(([date, hhmm]) => [date, { [taskId]: { done: true, doneAt: at(date, hhmm) } }]));

t.group("reading the cue off a habit");
{
  t.eq("the default anchor is a routine, not a clock", DEFAULT_CUE, "routine");
  // The evidence this is built on says a clock is the weakest anchor, so it must not be the
  // one offered first.
  t.eq("time is offered last", CUE_TYPES[CUE_TYPES.length - 1].id, "time");
  t.ok("every cue type carries its reasoning", CUE_TYPES.every((c) => c.help && c.prompt));
  t.ok("...and is reachable by id", CUE_TYPES.every((c) => CUE_BY_ID[c.id] === c));

  t.eq("a routine cue reads back whole", cueOf({ cueType: "routine", cueDetail: "brew coffee" }),
    { type: "routine", detail: "brew coffee", legacy: false });
  // A time cue is the one kind that means something without its own detail — the habit's
  // scheduled time is the cue.
  t.eq("a time cue falls back to the habit's time",
    cueOf({ cueType: "time", time: "07:00" }), { type: "time", detail: "07:00", legacy: false });
  t.eq("...and prefers an explicit detail when there is one",
    cueOf({ cueType: "time", cueDetail: "06:30", time: "07:00" }).detail, "06:30");

  // Habits written before cues existed carried the same information in loose fields.
  t.eq("an old stackAfter still counts as a cue",
    cueOf({ stackAfter: "I sit down" }), { type: "routine", detail: "I sit down", legacy: true });
  t.eq("...and an old location", cueOf({ location: "at my desk" }).type, "location");
  t.eq("...and a bare time", cueOf({ time: "21:00" }), { type: "time", detail: "21:00", legacy: true });
  t.eq("a routine beats a location beats a time when an old habit has several",
    cueOf({ stackAfter: "coffee", location: "desk", time: "07:00" }).type, "routine");

  t.eq("a habit with nothing to anchor to has no cue", cueOf({ text: "Read" }), null);
  t.eq("...and neither does nothing at all", cueOf(null), null);
  // An empty detail is not a cue; it would render as "When I , I will…".
  t.eq("a cue type with a blank detail doesn't count",
    cueOf({ cueType: "routine", cueDetail: "" }), null);
  t.ok("hasCue agrees with cueOf", hasCue({ stackAfter: "coffee" }) && !hasCue({ text: "Read" }));
}

t.group("the if-then sentence");
{
  t.eq("a routine reads as one sentence",
    implementationIntention({ cueType: "routine", cueDetail: "brew my coffee", text: "Read" }),
    "When I brew my coffee, I will read.");
  t.eq("a place reads as being somewhere",
    implementationIntention({ cueType: "location", cueDetail: "at my desk", text: "Plan the day" }),
    "When I'm at my desk, I will plan the day.");
  // A clock needs no "when": "When at 7:00 AM" is not English.
  t.eq("a time reads as a time",
    implementationIntention({ cueType: "time", cueDetail: "07:00", text: "Stretch" }),
    "At 7:00 AM, I will stretch.");

  t.eq("no cue means no sentence", implementationIntention({ text: "Read" }), null);
  t.eq("no behaviour means no sentence either",
    implementationIntention({ cueType: "routine", cueDetail: "coffee", text: "   " }), null);

  // What someone wrote themselves outranks anything composed for them.
  t.eq("a written intention wins",
    intentionText({ intention: "When the kettle clicks, I will do ten press-ups.", text: "Press-ups",
      cueType: "routine", cueDetail: "boil the kettle" }),
    "When the kettle clicks, I will do ten press-ups.");
  t.eq("...but whitespace isn't writing",
    intentionText({ intention: "  ", cueType: "routine", cueDetail: "brew my coffee", text: "Read" }),
    "When I brew my coffee, I will read.");
}

t.group("when a habit actually happens");
{
  const log = logOf("h", [["2026-09-01", "07:05"], ["2026-09-02", "07:00"]]);
  t.eq("completions come back as minutes past midnight", completionTimes({ id: "h" }, log), [425, 420]);
  t.eq("a tick with no timestamp isn't a sample",
    completionTimes({ id: "h" }, { "2026-09-03": { h: { done: true } } }), []);
  t.eq("neither is an unticked day",
    completionTimes({ id: "h" }, { "2026-09-03": { h: { done: false, doneAt: at("2026-09-03", "07:00") } } }), []);
  t.eq("no log at all", completionTimes({ id: "h" }, null), []);
}

t.group("how tightly a habit is anchored in the day");
{
  // Four samples is not a pattern; the app should say it doesn't know rather than guess.
  const four = contextStability({ id: "h" }, logOf("h", [
    ["2026-09-01", "07:00"], ["2026-09-02", "07:00"], ["2026-09-03", "07:00"], ["2026-09-04", "07:00"]]));
  t.eq("four completions is not enough to judge", four.score, null);
  t.eq("...but it says how many it has", four.n, 4);
  t.eq("...and claims no mean time", four.meanTime, null);

  const same = contextStability({ id: "h" }, logOf("h", [
    ["2026-09-01", "07:00"], ["2026-09-02", "07:00"], ["2026-09-03", "07:00"],
    ["2026-09-04", "07:00"], ["2026-09-05", "07:00"]]));
  t.eq("always at the same moment scores 1", same.score, 1);
  t.eq("...with that moment as the mean", same.meanTime, "07:00");
  t.eq("...and no spread at all", same.spreadMinutes, 0);

  // The whole reason for circular statistics: a bedtime habit straddling midnight is the
  // steadiest thing in the app, and linear arithmetic would call it the most scattered.
  const bedtime = contextStability({ id: "h" }, logOf("h", [
    ["2026-09-01", "23:50"], ["2026-09-02", "00:10"], ["2026-09-03", "23:55"],
    ["2026-09-04", "00:05"], ["2026-09-05", "00:00"]]));
  t.ok("a habit straddling midnight is tight, not scattered", bedtime.score > 0.99, bedtime);
  t.ok("...and its mean time sits on midnight",
    ["00:00", "23:59", "00:01"].includes(bedtime.meanTime), bedtime.meanTime);
  t.eq("...which reads as the tightest band", stabilityBand(bedtime).id, "tight");

  const scattered = contextStability({ id: "h" }, logOf("h", [
    ["2026-09-01", "06:00"], ["2026-09-02", "12:00"], ["2026-09-03", "18:00"],
    ["2026-09-04", "23:00"], ["2026-09-05", "09:00"]]));
  t.ok("a habit fired all over the day scores low", scattered.score < 0.4, scattered);
  t.eq("...and reads as scattered", stabilityBand(scattered).id, "scattered");

  // The bands are read in minutes because that is the only unit anyone can check the label
  // against. Banding on R instead is what let "same moment each time" mean a six-hour spread.
  const spreadOf = (times) => contextStability({ id: "h" }, logOf("h",
    times.map((hhmm, i) => [`2026-09-0${i + 1}`, hhmm])));
  const bandOf = (times) => stabilityBand(spreadOf(times)).id;

  t.eq("within half an hour is the same moment",
    bandOf(["06:50", "07:10", "07:00", "06:55", "07:05"]), "tight");
  t.eq("an hour either way is a window, not a moment",
    bandOf(["06:00", "08:00", "07:00", "06:30", "07:30"]), "loose");
  // The case that exposed the fault: this used to read as "same moment each time".
  t.eq("three hours either way is all over the day",
    bandOf(["04:00", "10:00", "07:00", "05:30", "08:30"]), "scattered");
  t.eq("...and so is six", bandOf(["01:00", "13:00", "07:00", "04:00", "10:00"]), "scattered");

  t.ok("the label is never claimed beyond the spread it was set for",
    spreadOf(["06:50", "07:10", "07:00", "06:55", "07:05"]).spreadMinutes <= 30);

  t.eq("no score, no band", stabilityBand(null), null);
  t.eq("...and none for a habit that was never judged", stabilityBand(undefined), null);
  t.eq("...nor for one with too few completions", stabilityBand(four), null);
  // R collapsing to zero means the times cancel out completely: as scattered as it gets,
  // which is an answer, not an absence of one.
  t.eq("a collapsed score is scattered, not blank",
    stabilityBand({ score: 0, spreadMinutes: null }).id, "scattered");
}
