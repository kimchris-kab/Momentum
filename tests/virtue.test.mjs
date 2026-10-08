import { suite } from "./harness.mjs";
import {
  DEFAULT_VIRTUE, SUGGEST_AFTER_DAYS, VIRTUES, VIRTUE_BY_ID, activeVirtue, answered, chooseVirtue, dayNumber,
  entryFor, entryId, mergeVirtueNudges, practiceFor, scoreFromAction, stats, suggestMove, virtueNudges, virtueSettings,
} from "../src/lib/virtue.js";
import { emptyState } from "../src/lib/migrate.js";
import { mergeStates } from "../src/lib/merge.js";
import { summarise } from "../src/lib/backup.js";

const t = suite("virtue");
const state = (patch = {}) => ({ ...emptyState(), virtue: chooseVirtue("patience", "2026-10-01"), ...patch });
const NOW = new Date("2026-10-08T06:00:00").getTime();

// ---- the library ----
t.eq("there are eight virtues", VIRTUES.length, 8);
t.ok("each has ten practices, a reason and a line", VIRTUES.every((v) => v.practices.length === 10 && v.why.length > 40 && v.line.length > 10));
t.ok("ids are unique", new Set(VIRTUES.map((v) => v.id)).size === VIRTUES.length);
t.ok("no practice is duplicated within a virtue", VIRTUES.every((v) => new Set(v.practices).size === v.practices.length));
t.ok("every practice is a sentence of sensible length", VIRTUES.every((v) => v.practices.every((p) => p.length > 20 && p.length < 130 && /[.?]$/.test(p))));

// ---- choosing ----
t.eq("choosing a real virtue records the day", chooseVirtue("honesty", "2026-10-02"), { id: "honesty", since: "2026-10-02" });
t.eq("choosing a made-up one is nothing", chooseVirtue("nonsense", "2026-10-02"), null);
t.eq("none chosen means no active virtue", activeVirtue(emptyState()), null);
t.eq("a saved id this build doesn't know is no active virtue", activeVirtue({ virtue: { id: "gone", since: "2026-10-01" } }), null);
t.eq("the active virtue carries the day it began", activeVirtue(state()).since, "2026-10-01");

// ---- the day's practice ----
const active = activeVirtue(state());
t.eq("the first day is day 1", dayNumber(active, "2026-10-01"), 1);
t.eq("a week later is day 8", dayNumber(active, "2026-10-08"), 8);
t.eq("a date before it began is still day 1", dayNumber(active, "2026-09-20"), 1);
t.eq("asking twice on one day gives the same practice", practiceFor(active, "2026-10-08"), practiceFor(active, "2026-10-08"));
const ten = Array.from({ length: 10 }, (_, i) => practiceFor(active, `2026-10-${String(i + 1).padStart(2, "0")}`));
t.eq("ten days in a row use all ten practices once", new Set(ten).size, 10);
t.eq("then it starts over in the same order", practiceFor(active, "2026-10-11"), ten[0]);
t.ok("a different start gives a different order", ten.join() !== Array.from({ length: 10 }, (_, i) => practiceFor({ ...active, since: "2026-11-01" }, `2026-11-${String(i + 1).padStart(2, "0")}`)).join());

// ---- the evening answer ----
const s1 = answered(state(), { date: "2026-10-08", score: 2, at: 5 });
t.eq("an answer is recorded under the virtue and day", s1.virtueLog[0], { id: "vl:patience:2026-10-08", virtue: "patience", date: "2026-10-08", score: 2, at: 5 });
t.eq("answering again the same day replaces it", answered(s1, { date: "2026-10-08", score: 0, at: 9 }).virtueLog.map((e) => e.score), [0]);
t.eq("a different day is a different record", answered(s1, { date: "2026-10-09", score: 1 }).virtueLog.length, 2);
t.eq("a nonsense score changes nothing", answered(state(), { date: "2026-10-08", score: 7 }), state());
t.eq("nothing is recorded with no virtue chosen", answered(emptyState(), { date: "2026-10-08", score: 2 }).virtueLog, []);
t.eq("an answer can be found again", entryFor(s1, "patience", "2026-10-08").score, 2);
t.eq("the id is predictable", entryId("honesty", "2026-01-02"), "vl:honesty:2026-01-02");
t.eq("a notification button reads as a score", ["lived", "partly", "missed", "open", undefined].map(scoreFromAction), [2, 1, 0, null, null]);

