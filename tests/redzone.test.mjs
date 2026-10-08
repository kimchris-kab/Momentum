import { suite } from "./harness.mjs";
import {
  DEFAULT_REDZONE, INTENSITIES, MIN_ZONE_MINUTES, ZONE_PRESETS, activeZone, askHeld, describeDays, describeZone, inZone,
  newZone, newZoneHold, occurrences, outcomeOf, redZoneSettings, toMinutes, widgetZones, zoneFromPreset, zoneMinutes,
  zoneNudges, zoneProblem, zoneStats, zonesOf,
} from "../src/lib/redzone.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";

const t = suite("redzone");

// The red zone: hours someone says a habit hits hardest. The things worth pinning down are that a
// zone belongs to the day it starts on (so 22:00–00:00 and 22:00–02:00 behave), that what is sent
// is a small, planned set rather than a drumbeat, that it uses the person's own words, and that
// nothing claims a result that didn't happen.
const DAY = 86400000, MIN = 60000;
const ALL = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const at = (iso) => new Date(iso).getTime();
const NOW = at("2026-10-08T12:00:00"); // a Thursday noon
const late = () => ({ id: "late", days: ALL, from: "22:00", to: "00:00" });
const quit = (id = "a", over = {}) => newTask({
  id, kind: "break", text: "Doomscrolling", startDate: "2026-09-01", createdAt: at("2026-09-01T00:00:00"),
  redZones: [late()], ...over,
});
const st = (patch = {}) => ({ tasks: [quit()], urgeLog: [], zoneLog: [], pepNotes: [], settings: {}, ...patch });
const lapse = (taskId, ms) => ({ id: `l-${ms}`, taskId, kind: "lapse", at: ms, date: new Date(ms).toISOString().slice(0, 10) });
const hhmm = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

t.group("settings");
{
  t.eq("the defaults", redZoneSettings(undefined), { on: true, intensity: "steady", lead: 30 });
  t.eq("exported default matches", DEFAULT_REDZONE, redZoneSettings({}));
  t.eq("three intensities", INTENSITIES.map((i) => i.id), ["light", "steady", "close"]);
  t.eq("a chosen intensity is kept", redZoneSettings({ redZone: { intensity: "close" } }).intensity, "close");
  t.eq("an unknown one falls back", redZoneSettings({ redZone: { intensity: "loud" } }).intensity, "steady");
  t.ok("it can be turned off, and only by saying so", redZoneSettings({ redZone: { on: false } }).on === false && redZoneSettings({ redZone: { on: undefined } }).on === true);
  t.eq("the heads-up lead is one of the offered amounts", [redZoneSettings({ redZone: { lead: 45 } }).lead, redZoneSettings({ redZone: { lead: 7 } }).lead], [45, 30]);
}

