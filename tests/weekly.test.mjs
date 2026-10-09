import { suite } from "./harness.mjs";
import { DEFAULT_WEEK, focusFor, focusKey, reviewReady, reviewText, weekNudges, weekReport, weekSettings } from "../src/lib/weekly.js";
import { MIN_DAYS_FOR_VERDICT, WHEEL_DAYS, answered, chooseVirtue, suggestNext, wheel } from "../src/lib/virtue.js";
import {
  REPAIR_STYLES, newTemperEntry, owed, patterns, repairDraft, repairNudges, tomorrowMorning, withRepair,
} from "../src/lib/temper.js";
import { characterNudges } from "../src/lib/character.js";
import { emptyState } from "../src/lib/migrate.js";

const t = suite("weekly");
const DAY = 86400000;
const TODAY = "2026-10-11"; // a Sunday
const NOW = new Date("2026-10-11T12:00:00").getTime();
const daily = { freq: "daily", interval: 1, weekdays: [], monthDay: null };
const habit = (id, text) => ({ id, kind: "build", text, recurrence: daily, startDate: "2026-09-01", createdAt: 1, order: 1 });
const quit = { id: "q1", kind: "break", text: "Doomscrolling", recurrence: daily, startDate: "2026-09-01", createdAt: new Date("2026-09-01T08:00:00").getTime(), order: 1 };
const log = (days) => Object.fromEntries(days.map((d) => [d, { w: true }]));
const base = (over = {}) => ({ ...emptyState(), ...over });

// ---- settings ----
t.eq("defaults", weekSettings({}), DEFAULT_WEEK);
t.eq("any day can be chosen", weekSettings({ week: { day: 5 } }).day, 5);
t.eq("a nonsense day falls back", weekSettings({ week: { day: 9 } }).day, 0);
t.eq("a nonsense time falls back", weekSettings({ week: { time: "7pm" } }).time, "19:00");
t.eq("off is off", weekSettings({ week: { on: false } }).on, false);

// ---- the wheel ----
const asked = (s, entries) => entries.reduce((a, [virtue, date, score]) => answered({ ...a, virtue: { id: virtue, since: "2026-09-01" } }, { date, score }), s);
const w0 = wheel(base(), TODAY);
t.eq("eight spokes", w0.length, 8);
t.ok("all empty to begin with", w0.every((x) => x.days === 0 && x.value === null));
const w1 = wheel(asked(base(), [["patience", "2026-10-09", 2], ["patience", "2026-10-10", 1], ["honesty", "2026-10-10", 0]]), TODAY);
t.eq("a spoke is how fully it was lived", [w1.find((x) => x.id === "patience").value, w1.find((x) => x.id === "honesty").value], [0.75, 0]);
t.eq("with the days it rests on", w1.find((x) => x.id === "patience").days, 2);
t.eq("answers older than the window don't count", wheel(asked(base(), [["patience", "2026-01-01", 2]]), TODAY).find((x) => x.id === "patience").days, 0);
t.eq("the window is three months", WHEEL_DAYS, 90);

