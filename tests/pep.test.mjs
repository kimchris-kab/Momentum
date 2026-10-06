import { suite } from "./harness.mjs";
import {
  DEFAULT_PEP, PEP_MIN_DAYS, cleanDays, newPepNote, notesFor, pepSettings, toMinutes, writeCandidate,
} from "../src/lib/pep.js";
import { pepPlan, widgetNotes } from "../src/lib/pepPlan.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";

const t = suite("pep");

// Notes to yourself. Asked about once a day, only once a habit has gone three days clean and
// not on a day it slipped; sent back at random moments inside the person's hours, the same
// moments every time the plan is rebuilt; and shown on the widget in their own words.
const DAY = 86400000;
const EVERY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const NOW = new Date("2026-10-06T10:00:00").getTime();
const dstr = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const TODAY = dstr(NOW);
const quit = (id, over = {}) => newTask({
  id, kind: "break", text: id, startDate: "2026-09-01", createdAt: new Date("2026-09-01T00:00:00").getTime(),
  recurrence: weeklyRule(EVERY), ...over,
});
const slip = (taskId, at) => ({ id: `s-${taskId}-${at}`, taskId, kind: "lapse", at, date: dstr(at) });
const note = (taskId, text, daysAgo, day = 0) => newPepNote({ taskId, text, at: NOW - daysAgo * DAY, day });
const st = (patch = {}) => ({ tasks: [quit("a")], dayLog: {}, urgeLog: [], pepNotes: [], settings: {}, ...patch });

t.group("settings");
{
  t.eq("the defaults", pepSettings(undefined), { on: true, write: true, remind: true, from: "09:00", to: "21:00" });
  t.eq("exported default matches", DEFAULT_PEP, pepSettings({}));
  t.eq("hours can be chosen", [pepSettings({ pep: { from: "08:30", to: "22:15" } }).from, pepSettings({ pep: { from: "08:30", to: "22:15" } }).to], ["08:30", "22:15"]);
  t.eq("a garbled time falls back", pepSettings({ pep: { from: "9am", to: "late" } }).from, "09:00");
  t.eq("a window under two hours is put right, since there'd be nowhere to put two kinds of notification", [pepSettings({ pep: { from: "10:00", to: "11:00" } }).from, pepSettings({ pep: { from: "10:00", to: "11:00" } }).to], ["09:00", "21:00"]);
  t.eq("a window that runs backwards too", pepSettings({ pep: { from: "21:00", to: "09:00" } }).from, "09:00");
  t.ok("each kind can be switched off, and only by saying so", pepSettings({ pep: { write: false } }).write === false && pepSettings({ pep: { write: undefined } }).write === true && pepSettings({ pep: { remind: false } }).remind === false && pepSettings({ pep: { on: false } }).on === false);
  t.eq("three days is the line", PEP_MIN_DAYS, 3);
  t.eq("minutes", [toMinutes("00:00"), toMinutes("09:30"), toMinutes("23:59")], [0, 570, 1439]);
}

t.group("days clean");
{
  const a = quit("a");
  t.eq("from when the habit began, with no slip", cleanDays(a, [], NOW), 35);
  t.eq("from the last slip", cleanDays(a, [slip("a", NOW - 4.5 * DAY)], NOW), 4);
  t.eq("only whole days count", cleanDays(a, [slip("a", NOW - (3 * DAY - 1000))], NOW), 2);
  t.eq("exactly three days is three", cleanDays(a, [slip("a", NOW - 3 * DAY)], NOW), 3);
  t.eq("another habit's slip isn't this one's", cleanDays(a, [slip("b", NOW - DAY)], NOW), 35);
  t.eq("never negative", cleanDays(a, [slip("a", NOW + DAY)], NOW), 0);
  t.eq("a habit with no known start", cleanDays(quit("z", { startDate: null, createdAt: 0 }), [], NOW), 0);
}