t.group("a zone");
{
  t.eq("22:00 to 00:00 is two hours", zoneMinutes(late()), 120);
  t.eq("22:00 to 02:00 is four, running into the next day", zoneMinutes({ days: ALL, from: "22:00", to: "02:00" }), 240);
  t.eq("a daytime zone", zoneMinutes({ days: ALL, from: "14:00", to: "18:30" }), 270);
  t.eq("a good zone has no problem", zoneProblem(late()), null);
  t.ok("no days is a problem, said in words", /at least one day/i.test(zoneProblem({ days: [], from: "22:00", to: "00:00" })));
  t.ok("a missing time is", /when it starts/i.test(zoneProblem({ days: ALL, from: "", to: "00:00" })));
  t.ok("a garbled time is", zoneProblem({ days: ALL, from: "9pm", to: "00:00" }) !== null);
  t.ok("the same start and end is", /end after it starts/i.test(zoneProblem({ days: ALL, from: "22:00", to: "22:00" })));
  t.ok("under twenty minutes is too short", new RegExp(`${MIN_ZONE_MINUTES} minutes`).test(zoneProblem({ days: ALL, from: "22:00", to: "22:10" })));
  t.ok("exactly twenty is fine", zoneProblem({ days: ALL, from: "22:00", to: "22:20" }) === null);
  t.ok("over twelve hours is too long", /Twelve hours/.test(zoneProblem({ days: ALL, from: "08:00", to: "21:00" })));
  t.ok("twelve exactly is fine", zoneProblem({ days: ALL, from: "08:00", to: "20:00" }) === null);
  t.eq("a habit's usable zones leave out the broken ones", zonesOf(quit("a", { redZones: [late(), { days: [], from: "22:00", to: "00:00" }, null] })).length, 1);
  t.eq("no zones, no problem", [zonesOf(quit("a", { redZones: undefined })).length, zonesOf(null).length], [0, 0]);
  t.eq("days read the way people say them", [describeDays(ALL), describeDays(["mon", "tue", "wed", "thu", "fri"]), describeDays(["sat", "sun"]), describeDays(["fri", "mon", "wed"])], ["Every day", "Weekdays", "Weekends", "Mon, Wed, Fri"]);
  t.ok("a late-night zone reads as every night", /^Every night · 10:00 PM . 12:00 AM$/.test(describeZone(late())), describeZone(late()));
  t.ok("a weekday afternoon reads as weekdays", /^Weekdays · 5:00 PM . 8:00 PM$/.test(describeZone({ days: ["mon", "tue", "wed", "thu", "fri"], from: "17:00", to: "20:00" })));
  t.ok("presets are all valid zones", ZONE_PRESETS.every((p) => zoneProblem(zoneFromPreset(p.id)) === null));
  t.ok("the first preset is the late-night one from the request", ZONE_PRESETS[0].from === "22:00" && ZONE_PRESETS[0].to === "00:00" && ZONE_PRESETS[0].days.length === 7);
  t.eq("an unknown preset is nothing", zoneFromPreset("nope"), null);
  t.eq("a new zone keeps days in week order and gets an id", [newZone({ days: ["sun", "mon"], from: "10:00", to: "11:00" }).days, typeof newZone({ days: ["mon"], from: "10:00", to: "11:00" }).id], [["mon", "sun"], "string"]);
}

t.group("when the zone is");
{
  const task = quit();
  const occ = occurrences(task, at("2026-10-08T00:00:00"), at("2026-10-08T23:59:00"));
  t.ok("a night zone starts at ten and ends at midnight", occ.some((o) => o.date === "2026-10-08" && o.start === at("2026-10-08T22:00:00") && o.end === at("2026-10-09T00:00:00")), occ);
  t.ok("last night's zone is found too, until it ends", occ.some((o) => o.date === "2026-10-07"), occ.map((o) => o.date));
  t.ok("not inside before it starts", inZone(task, at("2026-10-08T21:59:59")) === null);
  t.ok("inside from the first second", inZone(task, at("2026-10-08T22:00:00"))?.date === "2026-10-08");
  t.ok("inside to the last", inZone(task, at("2026-10-08T23:59:59"))?.date === "2026-10-08");
  t.ok("not inside at midnight itself", inZone(task, at("2026-10-09T00:00:00"))?.date !== "2026-10-08");
  const over = quit("a", { redZones: [{ id: "z", days: ["fri"], from: "22:00", to: "02:00" }] });
  t.ok("a Friday zone running to 2 am is still the Friday zone at 1 am Saturday", inZone(over, at("2026-10-10T01:00:00"))?.date === "2026-10-09", inZone(over, at("2026-10-10T01:00:00")));
  t.ok("...but there is no zone on Saturday night", inZone(over, at("2026-10-10T23:00:00")) === null);
  t.ok("...and none on Thursday night", inZone(over, at("2026-10-08T23:00:00")) === null);
  const wk = quit("a", { redZones: [{ id: "w", days: ["mon", "tue", "wed", "thu", "fri"], from: "17:00", to: "20:00" }] });
  t.ok("a weekday zone is there on a Thursday", inZone(wk, at("2026-10-08T18:00:00")) !== null);
  t.ok("...and not on a Saturday", inZone(wk, at("2026-10-10T18:00:00")) === null);
  t.ok("two zones on one habit are both found", occurrences(quit("a", { redZones: [late(), { id: "m", days: ALL, from: "07:00", to: "09:00" }] }), at("2026-10-08T00:00:00"), at("2026-10-08T23:59:00")).filter((o) => o.date === "2026-10-08").length === 2);
  t.ok("results come in time order", (() => { const o = occurrences(quit("a", { redZones: [late(), { id: "m", days: ALL, from: "07:00", to: "09:00" }] }), NOW, NOW + 3 * DAY); return o.every((x, i) => i === 0 || x.start >= o[i - 1].start); })());
  t.eq("a habit with no zones has no occurrences", occurrences(quit("a", { redZones: [] }), NOW, NOW + 7 * DAY), []);
  t.ok("the active zone is the habit that is in one", activeZone(st(), at("2026-10-08T22:30:00"))?.task.id === "a" && activeZone(st(), NOW) === null);
  t.ok("a habit with its red zone switched off isn't active", activeZone(st({ tasks: [quit("a", { redZoneNudges: false })] }), at("2026-10-08T22:30:00")) === null);
  t.ok("a habit being built has no red zone", activeZone(st({ tasks: [quit("a", { kind: "build" })] }), at("2026-10-08T22:30:00")) === null);
  t.ok("the pinned habit wins when two are in a zone", activeZone(st({ tasks: [quit("a"), quit("b", { shadePin: 5 })] }), at("2026-10-08T22:30:00"))?.task.id === "b");
}

