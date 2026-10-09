import { suite } from "./harness.mjs";
import { DEFAULT_EXAMEN, QUESTIONS, entryId, examenFor, examenNudges, examenSettings, examenStats, saved, todayPrompt } from "../src/lib/examen.js";
import { characterNudges, characterOn, engaged, mergeCharacterNudges } from "../src/lib/character.js";
import { chooseVirtue } from "../src/lib/virtue.js";
import { emptyState } from "../src/lib/migrate.js";
import { mergeStates } from "../src/lib/merge.js";
import { summarise } from "../src/lib/backup.js";

const t = suite("examen");
const NOW = new Date("2026-10-08T10:00:00").getTime();

t.eq("three questions", QUESTIONS.map((q) => q.id), ["well", "short", "tomorrow"]);
t.eq("defaults", examenSettings({}), DEFAULT_EXAMEN);
t.eq("a good time is kept", examenSettings({ examen: { time: "22:15" } }).time, "22:15");
t.eq("a silly time falls back", examenSettings({ examen: { time: "27:00" } }).time, "21:30");
t.eq("off is off", examenSettings({ examen: { on: false } }).on, false);

// ---- saving ----
const s1 = saved(emptyState(), { date: "2026-10-08", well: "  Called mum ", short: "Snapped at lunch", tomorrow: "Walk first", at: 5 });
t.eq("one entry per night, by date", s1.examenLog.map((e) => e.id), ["ex:2026-10-08"]);
t.eq("trimmed", s1.examenLog[0].well, "Called mum");
t.eq("found again", examenFor(s1, "2026-10-08").short, "Snapped at lunch");
t.eq("saving the same night again replaces it", saved(s1, { date: "2026-10-08", well: "Rewritten", at: 9 }).examenLog.length, 1);
t.eq("and keeps the new words", saved(s1, { date: "2026-10-08", well: "Rewritten", at: 9 }).examenLog[0].well, "Rewritten");
t.eq("one answer is enough", saved(emptyState(), { date: "2026-10-08", short: "Too much phone" }).examenLog.length, 1);
t.eq("nothing written saves nothing", saved(emptyState(), { date: "2026-10-08", well: "  ", short: "", tomorrow: "" }), emptyState());
t.eq("long answers are cut", saved(emptyState(), { date: "2026-10-08", well: "x".repeat(900) }).examenLog[0].well.length, 400);
t.eq("the id is predictable", entryId("2026-01-02"), "ex:2026-01-02");

// ---- how it's going ----
const nights = (dates) => dates.reduce((s, d) => saved(s, { date: d, well: "ok" }), emptyState());
t.eq("a run ending last night counts", examenStats(nights(["2026-10-05", "2026-10-06", "2026-10-07"]), "2026-10-08").streak, 3);
t.eq("tonight extends it", examenStats(nights(["2026-10-06", "2026-10-07", "2026-10-08"]), "2026-10-08").streak, 3);
t.eq("a missed night ends it", examenStats(nights(["2026-10-05", "2026-10-07"]), "2026-10-08").streak, 1);
t.eq("nights in the last week", examenStats(nights(["2026-10-02", "2026-10-03", "2026-10-07", "2026-09-20"]), "2026-10-08").nights, 3);

// ---- a prompt from the day ----
const L = { isCalm: (e) => e.reaction === "held", reaction: (r) => ({ raised: "Raised my voice" }[r]) };
const hot = { ...emptyState(), temperLog: [{ id: "a", date: "2026-10-08", reaction: "raised", who: "my brother" }] };
t.eq("a bad moment today becomes a prompt", todayPrompt(hot, "2026-10-08", L), "Earlier you logged: raised my voice with my brother.");
t.eq("calm moments don't", todayPrompt({ ...emptyState(), temperLog: [{ id: "a", date: "2026-10-08", reaction: "held" }] }, "2026-10-08", L), null);
t.eq("nor does another day", todayPrompt(hot, "2026-10-09", L), null);

// ---- notifications ----
const used = { ...emptyState(), virtue: chooseVirtue("patience", "2026-10-01") };
const ex = examenNudges(used, { now: NOW, days: 3 });
t.eq("one a night, at the set time", ex.map((e) => [e.date, e.at.getHours() * 60 + e.at.getMinutes()]), [["2026-10-08", 1290], ["2026-10-09", 1290], ["2026-10-10", 1290]]);
t.eq("with a button to open it", ex[0].actions.map((a) => a.id), ["open"]);
t.eq("a night already written is not asked about", examenNudges(saved(used, { date: "2026-10-08", well: "ok" }), { now: NOW, days: 2 }).map((e) => e.date), ["2026-10-09"]);
t.eq("a time already past is not scheduled", examenNudges(used, { now: new Date("2026-10-08T23:00:00").getTime(), days: 2 }).map((e) => e.date), ["2026-10-09"]);
t.eq("off sends nothing", examenNudges({ ...used, settings: { examen: { on: false } } }, { now: NOW }), []);

// ---- Character as a whole ----
t.eq("nothing used means not engaged", engaged(emptyState()), false);
t.eq("a virtue engages it", engaged(used), true);
t.eq("so does a letter, an examen or a temper entry", [engaged({ ...emptyState(), letters: [{}] }), engaged(s1), engaged({ ...emptyState(), temperLog: [{}] })], [true, true, true]);
t.eq("so does a chosen weekly focus", engaged({ ...emptyState(), weekFocus: { "2026-10-05": "x" } }), true);
t.eq("a person who has never used it gets nothing", characterNudges(emptyState(), { now: NOW }), []);
const kinds = characterNudges({ ...used, letters: [{ id: "l", kind: "later", body: "x", createdAt: NOW - 5 * 86400000, openAt: NOW + 2 * 86400000, openedAt: null }] }, { now: NOW, days: 3 }).map((n) => n.kind);
t.ok("the pieces are joined", kinds.includes("virtue") && kinds.includes("virtue-check") && kinds.includes("examen") && kinds.includes("letter"), kinds);
t.eq("turning Character off turns all of it off", characterNudges({ ...used, settings: { virtue: { on: false } } }, { now: NOW }), []);
t.eq("on by default", characterOn({}), true);
const merged = mergeCharacterNudges(used, [{ id: "x", kind: "habits", at: new Date("2026-10-08T12:00:00") }], 1, NOW);
t.ok("joined to the ordinary ones in time order", merged.every((n, i) => i === 0 || n.at >= merged[i - 1].at) && merged.some((n) => n.kind === "habits"));

// ---- kept ----
t.eq("a fresh state has the new fields", [emptyState().letters, emptyState().examenLog, emptyState().weekFocus], [[], [], {}]);
t.eq("two devices' examens are both kept", mergeStates(nights(["2026-10-05"]), nights(["2026-10-06"])).examenLog.length, 2);
t.eq("weekly focus merges per week", Object.keys(mergeStates({ ...emptyState(), weekFocus: { a: "1" } }, { ...emptyState(), weekFocus: { b: "2" } }).weekFocus).sort(), ["a", "b"]);
t.ok("counted in the backup summary", summarise({ letters: [{}], examenLog: [{}, {}] }).filter(([l]) => /Letters|examen/i.test(l)).length === 2);