t.group("who gets asked today");
{
  const slip4 = slip("a", NOW - 4 * DAY);
  t.eq("a habit three or more days clean", writeCandidate(st({ urgeLog: [slip4] }), NOW)?.day, 4);
  t.eq("...is the one asked about", writeCandidate(st({ urgeLog: [slip4] }), NOW)?.task.id, "a");
  t.eq("two days clean is too soon", writeCandidate(st({ urgeLog: [slip("a", NOW - 2 * DAY)] }), NOW), null);
  t.eq("exactly three days is enough", writeCandidate(st({ urgeLog: [slip("a", NOW - 3 * DAY)] }), NOW)?.day, 3);
  t.eq("a note already written today means no more asking", writeCandidate(st({ urgeLog: [slip4], pepNotes: [note("a", "x", 0)] }), NOW), null);
  t.ok("a note from yesterday doesn't", writeCandidate(st({ urgeLog: [slip4], pepNotes: [note("a", "x", 1)] }), NOW) !== null);
  t.eq("a slip today means not today", writeCandidate(st({ urgeLog: [slip4, slip("a", NOW - 3600000)], dayLog: { [TODAY]: { a: { slipped: true } } } }), NOW), null);
  t.eq("a habit being built isn't asked about", writeCandidate(st({ tasks: [quit("a", { kind: "build" })] }), NOW), null);
  t.eq("an archived one isn't", writeCandidate(st({ tasks: [quit("a", { archivedAt: 1 })] }), NOW), null);
  t.eq("a finished one isn't", writeCandidate(st({ tasks: [quit("a", { endedOn: "2026-10-01" })] }), NOW), null);

  const two = st({ tasks: [quit("a"), quit("b", { startDate: "2026-09-20", createdAt: new Date("2026-09-20T00:00:00").getTime() })] });
  t.eq("with two, the longer run is asked about", writeCandidate(two, NOW)?.task.id, "a");
  t.eq("...unless the other is pinned", writeCandidate({ ...two, tasks: [two.tasks[0], { ...two.tasks[1], shadePin: 5 }] }, NOW)?.task.id, "b");
  t.eq("a pinned habit that isn't eligible yet doesn't block the other", writeCandidate({ ...two, urgeLog: [slip("b", NOW - DAY)], tasks: [two.tasks[0], { ...two.tasks[1], shadePin: 5 }] }, NOW)?.task.id, "a");
  t.eq("one habit slipping today doesn't stop the other being asked", writeCandidate({ ...two, dayLog: { [TODAY]: { a: { slipped: true } } } }, NOW)?.task.id, "b");
}

t.group("the notes");
{
  const n = newPepNote({ taskId: "a", text: "  I walked instead.  ", at: NOW, day: 4 });
  t.eq("trimmed, dated, and remembers which day of the run it was", [n.text, n.date, n.day, n.taskId], ["I walked instead.", TODAY, 4, "a"]);
  t.ok("each has its own id", newPepNote({ taskId: "a", text: "x", at: NOW }).id !== newPepNote({ taskId: "a", text: "x", at: NOW }).id);
  t.eq("long ones are cut to a sensible length", newPepNote({ taskId: "a", text: "x".repeat(500) }).text.length, 280);
  const s = st({ pepNotes: [note("a", "old", 5), note("b", "other", 1), note("a", "new", 1)] });
  t.eq("a habit's notes, newest first", notesFor(s, "a").map((x) => x.text), ["new", "old"]);
  t.eq("all of them", notesFor(s).length, 3);
}