t.group("what is sent");
{
  const items = (s, days = 2) => zoneNudges(s, NOW, { days });
  const kinds = (list, date) => list.filter((n) => n.date === date).map((n) => `${hhmm(n.at)} ${n.id.split(":").pop()}`);
  t.eq("Steady: a heads-up half an hour ahead, the start, the halfway point, and the question at the end",
    kinds(items(st()), "2026-10-08"), ["21:30 plan", "22:00 start", "23:00 mid", "00:00 end"]);
  t.eq("Light: just the start and the question", kinds(items(st({ settings: { redZone: { intensity: "light" } } })), "2026-10-08"), ["22:00 start", "00:00 end"]);
  t.eq("Close: also something every half hour", kinds(items(st({ settings: { redZone: { intensity: "close" } } })), "2026-10-08"),
    ["21:30 plan", "22:00 start", "22:30 c30", "23:00 c60", "23:30 c90", "00:00 end"]);
  t.eq("the heads-up lead can be changed", kinds(items(st({ settings: { redZone: { lead: 60 } } })), "2026-10-08")[0], "21:00 plan");
  t.eq("a zone under ninety minutes has no halfway nudge on Steady", items(st({ tasks: [quit("a", { redZones: [{ id: "s", days: ALL, from: "22:00", to: "23:00" }] })] })).filter((n) => n.date === "2026-10-08").map((n) => n.id.split(":").pop()), ["plan", "start", "end"]);
  t.ok("the halfway point is the middle of the zone", hhmm(items(st({ tasks: [quit("a", { redZones: [{ id: "x", days: ALL, from: "20:00", to: "23:00" }] })] })).find((n) => n.id.endsWith(":mid")).at) === "21:30");
  t.ok("a week of nights is a week of sets", items(st(), 7).filter((n) => n.id.endsWith(":start")).length === 7);
  t.ok("nothing is in the past", items(st()).every((n) => n.at.getTime() > NOW));
  t.ok("a zone already under way sends only what's left of it", (() => {
    const l = zoneNudges(st(), at("2026-10-08T22:45:00"), { days: 1 }).filter((n) => n.date === "2026-10-08").map((n) => n.id.split(":").pop());
    return JSON.stringify(l) === JSON.stringify(["mid", "end"]);
  })());
  t.eq("switched off, nothing", zoneNudges(st({ settings: { redZone: { on: false } } }), NOW), []);
  t.eq("a habit with its zone nudges off sends nothing", items(st({ tasks: [quit("a", { redZoneNudges: false })] })), []);
  t.eq("no zones, nothing", items(st({ tasks: [quit("a", { redZones: [] })] })), []);
  t.eq("a habit being built, nothing", items(st({ tasks: [quit("a", { kind: "build" })] })), []);
  t.eq("an archived habit, nothing", items(st({ tasks: [quit("a", { archivedAt: 1 })] })), []);
  t.eq("a finished habit, nothing", items(st({ tasks: [quit("a", { recurrence: weeklyRule(ALL), endedOn: "2026-10-01" })] })), []);

  const wk = st({ tasks: [quit("a", { redZones: [{ id: "w", days: ["mon", "tue", "wed", "thu", "fri"], from: "17:00", to: "20:00" }] })] });
  t.ok("only the days it's set for", [...new Set(items(wk, 7).map((n) => n.date))].every((d) => !["2026-10-10", "2026-10-11"].includes(d)));
  t.ok("ids are unique, so a rebuilt plan replaces rather than adds", (() => { const l = items(st(), 7); return new Set(l.map((n) => n.id)).size === l.length; })());
  t.ok("each says which zone it belongs to", items(st()).every((n) => n.zone === `late@${n.date}`));
  t.ok("sorted by time", items(st(), 3).every((n, i, l) => i === 0 || n.at >= l[i - 1].at));

  const after = items(st(), 1).filter((n) => n.date === "2026-10-08");
  t.ok("the start and the middle offer to ride it out", after.filter((n) => n.id.endsWith(":start") || n.id.endsWith(":mid")).every((n) => n.actions.some((a) => a.id === "urge")));
  const end = after.find((n) => n.id.endsWith(":end"));
  t.eq("the question at the end offers to say you held it, or that you slipped", end.actions.map((a) => a.id), ["held", "slipped"]);
  t.eq("and is its own kind, so it can be answered differently", [end.kind, after[0].kind], ["redzone-end", "redzone"]);
  t.ok("it asks, rather than claiming", /did you hold\?/i.test(end.title) && !/made it|well done|cleared/i.test(end.title + end.body));
  t.ok("and makes slipping sound like information", /information, not a verdict/.test(end.body));
}