t.eq("what to practise next: a trait never practised, first in the list", suggestNext(base({ virtue: chooseVirtue("patience", "2026-10-01") }), TODAY).id, "honesty");
t.ok("with its reason", /haven't practised honesty yet/.test(suggestNext(base({ virtue: chooseVirtue("patience", "2026-10-01") }), TODAY).reason));
const every = (score) => asked(base(), ["patience", "honesty", "humility", "courage", "selfcontrol", "kindness", "gratitude", "presence"].flatMap((v) => [[v, "2026-10-08", score(v)], [v, "2026-10-09", score(v)], [v, "2026-10-10", score(v)]]));
const mixed = { ...every((v) => (v === "courage" ? 0 : 2)), virtue: chooseVirtue("patience", "2026-10-01") };
t.eq("once all are practised, the one lived least", suggestNext(mixed, TODAY).id, "courage");
t.ok("said with its number", /Courage is your lowest: 0% over 3 days/.test(suggestNext(mixed, TODAY).reason), suggestNext(mixed, TODAY).reason);
t.eq("the one being worked on isn't suggested", suggestNext({ ...mixed, virtue: chooseVirtue("courage", "2026-10-01") }, TODAY).id !== "courage", true);
t.eq("a trait with too little to judge by is not called lowest", MIN_DAYS_FOR_VERDICT, 3);

// ---- making it right ----
const bad = (o = {}) => newTemperEntry({ trigger: "tired", reaction: "raised", who: "Sam", at: NOW - DAY, ...o });
const calm = newTemperEntry({ trigger: "tired", reaction: "held", at: NOW - DAY });
t.ok("each kind of reaction has its own words", ["raised", "harsh", "cold", "sulked"].every((r) => repairDraft(bad({ reaction: r })).length > 30));
t.ok("the drafts are different", new Set(["raised", "harsh", "cold", "sulked"].map((r) => repairDraft(bad({ reaction: r, who: "" })))).size === 4);
t.eq("an apology starts with the name", repairDraft(bad()).startsWith("Hi Sam. I'm sorry I raised my voice"), true);
t.eq("without a name it just starts", repairDraft(bad({ who: "" })).startsWith("I'm sorry"), true);
t.ok("an explanation names what was going on", /I was tired, and I reacted badly/.test(repairDraft(bad(), "explain")));
t.ok("in words that read", /feeling criticised/.test(repairDraft(bad({ trigger: "criticised" }), "explain")));
t.eq("two styles", REPAIR_STYLES.map((x) => x.id), ["sorry", "explain"]);

const e1 = bad(); const e2 = bad({ at: NOW - 2 * DAY });
const log0 = [e1, e2, calm];
t.eq("a bad moment nobody has dealt with is owed, calm ones are not", owed(log0).map((e) => e.id), [e1.id, e2.id]);
const marked = withRepair(log0, e1.id, "done", { at: 99 });
t.eq("once done it is no longer owed", owed(marked).map((e) => e.id), [e2.id]);
t.eq("the entry remembers", [marked[0].repair.status, marked[0].updatedAt], ["done", 99]);
t.eq("skipping also clears it", owed(withRepair(log0, e1.id, "skipped")).length, 1);
t.eq("an open one is still owed", owed(withRepair(log0, e1.id, "open", { remindAt: NOW + DAY })).length, 2);
const morning = tomorrowMorning(NOW);
t.eq("tomorrow morning is ten", [new Date(morning).getHours(), new Date(morning).getDate()], [10, 12]);
const reminded = base({ temperLog: withRepair(log0, e1.id, "open", { remindAt: morning }) });
const rn = repairNudges(reminded, { now: NOW });
t.eq("a reminder at the time chosen", [rn.length, rn[0].at.getTime(), rn[0].ref], [1, morning, e1.id]);
t.eq("with the answers on it", rn[0].actions.map((a) => a.id), ["repaired", "repairskip"]);
t.eq("naming who", rn[0].title, "Did you make it right with Sam?");
t.eq("none once it's done", repairNudges(base({ temperLog: withRepair(log0, e1.id, "done") }), { now: NOW }), []);
t.eq("none for one not asked about", repairNudges(base({ temperLog: log0 }), { now: NOW }), []);
const five = [bad({ at: NOW - 1 * DAY }), bad({ at: NOW - 2 * DAY }), bad({ at: NOW - 3 * DAY }), calm, calm];
const fixed = five.map((e, i) => (i < 2 ? { ...e, repair: { status: "done" } } : e));
t.eq("repairs are counted in the patterns", patterns(fixed, NOW).repaired, 2);

// ---- the week ----
const habits = [habit("h1", "Walk"), habit("h2", "Read")];
const week = ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"];
const ok1 = { done: true, doneAt: 1 };
const dayLog = Object.fromEntries(week.map((d) => [d, { h1: ok1, ...(d <= "2026-10-08" ? { h2: ok1 } : {}) }]));
const full = base({
  tasks: [...habits, quit], dayLog,
  urgeLog: [
    { id: "u1", taskId: "q1", kind: "urge", outcome: "rode-out", at: NOW - DAY, date: "2026-10-10" },
    { id: "u2", taskId: "q1", kind: "urge", outcome: "rode-out", at: NOW - 2 * DAY, date: "2026-10-09" },
    { id: "l0", taskId: "q1", kind: "lapse", at: NOW - 20 * DAY, date: "2026-09-21" },
  ],
  virtue: chooseVirtue("patience", "2026-10-01"),
  virtueLog: week.slice(0, 5).map((d) => ({ id: `vl:patience:${d}`, virtue: "patience", date: d, score: 2, at: 1 })),
  examenLog: week.slice(0, 4).map((d) => ({ id: `ex:${d}`, date: d, well: `Good day ${d}`, short: "", tomorrow: "", at: 1 })),
});
const r = weekReport(full, TODAY, NOW);
t.eq("a week of seven days ending today", [r.from, r.to], ["2026-10-05", "2026-10-11"]);
t.eq("habits counted from the log", [r.habits.done, r.habits.total], [11, 14]);
t.eq("the best and worst habit", [r.habits.best.task.id, r.habits.worst.task.id], ["h1", "h2"]);
t.eq("urges ridden out are counted", r.quitting[0].rodeOut, 2);
t.eq("so are slips this week, of which there were none", r.quitting[0].slips, 0);
t.eq("days clean come from the run", r.quitting[0].clean, 20);
t.eq("the virtue's week", [r.virtue.name, r.virtue.answered, r.virtue.lived], ["Patience", 5, 5]);
t.eq("examen nights", r.examen.nights, 4);
t.ok("a line quoted back from your own examens", /^Good day 2026-10-0\d$/.test(r.examen.quote));
t.eq("the quote is the same every time the report is built", weekReport(full, TODAY, NOW).examen.quote, r.examen.quote);
t.ok("the wins are said in numbers", r.highlights.some((h) => /11 of 14 planned habits \(79%\)/.test(h)));
t.ok("a slip-free habit being quit is a win", r.highlights.some((h) => /No slips on Doomscrolling: 20 days clean/.test(h)));
t.ok("urges ridden out are a win", r.highlights.some((h) => /rode out 2 urges/.test(h)));
t.ok("and the virtue", r.highlights.some((h) => /lived patience on 5 of 7 days/.test(h)));
t.ok("and your own words", r.highlights.some((h) => h.startsWith("You wrote: “Good day")));
t.ok("no more than five", r.highlights.length <= 5);
t.eq("the next week starts on the next Monday", r.nextWeekStart, "2026-10-12");
t.eq("with nothing chosen yet", r.focus, "");
t.eq("a focus is filed under its week's Monday", focusKey("2026-10-14"), "2026-10-12");
t.eq("and found for any day in that week", focusFor(base({ weekFocus: { "2026-10-12": "Phone out of the bedroom" } }), "2026-10-15"), "Phone out of the bedroom");

// what to work on, in order of importance
t.eq("a slip comes first", weekReport({ ...full, urgeLog: [...full.urgeLog, { id: "l1", taskId: "q1", kind: "lapse", at: NOW - DAY, date: "2026-10-10" }] }, TODAY, NOW).suggestion.kind, "quit");
t.eq("then a repair still owed", weekReport({ ...full, temperLog: [bad()] }, TODAY, NOW).suggestion.kind, "repair");
t.ok("naming who", /You still owe Sam a repair/.test(weekReport({ ...full, temperLog: [bad()] }, TODAY, NOW).suggestion.text));
t.eq("then a habit that mostly didn't happen", weekReport({ ...full, dayLog: Object.fromEntries(week.map((d) => [d, d === "2026-10-05" ? { h1: ok1 } : {}])) }, TODAY, NOW).suggestion.kind, "habit");
t.eq("then an evening question mostly unanswered", weekReport({ ...full, virtueLog: full.virtueLog.slice(0, 2) }, TODAY, NOW).suggestion.kind, "answer");
t.eq("otherwise the next trait", weekReport(full, TODAY, NOW).suggestion.kind, "virtue");
t.eq("and which", weekReport(full, TODAY, NOW).suggestion.virtue, "honesty");
t.eq("an empty week still gives a report", weekReport(base(), TODAY, NOW).highlights.length, 0);
t.ok("and still a suggestion", weekReport(base(), TODAY, NOW).suggestion.text.length > 10);
t.ok("the text version has the wins and the next step", /Good day/.test(reviewText(r)) && /^Next:/m.test(reviewText(r)));

// ---- notifications ----
const used = base({ virtue: chooseVirtue("patience", "2026-10-01") });
const wn = weekNudges(used, { now: NOW, days: 13 });
t.eq("one each Sunday evening ahead", wn.map((n) => [n.date, n.at.getHours()]), [["2026-10-11", 19], ["2026-10-18", 19]]);
t.eq("once tonight's time has gone, the next is a week on, and still scheduled", weekNudges(used, { now: new Date("2026-10-11T20:00:00").getTime(), days: 7 }).map((n) => n.date), ["2026-10-18"]);
t.eq("the day can be changed", weekNudges({ ...used, settings: { week: { day: 5 } } }, { now: NOW, days: 7 }).map((n) => n.date), ["2026-10-16"]);
t.eq("off sends nothing", weekNudges({ ...used, settings: { week: { on: false } } }, { now: NOW }), []);
t.ok("it's one of the things Character sends", characterNudges(used, { now: NOW, days: 7 }).some((n) => n.kind === "week"));
t.ok("and so are repair reminders", characterNudges({ ...used, temperLog: reminded.temperLog }, { now: NOW, days: 3 }).some((n) => n.kind === "repair"));

// ---- Today's prompt ----
t.eq("ready on its day, after its time", reviewReady(used, new Date("2026-10-11T19:30:00")), true);
t.eq("not before", reviewReady(used, new Date("2026-10-11T18:00:00")), false);
t.eq("not on another day", reviewReady(used, new Date("2026-10-12T19:30:00")), false);
t.eq("not once a focus is chosen for next week", reviewReady({ ...used, weekFocus: { "2026-10-12": "x" } }, new Date("2026-10-11T19:30:00")), false);
t.eq("not when switched off", reviewReady({ ...used, settings: { week: { on: false } } }, new Date("2026-10-11T19:30:00")), false);