t.group("the plan");
{
  const slip4 = slip("a", NOW - 4 * DAY);
  const base = st({ urgeLog: [slip4], pepNotes: [note("a", "I walked instead.", 2, 2), note("a", "I told my sister.", 1, 3)] });
  const plan = pepPlan(base, NOW);
  const writes = plan.filter((p) => p.kind === "write"), reminds = plan.filter((p) => p.kind === "remind");
  t.ok("a week of reminders, less any whose moment has passed today", reminds.length >= 6 && reminds.length <= 7, reminds.length);
  t.ok("a writing prompt each day, the same way", writes.length >= 6 && writes.length <= 7, writes.length);
  t.ok("in time order", plan.every((p, i) => i === 0 || p.at >= plan[i - 1].at));
  t.ok("nothing in the past", plan.every((p) => p.at > NOW));
  t.ok("ids are per day and kind, so a rebuilt plan replaces rather than adds", new Set(plan.map((p) => p.id)).size === plan.length && plan.every((p) => /^pep:\d{4}-\d\d-\d\d:(write|remind)$/.test(p.id)));

  const mins = (p) => { const d = new Date(p.at); return d.getHours() * 60 + d.getMinutes(); };
  t.ok("every one is inside the person's hours", plan.every((p) => mins(p) >= 540 && mins(p) < 1260), plan.map(mins));
  t.ok("reminders come in the first part of the day", reminds.every((p) => mins(p) < 540 + 0.6 * 720), reminds.map(mins));
  t.ok("the ask to write comes toward the end", writes.every((p) => mins(p) >= 540 + 0.6 * 720 - 1), writes.map(mins));
  t.ok("the times differ from day to day", new Set(reminds.map(mins)).size > 3 && new Set(writes.map(mins)).size > 3, [reminds.map(mins), writes.map(mins)]);

  const custom = pepPlan({ ...base, settings: { pep: { from: "07:00", to: "10:00" } } }, new Date("2026-10-06T00:30:00").getTime());
  t.ok("a narrower window is respected", custom.every((p) => { const m = mins(p); return m >= 420 && m < 600; }), custom.map(mins));

  t.eq("the same plan every time it's asked", pepPlan(base, NOW), pepPlan(base, NOW));
  const added = pepPlan({ ...base, pepNotes: [...base.pepNotes, note("a", "A third note", 0, 4)] }, NOW);
  t.eq("writing a note doesn't move the writing prompts for other days", added.filter((p) => p.kind === "write" && !p.id.includes(TODAY)).map((p) => [p.id, p.at]), writes.filter((p) => !p.id.includes(TODAY)).map((p) => [p.id, p.at]));
  const none = pepPlan({ ...base, pepNotes: [] }, NOW);
  t.eq("...and having no notes doesn't move them either", none.filter((p) => p.kind === "write").map((p) => [p.id, p.at]), writes.map((p) => [p.id, p.at]));
  t.eq("no notes, no reminders", none.filter((p) => p.kind === "remind").length, 0);

  const r = reminds[0];
  t.ok("a reminder carries the note's own words", ["I walked instead.", "I told my sister."].includes(r.body), r.body);
  t.ok("...and says which day of the run it was written on", /^You, on day [23]$/.test(r.title), r.title);
  t.ok("it is about the habit the note was", r.taskId === "a");
  t.ok("a note with no day just says it's from you", pepPlan(st({ urgeLog: [slip4], pepNotes: [note("a", "plain", 1, 0)] }), NOW).find((p) => p.kind === "remind").title === "A note from you");
  t.ok("two notes aren't sent on consecutive days when there's a choice", reminds.every((p, i) => i === 0 || p.body !== reminds[i - 1].body), reminds.map((p) => p.body));
  t.ok("both get used over the week", new Set(reminds.map((p) => p.body)).size === 2);

  const w = writes[0];
  t.ok("a writing prompt names the day and the habit", /^Day \d+ clean · a$/.test(w.title), w.title);
  t.ok("...and asks for one line", w.body.length > 10 && w.body.length < 80, w.body);
  t.eq("it's about that habit", w.taskId, "a");
  t.ok("the day grows as the run does", writes.length > 2 && Number(writes[writes.length - 1].title.match(/Day (\d+)/)[1]) > Number(writes[0].title.match(/Day (\d+)/)[1]));

  t.eq("switched off, nothing", pepPlan({ ...base, settings: { pep: { on: false } } }, NOW), []);
  t.eq("no writing prompts when that's off", pepPlan({ ...base, settings: { pep: { write: false } } }, NOW).filter((p) => p.kind === "write").length, 0);
  t.eq("no reminders when that's off", pepPlan({ ...base, settings: { pep: { remind: false } } }, NOW).filter((p) => p.kind === "remind").length, 0);
  t.ok("the other kind carries on", pepPlan({ ...base, settings: { pep: { write: false } } }, NOW).filter((p) => p.kind === "remind").length >= 6);
}