t.group("a slip in the zone");
{
  const slipAt = at("2026-10-08T22:40:00");
  const s = st({ urgeLog: [lapse("a", slipAt)] });
  const l = zoneNudges(s, at("2026-10-08T22:20:00"), { days: 1 }).filter((n) => n.date === "2026-10-08").map((n) => n.id.split(":").pop());
  t.ok("after a slip, no more is said about that zone: the question would be absurd", !l.includes("end") && !l.includes("mid"), l);
  t.ok("the zone is then a slipped one", outcomeOf(s, s.tasks[0], { zoneId: "late", date: "2026-10-08", start: at("2026-10-08T22:00:00"), end: at("2026-10-09T00:00:00") }) === "slipped");
  t.ok("tomorrow's zone is untouched", zoneNudges(s, at("2026-10-08T22:50:00"), { days: 2 }).some((n) => n.date === "2026-10-09" && n.id.endsWith(":start")));
  t.ok("a slip outside the zone doesn't spoil it", !zoneNudges(st({ urgeLog: [lapse("a", at("2026-10-08T15:00:00"))] }), NOW, { days: 1 }).every((n) => !n.id.endsWith(":end")) === true);
  const held = st({ zoneLog: [newZoneHold({ taskId: "a", zoneId: "late", date: "2026-10-08" })] });
  t.ok("a zone already answered doesn't ask again", !zoneNudges(held, NOW, { days: 1 }).some((n) => n.date === "2026-10-08" && n.id.endsWith(":end")));
  t.ok("...but still helps while it runs", zoneNudges(held, NOW, { days: 1 }).some((n) => n.date === "2026-10-08" && n.id.endsWith(":start")));
  const claimed = st({ zoneLog: [newZoneHold({ taskId: "a", zoneId: "late", date: "2026-10-08" })], urgeLog: [lapse("a", slipAt)] });
  t.eq("a slip outranks a claim of holding", outcomeOf(claimed, claimed.tasks[0], { zoneId: "late", date: "2026-10-08", start: at("2026-10-08T22:00:00"), end: at("2026-10-09T00:00:00") }), "slipped");
}