// ---- how it's going ----
const log = (pairs) => pairs.reduce((s, [d, sc]) => answered(s, { date: d, score: sc }), state());
let s2 = log([["2026-10-05", 2], ["2026-10-06", 1], ["2026-10-07", 2]]);
t.eq("a streak counts answers of lived or partly ending yesterday", stats(s2, "patience", "2026-10-08").streak, 3);
t.eq("answering today extends it", stats(answered(s2, { date: "2026-10-08", score: 2 }), "patience", "2026-10-08").streak, 4);
t.eq("a missed day ends it", stats(log([["2026-10-05", 2], ["2026-10-06", 0], ["2026-10-07", 2]]), "patience", "2026-10-08").streak, 1);
t.eq("an unanswered day also ends it", stats(log([["2026-10-05", 2], ["2026-10-07", 2]]), "patience", "2026-10-08").streak, 1);
t.eq("the week has seven days, the last being today", stats(s2, "patience", "2026-10-08").week.map((d) => d.date).slice(-1)[0], "2026-10-08");
t.eq("with seven slots", stats(s2, "patience", "2026-10-08").week.length, 7);
t.eq("unanswered days are null, not zero", stats(s2, "patience", "2026-10-08").week.slice(0, 3).map((d) => d.score), [null, null, null]);
t.eq("the average is how fully it was lived", stats(log([["2026-10-06", 2], ["2026-10-07", 0]]), "patience", "2026-10-08").average, 0.5);
t.eq("no answers means no average", stats(state(), "patience", "2026-10-08").average, null);
t.eq("another virtue's answers are not counted", stats(s2, "honesty", "2026-10-08").days, 0);

// ---- time to move on ----
t.eq("not suggested in the first week", suggestMove(state({ virtue: chooseVirtue("patience", "2026-10-05") }), "2026-10-08"), null);
t.ok("suggested after it", suggestMove(state({ virtue: chooseVirtue("patience", "2026-09-30") }), "2026-10-08") !== null);
t.eq("the week it takes is the constant", SUGGEST_AFTER_DAYS, 7);

// ---- settings ----
t.eq("defaults", virtueSettings({}), DEFAULT_VIRTUE);
t.eq("good times are kept", virtueSettings({ virtue: { morning: "07:15", evening: "21:00" } }).morning, "07:15");
t.eq("an evening too close to the morning falls back", virtueSettings({ virtue: { morning: "08:00", evening: "09:00" } }).evening, "20:30");
t.eq("silly times fall back", virtueSettings({ virtue: { morning: "25:99", evening: "x" } }), DEFAULT_VIRTUE);
t.eq("off is off", virtueSettings({ virtue: { on: false } }).on, false);

// ---- notifications ----
const items = virtueNudges(state(), { now: NOW, days: 3 });
t.eq("a morning practice and an evening question each day", items.map((i) => i.kind), ["virtue", "virtue-check", "virtue", "virtue-check", "virtue", "virtue-check"]);
t.ok("in time order", items.every((n, i) => i === 0 || n.at >= items[i - 1].at));
t.eq("the morning one carries the day's practice", items[0].body, practiceFor(activeVirtue(state()), "2026-10-08"));
t.eq("and says which day it is", items[0].title, "Patience · day 8");
t.eq("the evening one asks the question", items[1].title, "Did you live patience today?");
t.eq("with three answers on the notification", items[1].actions.map((a) => a.id), ["lived", "partly", "missed"]);
t.eq("morning is at the set time", items[0].at.getHours() * 60 + items[0].at.getMinutes(), 480);
t.eq("an answered day has no evening question", virtueNudges(answered(state(), { date: "2026-10-08", score: 2 }), { now: NOW, days: 1 }).map((i) => i.kind), ["virtue"]);
t.eq("nothing for a moment already past", virtueNudges(state(), { now: new Date("2026-10-08T21:00:00").getTime(), days: 1 }), []);
t.eq("nothing when switched off", virtueNudges(state({ settings: { virtue: { on: false } } }), { now: NOW }), []);
t.eq("nothing when notifications are off", virtueNudges(state({ settings: { virtue: { notify: false } } }), { now: NOW }), []);
t.eq("nothing with no virtue chosen", virtueNudges(emptyState(), { now: NOW }), []);
t.eq("ids are stable so rescheduling replaces rather than duplicates", virtueNudges(state(), { now: NOW, days: 1 }).map((i) => i.id), ["virtue:2026-10-08:practice", "virtue:2026-10-08:check"]);
const mixed = mergeVirtueNudges(state(), [{ id: "x", kind: "habits", at: new Date("2026-10-08T12:00:00") }], 1, NOW);
t.eq("joins the ordinary ones in time order", mixed.map((i) => i.kind), ["virtue", "habits", "virtue-check"]);

// ---- saved, merged, counted ----
t.ok("a fresh state has the new fields", emptyState().virtue === null && Array.isArray(emptyState().virtueLog) && Array.isArray(emptyState().temperLog));
const a = answered(state(), { date: "2026-10-07", score: 2, at: 1 });
const b = answered(state(), { date: "2026-10-08", score: 1, at: 2 });
t.eq("two devices' answers are both kept", mergeStates(a, b).virtueLog.map((e) => e.date).sort(), ["2026-10-07", "2026-10-08"]);
const edited = answered(a, { date: "2026-10-07", score: 0, at: 99 });
t.eq("an answer changed later wins over the older copy", mergeStates(a, edited).virtueLog[0].score, 0);
t.ok("the backup summary counts them", summarise({ virtueLog: [{}, {}], temperLog: [{}] }).some(([l, n]) => /Character/.test(l) && n === 2));
t.ok("and the temper log", summarise({ temperLog: [{}] }).some(([l, n]) => /Temper/.test(l) && n === 1));
t.ok("every virtue is findable by id", VIRTUES.every((v) => VIRTUE_BY_ID[v.id] === v));