t.group("when to start asking");
{
  // Slipped yesterday: day 0. Day 3 is three days on.
  const s = st({ urgeLog: [slip("a", new Date("2026-10-05T12:00:00").getTime())] });
  const w = pepPlan(s, NOW).filter((p) => p.kind === "write");
  t.ok("nothing is asked for until the run is three days old", w.every((p) => p.at >= new Date("2026-10-08T12:00:00").getTime()), w.map((p) => p.id));
  t.ok("...and then it is", w.length >= 3 && w[0].id === "pep:2026-10-08:write", w.map((p) => p.id));
  t.ok("the run's age is judged at the time of asking, not the start of the day", (() => {
    const late = st({ urgeLog: [slip("a", new Date("2026-10-05T20:00:00").getTime())] });
    const ws = pepPlan(late, NOW).filter((p) => p.kind === "write");
    // 8 Oct 20:00 is exactly 3 days on; earlier on the 8th it's only two and a bit.
    return ws.length > 0 && ws.every((p) => p.at >= new Date("2026-10-08T20:00:00").getTime());
  })());
  t.eq("a slip today means no ask today", pepPlan(st({ urgeLog: [slip("a", NOW - 4 * DAY), slip("a", NOW - 3600000)], dayLog: { [TODAY]: { a: { slipped: true } } } }), NOW).filter((p) => p.kind === "write").map((p) => p.id.slice(4, 14)).includes(TODAY), false);
  t.eq("a day marked slipped without a logged slip (older data) still means no ask today",
    pepPlan(st({ dayLog: { [TODAY]: { a: { slipped: true } } } }), NOW).some((p) => p.id === `pep:${TODAY}:write`), false);
  t.ok("...but the days after it are asked", pepPlan(st({ dayLog: { [TODAY]: { a: { slipped: true } } } }), NOW).some((p) => p.id.includes("2026-10-07") && p.kind === "write"));
  t.eq("having written today, no more asking today", pepPlan(st({ urgeLog: [slip("a", NOW - 4 * DAY)], pepNotes: [note("a", "done", 0, 4)] }), NOW).filter((p) => p.kind === "write").map((p) => p.id).includes(`pep:${TODAY}:write`), false);
}

t.group("the widget");
{
  const base = st({
    tasks: [quit("a", { calmNote: { why: "I want my evenings back." } }), quit("b"), quit("c")],
    pepNotes: [note("a", "I walked instead.", 3), note("b", "Told a friend.", 2), note("c", "Not on the widget", 1), note("a", "Phone stayed in the kitchen.", 1)],
  });
  const lines = widgetNotes(base, NOW);
  t.ok("it carries your own words", lines.includes("I walked instead.") && lines.includes("Phone stayed in the kitchen."));
  t.ok("and the reason you wrote when calm", lines.includes("I want my evenings back."));
  t.ok("only for the habits the widget shows", !lines.includes("Not on the widget"));
  t.ok("the same each time on one day", JSON.stringify(widgetNotes(base, NOW)) === JSON.stringify(widgetNotes(base, NOW + 3600000)));
  t.ok("a different order another day", JSON.stringify(widgetNotes(base, NOW)) !== JSON.stringify(widgetNotes(base, NOW + DAY)) || JSON.stringify(widgetNotes(base, NOW)) !== JSON.stringify(widgetNotes(base, NOW + 2 * DAY)));
  t.eq("nothing to say until there's something", widgetNotes(st(), NOW), []);
  t.ok("no more than six", widgetNotes(st({ pepNotes: Array.from({ length: 12 }, (_, i) => note("a", `n${i}`, i)) }), NOW).length === 6);
  t.ok("the newest are the ones kept", (() => {
    const l = widgetNotes(st({ pepNotes: Array.from({ length: 12 }, (_, i) => note("a", `n${i}`, i)) }), NOW);
    return l.every((x) => Number(x.slice(1)) < 6);
  })());
  t.ok("a long one is cut so it fits", widgetNotes(st({ pepNotes: [note("a", "word ".repeat(60), 1)] }), NOW)[0].length <= 110);
  t.ok("a repeated line shows once", widgetNotes(st({ pepNotes: [note("a", "same", 1), note("a", "same", 2)] }), NOW).length === 1);
  t.ok("a finished habit's notes aren't shown", widgetNotes(st({ tasks: [quit("a", { endedOn: "2026-10-01" })], pepNotes: [note("a", "gone", 1)] }), NOW).length === 0);
}