t.group("what they say");
{
  const all = (s, days = 1) => zoneNudges(s, NOW, { days }).filter((n) => n.date === "2026-10-08");
  const task = quit("a", { calmNote: { why: "I want my evenings back." }, competingResponse: "Walk round the block", trigger: "Bored in bed" });
  const l = all(st({ tasks: [task], pepNotes: [{ id: "n", taskId: "a", text: "I put the phone in the kitchen.", day: 4, at: 1 }] }));
  const by = (k) => l.find((n) => n.id.endsWith(`:${k}`));
  t.ok("the heads-up names the time and the habit", /Red zone at 10:00 PM · Doomscrolling/.test(by("plan").title));
  t.ok("...asks for something concrete to do now", by("plan").body.length > 40);
  t.ok("...and puts their own plan after it", /Your plan: Walk round the block\./.test(by("plan").body));
  t.ok("the start says they're in it, and until when", /in the red zone · until 12:00 AM/.test(by("start").title));
  t.ok("...and leads with their own reason, in their words", /You wrote “I want my evenings back\.”/.test(by("start").body));
  t.ok("...with the plan after", /Instead: Walk round the block\./.test(by("start").body));
  t.ok("the halfway point uses one of their own notes, with the day it was written", /You, on day 4: “I put the phone in the kitchen\.”/.test(by("mid").body), by("mid").body);
  const noNote = all(st({ tasks: [quit("a", { calmNote: {} })] }));
  t.ok("without a reason of their own, the start falls back to something true about urges", /rises, peaks and falls|ready for it|breathe out/.test(noNote.find((n) => n.id.endsWith(":start")).body));
  const proofLine = all(st({ tasks: [quit("a")], urgeLog: [lapse("a", NOW - 4 * DAY), { id: "u1", taskId: "a", kind: "urge", outcome: "rode-out", at: NOW - DAY }, { id: "u2", taskId: "a", kind: "urge", outcome: "rode-out", at: NOW - 2 * DAY }] })).find((n) => n.id.endsWith(":mid")).body;
  t.ok("with no notes, halfway reports what's been done, in numbers", /4 days clean and 2 urges ridden out this week/.test(proofLine), proofLine);
  const trig = all(st({ tasks: [quit("a", { trigger: "Bored in bed" })] })).find((n) => n.id.endsWith(":plan")).body;
  t.ok("with no plan of their own, the usual trigger is named instead", /The usual trigger: Bored in bed\./.test(trig), trig);
  t.ok("a day-one habit isn't told it has days behind it", !/ days? clean/.test(all(st({ tasks: [quit("a", { startDate: "2026-10-08", createdAt: at("2026-10-08T08:00:00") })] })).find((n) => n.id.endsWith(":mid")).body));
  t.ok("the same words every time the plan is rebuilt", JSON.stringify(all(st({ tasks: [task] }))) === JSON.stringify(all(st({ tasks: [task] }))));
  const nights = zoneNudges(st({ tasks: [task] }), NOW, { days: 7 }).filter((n) => n.id.endsWith(":plan")).map((n) => n.body);
  t.ok("the heads-up varies from night to night, so it doesn't turn into wallpaper", new Set(nights).size >= 3, nights.length);
  const lightStart = zoneNudges(st({ tasks: [task], settings: { redZone: { intensity: "light" } } }), NOW, { days: 1 }).find((n) => n.id.endsWith(":start")).body;
  t.eq("changing the intensity doesn't reword what's left", lightStart, by("start").body);
  t.ok("nothing nags: no exclamation marks, no shouting", l.every((n) => !/[!]/.test(n.title + n.body) && n.title !== n.title.toUpperCase()));
  const close = zoneNudges(st({ tasks: [quit("a")], settings: { redZone: { intensity: "close" } } }), NOW, { days: 1 }).filter((n) => /:c(30|90)$/.test(n.id) && n.date === "2026-10-08");
  t.ok("on Close the halfway point still says so, in among the checks", zoneNudges(st({ tasks: [quit("a")], settings: { redZone: { intensity: "close" } } }), NOW, { days: 1 }).find((n) => n.date === "2026-10-08" && /:c60$/.test(n.id))?.title.startsWith("Halfway through"));
  t.ok("a half-hourly check is short and practical", close.length === 2 && close.every((n) => n.body.length < 90 && /^Still with it\?/.test(n.title)), close.map((n) => n.title));
}

t.group("how the zones have gone");
{
  const task = quit();
  const key = (d) => ({ taskId: "a", zoneId: "late", date: d });
  const hold = (d) => newZoneHold(key(d));
  const base = (zl, ul = []) => ({ tasks: [task], urgeLog: ul, zoneLog: zl, settings: {} });
  const stats = (s, now = at("2026-10-08T12:00:00")) => zoneStats(s, task, now);
  t.eq("nobody has answered yet", stats(base([])).cleared, 0);
  t.eq("three held in a row", [stats(base([hold("2026-10-05"), hold("2026-10-06"), hold("2026-10-07")])).cleared, stats(base([hold("2026-10-05"), hold("2026-10-06"), hold("2026-10-07")])).streak], [3, 3]);
  t.eq("a night nobody answered is stepped over, not counted against them", stats(base([hold("2026-10-05"), hold("2026-10-07")])).streak, 2);
  t.eq("a slip ends the run", stats(base([hold("2026-10-05"), hold("2026-10-06"), hold("2026-10-07")], [lapse("a", at("2026-10-06T22:30:00"))])).streak, 1);
  t.eq("...and is counted", stats(base([hold("2026-10-05")], [lapse("a", at("2026-10-06T22:30:00"))])).slipped, 1);
  t.eq("a slip cancels a claim of holding that night", stats(base([hold("2026-10-06")], [lapse("a", at("2026-10-06T22:30:00"))])).cleared, 0);
  t.eq("a zone still running isn't counted yet", stats(base([hold("2026-10-08")]), at("2026-10-08T23:00:00")).cleared, 0);
  t.eq("a hold is one record however often it's said", newZoneHold({ taskId: "a", zoneId: "late", date: "2026-10-08", at: 1 }).id, newZoneHold({ taskId: "a", zoneId: "late", date: "2026-10-08", at: 9 }).id);
  t.eq("a hold carries what it's about", Object.keys(hold("2026-10-08")).sort(), ["at", "date", "id", "kind", "taskId", "zoneId"]);

  // Asking "did you hold?" the next morning
  const morning = at("2026-10-09T08:00:00");
  t.eq("the morning after, an unanswered zone can still be answered", askHeld(base([]), morning)?.occ.date, "2026-10-08");
  t.eq("...which habit it was", askHeld(base([]), morning)?.task.id, "a");
  t.eq("not once it's been answered", askHeld(base([hold("2026-10-08")]), morning), null);
  t.eq("not if there was a slip in it, which is its own answer", askHeld(base([], [lapse("a", at("2026-10-08T23:10:00"))]), morning), null);
  t.eq("not while the zone is still running", askHeld(base([]), at("2026-10-08T23:00:00")), null);
  t.eq("not when it ended long ago", askHeld(base([]), at("2026-10-09T15:30:00"))?.occ.date === "2026-10-09" ? "x" : null, null);
  t.eq("not for a habit with its zone nudges off", askHeld({ ...base([]), tasks: [quit("a", { redZoneNudges: false })] }, morning), null);
}

t.group("handing it to the phone");
{
  const z = widgetZones(quit("a", { redZones: [late(), { id: "w", days: ["sat", "sun"], from: "14:00", to: "18:00" }] }));
  t.eq("days as 0 = Sunday, times as minutes into the day", z, [
    { days: [0, 1, 2, 3, 4, 5, 6], startMin: 1320, endMin: 0 },
    { days: [0, 6], startMin: 840, endMin: 1080 },
  ]);
  t.eq("a habit with none sends none", widgetZones(quit("a", { redZones: [] })), []);
  t.eq("minutes", [toMinutes("00:00"), toMinutes("22:00"), toMinutes("23:59")], [0, 1320, 1439]);
}
