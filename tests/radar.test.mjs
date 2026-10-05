import { atDate, suite } from "./harness.mjs";
import { MIN_EVENTS, hardDay, intensity, radar, radarLine, rescueFor, usualHour, usualWindow, weekdayRecord } from "../src/lib/radar.js";
import { widgetSnapshot } from "../src/lib/widget.js";
import { addDays } from "../src/lib/date.js";
import { weeklyRule } from "../src/lib/tasks.js";
import { DEFAULT_NOTIFY, NUDGE_KINDS, buildNudges } from "../src/lib/nudges.js";

const t = suite("radar");

// The radar says how a moment compares with the rest of your own day, from your own log, and says
// nothing until the log can support it. These test that restraint as much as the arithmetic.
const TODAY = "2026-10-16"; // a Friday
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const quit = (patch = {}) => ({ id: "q1", kind: "break", text: "Doomscrolling", recurrence: weeklyRule(EVERY_DAY), startDate: "2026-01-01", createdAt: 1, ...patch });
const at = (daysAgo, hhmm) => { const d = new Date(`${TODAY}T${hhmm}:00`); d.setDate(d.getDate() - daysAgo); return d.getTime(); };
const ev = (daysAgo, hhmm, extra = {}) => ({ id: `e-${daysAgo}-${hhmm}`, taskId: "q1", kind: "urge", outcome: "rode-out", at: at(daysAgo, hhmm), date: "x", ...extra });
// Eight evening urges, 21:00–21:50, on eight different days (none on a Friday, to keep weekday out of it).
const evenings = [1, 2, 3, 4, 6, 8, 9, 10].map((d, i) => ev(d, i % 2 ? "21:40" : "21:10"));
const state = (patch = {}) => ({ tasks: [quit()], dayLog: {}, urgeLog: evenings, checkins: [], ...patch });
const NOW = (hhmm) => new Date(`${TODAY}T${hhmm}:00`).getTime();

t.group("saying nothing until there's something to say");
atDate(`${TODAY}T12:00:00`, () => {
  const few = radar(quit(), state({ urgeLog: evenings.slice(0, 4) }), NOW("21:15"));
  t.eq("four urges aren't enough", [few.level, few.have, few.need], ["unknown", 4, MIN_EVENTS]);
  t.eq("...and it gives no reasons", few.reasons, []);
  t.eq("an empty log is unknown too", radar(quit(), state({ urgeLog: [] }), NOW("21:15")).level, "unknown");
  t.eq("another habit's urges don't count", radar(quit({ id: "x" }), state(), NOW("21:15")).level, "unknown");
  t.eq("nothing to show on the line", radarLine(few), null);
  t.eq("urges from months ago are not this month's pattern", radar(quit(), state({ urgeLog: [10, 11, 12, 13, 14, 15].map((d) => ev(d + 90, "21:10")) }), NOW("21:15")).level, "unknown");
});

t.group("the shape of a day");
{
  const { rel, total } = intensity(evenings, NOW("12:00"));
  t.eq("it counts what's there", total, 8);
  t.eq("48 half-hours", rel.length, 48);
  t.ok("the busy stretch is far above average", rel[42] > 5, rel[42]);
  t.ok("the small hours are nowhere near it", rel[6] === 0 && rel[12] === 0, [rel[6], rel[12]]);
  t.near("and it averages out to 1, by construction", rel.reduce((a, b) => a + b, 0) / 48, 1, 0.001);
  t.ok("smoothing means a half-hour either side still registers", rel[41] > 1 && rel[44] > 1);
  t.eq("no events, no shape", intensity([], NOW("12:00")).total, 0);
}

t.group("scattered urges make no window");
atDate(`${TODAY}T12:00:00`, () => {
  // Eight urges, no two in the same part of the day. Against a tiny average each one looks like a
  // spike, so without a check each would become a "risk window" backed by a single urge.
  const scattered = ["03:10", "07:20", "10:40", "13:50", "16:10", "19:30", "22:00", "23:40"].map((h, i) => ({ ...ev(i + 1, h), id: `sc${i}` }));
  for (const hhmm of ["03:15", "10:45", "13:55", "19:35", "22:05"]) {
    const r = radar(quit(), state({ urgeLog: scattered }), NOW(hhmm));
    t.ok(`at ${hhmm} it finds no pattern, and so claims none`, r.level === "calm" && r.startAt === null && r.reasons.length === 0, r);
  }
  t.eq("two urges together aren't a pattern either", radar(quit(), state({ urgeLog: [...scattered.slice(0, 5), { ...ev(9, "19:40"), id: "p1" }, { ...ev(10, "19:50"), id: "p2" }] }), NOW("19:45")).level, "calm");
  t.eq("two together out of five is a big share but still only two", radar(quit(), state({ urgeLog: [...["03:10", "10:40", "16:10"].map((h, i) => ({ ...ev(i + 1, h), id: `m${i}` })), { ...ev(9, "21:10"), id: "m4" }, { ...ev(10, "21:20"), id: "m5" }] }), NOW("21:15")).level, "calm");
  t.eq("three together, holding under a third of them, aren't", radar(quit(), state({ urgeLog: [...["01:40", "03:10", "05:20", "07:40", "10:50", "13:10", "15:30", "17:20"].map((h, i) => ({ ...ev(i + 1, h), id: `q${i}` })), ...[{ ...ev(9, "21:10"), id: "c1" }, { ...ev(10, "21:20"), id: "c2" }, { ...ev(11, "21:30"), id: "c3" }]] }), NOW("21:15")).level, "calm");
  t.eq("three together out of eight is enough", radar(quit(), state({ urgeLog: [...["03:10", "05:20", "07:40", "10:50", "13:10"].map((h, i) => ({ ...ev(i + 1, h), id: `r${i}` })), ...[{ ...ev(9, "21:10"), id: "d1" }, { ...ev(10, "21:20"), id: "d2" }, { ...ev(11, "21:30"), id: "d3" }]] }), NOW("21:15")).level, "high");
});

t.group("where it points at different times");
atDate(`${TODAY}T12:00:00`, () => {
  const mid = radar(quit(), state(), NOW("10:00"));
  t.eq("mid-morning is calm", mid.level, "calm");
  t.eq("...with the window further off than the look-ahead, so none is announced", mid.startAt, null);
  t.eq("...and nothing to say", radarLine(mid), null);

  const before = radar(quit(), state(), NOW("19:30"));
  t.eq("half an hour before it, the heads-up is 'rising'", before.level, "rising");
  t.eq("...saying when", [before.inWindow, before.minutesToStart], [false, 30]);
  t.ok("...in plain words", /^Risk window opens in 30 min · 8:00 PM$/.test(radarLine(before)), radarLine(before));

  const inside = radar(quit(), state(), NOW("21:15"));
  t.eq("in the middle of it: high", inside.level, "high");
  t.ok("...and says it's now", inside.inWindow && /^High-risk stretch now, until \d+:\d\d PM$/.test(radarLine(inside)), radarLine(inside));
  t.ok("the stretch is bounded around the cluster", inside.startAt <= NOW("21:15") && inside.endAt > NOW("21:40"));
  t.ok("its first reason is the evidence for it", /^8 of your last 8 urges came between 8:00 PM and \d+:\d\d PM\.$/.test(inside.reasons[0]), inside.reasons[0]);

  const after = radar(quit(), state(), NOW("23:55"));
  t.eq("late at night, past it, it eases", after.level, "calm");
  const far = radar(quit(), state(), NOW("15:30"));
  t.eq("hours before, a window is further than an hour away: still calm", [far.level, far.minutesToStart > 60], ["calm", true]);
  t.ok("...but the window is known", far.startAt !== null);
  t.ok("the long range line gives the span", /^Risk window 8:00 PM–\d+:\d\d PM$/.test(radarLine({ ...far, level: "rising" })), radarLine({ ...far, level: "rising" }));
});

t.group("across midnight");
atDate(`${TODAY}T12:00:00`, () => {
  const late = [1, 2, 3, 4, 5, 6].map((d, i) => ev(d, i % 2 ? "23:50" : "00:20"));
  const r = radar(quit(), state({ urgeLog: late }), NOW("23:40"));
  t.ok("a cluster either side of midnight is one stretch", r.level === "high" || r.level === "rising", r);
  t.ok("and the 00:20 ones are counted in its evidence", /of your last 6 urges/.test(r.reasons[0]), r.reasons[0]);
});

t.group("a heavier weekday — only if the log says so");
atDate(`${TODAY}T12:00:00`, () => {
  // 4 of 9 urges on Fridays (today is a Friday). Friday 2026-10-09 = 7 days ago, 10-02 = 14, 09-25 = 21, 09-18 = 28.
  const fridays = [7, 14, 21, 28].map((d) => ev(d, "21:10"));
  const others = [1, 2, 3, 4, 6].map((d) => ev(d, "21:30"));
  const heavy = radar(quit(), state({ urgeLog: [...fridays, ...others] }), NOW("21:15"));
  t.ok("Fridays are named, with the count", heavy.reasons.some((r) => /^Fridays are heavier for you: 4 of 9 urges\.$/.test(r)), heavy.reasons);
  const plain = radar(quit(), state(), NOW("21:15"));
  t.ok("with no lean, the weekday isn't mentioned", !plain.reasons.some((r) => /heavier for you/.test(r)), plain.reasons);
  t.ok("a heavy weekday raises the score", heavy.score > radar(quit(), state({ urgeLog: [...others, ...[5, 8, 9, 10].map((d) => ev(d, "21:10"))] }), NOW("21:15")).score);
  const thin = radar(quit(), state({ urgeLog: [ev(7, "21:10"), ev(14, "21:10"), ...[1, 2, 3, 4, 6, 8].map((d) => ev(d, "21:10"))].slice(0, 7) }), NOW("21:15"));
  t.ok("under eight urges the weekday stays quiet", !thin.reasons.some((r) => /heavier for you/.test(r)));
});

t.group("after a slip today");
atDate(`${TODAY}T12:00:00`, () => {
  const slipped = state({ dayLog: { [TODAY]: { q1: { done: false, slipped: true, at: NOW("15:05") } } } });
  const r = radar(quit(), slipped, NOW("17:30"));
  t.ok("it says so, and that the day isn't lost", r.reasons.some((x) => /You slipped at 3:05 PM\. The next few hours are the riskiest, and the day isn't lost\./.test(x)), r.reasons);
  t.ok("it raises the reading", r.score > radar(quit(), state(), NOW("17:30")).score || radar(quit(), state(), NOW("17:30")).score === 0);
  t.eq("a slip that's long past stops counting", radar(quit(), state({ dayLog: { [TODAY]: { q1: { done: false, slipped: true, at: NOW("07:00") } } } }), NOW("21:15")).reasons.some((x) => /You slipped/.test(x)), false);
  t.eq("and a slip yesterday doesn't", radar(quit(), state({ dayLog: { [addDays(TODAY, -1)]: { q1: { done: false, slipped: true, at: at(1, "15:00") } } } }), NOW("17:30")).reasons.some((x) => /You slipped/.test(x)), false);
  const calmBefore = radar(quit(), state(), NOW("17:30"));
  t.eq("it can lift a quiet moment to 'rising'", [calmBefore.level, r.level === "rising" || r.level === "high" || r.level === "calm"], ["calm", true]);
});

t.group("waves");
atDate(`${TODAY}T12:00:00`, () => {
  const waves = state({ urgeLog: [...evenings, ev(0, "15:30"), ev(0, "16:40")] });
  const r = radar(quit(), waves, NOW("17:30"));
  t.ok("two urges in three hours is noted", r.reasons.some((x) => /^2 urges in the last three hours: it's coming in waves today\.$/.test(x)), r.reasons);
  const one = radar(quit(), state({ urgeLog: [...evenings, ev(0, "16:40")] }), NOW("17:30"));
  t.ok("one isn't a wave", !one.reasons.some((x) => /waves/.test(x)));
  const old = radar(quit(), state({ urgeLog: [...evenings, ev(0, "09:30"), ev(0, "10:40")] }), NOW("17:30"));
  t.ok("and morning ones don't count at five", !old.reasons.some((x) => /waves/.test(x)));
});

t.group("the thresholds, pinned from both sides");
atDate(`${TODAY}T12:00:00`, () => {
  // A softer shape, so there are readings near the lines: at 6:30pm it is 1.2x average (just under
  // "rising" at 1.3), at 10:30pm 0.6x (well under "high" at 2), at 10:15pm 3.0x (over it).
  const soft = [ev(1, "21:10"), ev(2, "21:20"), ev(3, "21:30"), ev(4, "21:10"), ev(5, "20:10"), ev(6, "20:20"), ev(8, "19:40"), ev(9, "19:50")]
    .map((e, i) => ({ ...e, id: `s${i}` }));
  const S = (patch = {}) => state({ urgeLog: soft, ...patch });
  const base = radar(quit(), S(), NOW("18:40"));
  t.eq("a quiet reading of 1.2, under the 'rising' line…", base.score, 1.2);
  t.eq("…is still lifted to 'rising' because a hard stretch starts within the hour", [base.level, base.minutesToStart <= 60], ["rising", true]);
  const outside = radar(quit(), S(), NOW("22:40"));
  t.eq("a reading of 0.6 is calm, and not inside a window", [outside.level, outside.inWindow, outside.score], ["calm", false, 0.6]);
  const over = radar(quit(), S(), NOW("22:20"));
  t.eq("3.0 is high", [over.level, over.inWindow, over.score], ["high", true, 3]);

  // Each factor moves the score by exactly what it says it does. The same extra events are put on the
  // day before for the comparison, so they shape the pattern identically and only the factor differs.
  const yesterdayPair = [{ ...ev(1, "16:30"), id: "y1" }, { ...ev(1, "17:45"), id: "y2" }];
  const todayPair = [{ ...ev(0, "16:30"), id: "t1" }, { ...ev(0, "17:45"), id: "t2" }];
  const plain = radar(quit(), S({ urgeLog: [...soft, ...yesterdayPair] }), NOW("18:40"));
  const waved = radar(quit(), S({ urgeLog: [...soft, ...todayPair] }), NOW("18:40"));
  t.near("two urges in three hours multiply by 1.25", waved.score / plain.score, 1.25, 0.01);
  t.ok("...and say so", waved.reasons.some((r) => /waves/.test(r)) && !plain.reasons.some((r) => /waves/.test(r)));

  const slipDay = { [TODAY]: { q1: { done: false, slipped: true, at: NOW("17:00") } } };
  const slipped = radar(quit(), S({ dayLog: slipDay }), NOW("18:40"));
  t.near("a recent slip multiplies by 1.3", slipped.score / base.score, 1.3, 0.01);
  const both = radar(quit(), S({ dayLog: slipDay, urgeLog: [...soft, ...todayPair] }), NOW("18:40"));
  t.near("together they compound", both.score / plain.score, 1.3 * 1.25, 0.02);

  // The quiet tail of the evening, where no stretch is about to start: a slip lifts the reading by
  // its factor but doesn't, on its own, turn a 0.6 into a warning.
  const tailBase = radar(quit(), S(), NOW("22:40"));
  const tailSlip = radar(quit(), S({ dayLog: { [TODAY]: { q1: { done: false, slipped: true, at: NOW("22:10") } } } }), NOW("22:40"));
  t.near("a slip scales the quiet tail by the same 1.3", tailSlip.score / tailBase.score, 1.3, 0.02);
  t.eq("and 0.78 is still calm", [tailSlip.level, tailSlip.score], ["calm", 0.78]);

  // The middle band: a reading of 1.92, over 'rising' and under 'high', with no stretch about to start.
  const lateTail = radar(quit(), S({ urgeLog: [...soft, { ...ev(11, "23:40"), id: "l1" }, { ...ev(12, "23:50"), id: "l2" }] }), NOW("00:10"));
  t.eq("1.92 with nothing imminent is 'rising', not calm and not high", [lateTail.level, lateTail.score, lateTail.startAt], ["rising", 1.92, null]);
  t.eq("and says so plainly", radarLine(lateTail), "A little more likely than usual right now");

  // Friday-heavy history as well: three Fridays among the eleven.
  const fri = [7, 14, 21].map((d, i) => ({ ...ev(d, "21:10"), id: `f${i}` }));
  const heavyFri = radar(quit(), S({ urgeLog: [...soft, ...fri] }), NOW("18:40"));
  t.ok("a heavy weekday adds to the reading", heavyFri.reasons.some((r) => /Fridays are heavier/.test(r)));
  t.eq("when everything lines up, a borderline hour becomes high", radar(quit(), S({ dayLog: slipDay, urgeLog: [...soft, ...fri, ev(0, "16:30"), ev(0, "17:45")] }), NOW("18:40")).level, "high");
});

t.group("what to do about it");
{
  const bare = rescueFor(quit());
  t.eq("with nothing written, a plain fallback — not something invented in their voice", bare.map((s) => s.kind), ["default"]);
  const full = rescueFor(quit({ calmNote: { why: "I want my evenings back." }, competingResponse: "Walk round the block", friction: "Phone charges in the hall" }));
  t.eq("their own words come first, in order", full.map((s) => s.kind), ["why", "instead", "friction"]);
  t.eq("verbatim", full[0].text, "I want my evenings back.");
  t.eq("a blank note isn't a step", rescueFor(quit({ calmNote: { why: "   " } })).map((s) => s.kind), ["default"]);
}

t.group("a hard day for something being built");
atDate(`${TODAY}T12:00:00`, () => {
  const walk = (patch = {}) => ({ id: "b1", kind: "build", text: "Walk", twoMin: "Put your shoes on and step outside", recurrence: weeklyRule(EVERY_DAY), startDate: "2026-01-01", createdAt: 1, ...patch });
  const doneAt = (daysAgo, hh) => { const d = new Date(`${TODAY}T${hh}:00:00`); d.setDate(d.getDate() - daysAgo); return d.getTime(); };
  const morning = {}; for (let i = 1; i <= 8; i++) morning[addDays(TODAY, -i)] = { b1: { done: true, doneAt: doneAt(i, "08") } };

  t.eq("its usual hour is the median of when it got done", usualHour(walk(), morning, TODAY), 8);
  t.eq("too few completions: unknown", usualHour(walk(), { [addDays(TODAY, -1)]: morning[addDays(TODAY, -1)] }, TODAY), null);
  t.eq("backfilled days don't tell you when you do it", usualHour(walk(), Object.fromEntries(Object.entries(morning).map(([d, v]) => [d, { b1: { ...v.b1, repaired: true } }])), TODAY), null);

  const s = (patch = {}) => ({ tasks: [walk()], dayLog: morning, ...patch });
  t.eq("before noon it never speaks, however late it is against the usual", [hardDay(s(), NOW("09:00")).length, hardDay(s(), NOW("11:30")).length], [0, 0]);
  const past = hardDay(s(), NOW("14:00"));
  t.eq("by the afternoon, four hours past the usual 8am, it does", past.length, 1);
  t.eq("...and says why, with the habit's own usual time", past[0].reason, "You usually finish this by 8:00 AM.");
  t.eq("...and offers the small version, in its own words", past[0].tiny, "Put your shoes on and step outside");
  t.eq("a habit already done isn't a rescue", hardDay(s({ dayLog: { ...morning, [TODAY]: { b1: { done: true } } } }), NOW("14:00")).length, 0);
  t.eq("one with no small version can't be rescued", hardDay(s({ tasks: [walk({ twoMin: null })] }), NOW("14:00")).length, 0);
  t.eq("a paused one isn't either", hardDay(s({ tasks: [walk({ archivedAt: 5 })] }), NOW("14:00")).length, 0);

  // Fridays: today is a Friday, and over the last eight it was done on only the first.
  const fridays = [7, 14, 21, 28, 35, 42, 49, 56];
  const fri = {};
  fridays.forEach((d, i) => { fri[addDays(TODAY, -d)] = { b1: { done: i === 0, doneAt: doneAt(d, "18") } }; });
  const wd = weekdayRecord(walk(), fri, TODAY);
  t.eq("how Fridays have gone", wd, { done: 1, due: 8 });
  t.eq("a habit that didn't exist yet isn't counted against it", weekdayRecord(walk({ startDate: "2026-10-01" }), fri, TODAY), { done: 1, due: 2 });
  const hard = hardDay({ tasks: [walk()], dayLog: fri }, NOW("13:00"));
  t.eq("a weekday that usually fails is named, with the record", hard[0]?.reason, "Fridays are hard for this one: you've done it 1 of 8.");
  t.eq("it waits until the afternoon to say so", hardDay({ tasks: [walk()], dayLog: fri }, NOW("09:00")).length, 0);
  const works = Object.fromEntries(fridays.map((d) => [addDays(TODAY, -d), { b1: { done: true, doneAt: doneAt(d, "18") } }]));
  t.eq("a weekday that usually works is quiet", hardDay({ tasks: [walk()], dayLog: works }, NOW("13:00")).length, 0);
  t.eq("too few of them to judge: quiet", hardDay({ tasks: [walk({ startDate: "2026-10-01" })], dayLog: {} }, NOW("13:00")).length, 0);

  // A habit with no history at all: only the plain "nearly over" can apply.
  const fresh = (id = "b1") => walk({ id, startDate: "2026-10-15" });
  t.eq("late in the evening with nothing else to go on", hardDay({ tasks: [fresh()], dayLog: {} }, NOW("20:30"))[0]?.reason, "The day is nearly over.");
  t.eq("...but not at 7pm", hardDay({ tasks: [fresh()], dayLog: {} }, NOW("19:00")).length, 0);

  const many = ["a", "b", "c"].map((id) => walk({ id, startDate: "2026-10-15" }));
  t.eq("never more than two at once", hardDay({ tasks: many, dayLog: {} }, NOW("21:00")).length, 2);
});

t.group("the 8pm note for a habit still open");
atDate(`${TODAY}T12:00:00`, () => {
  const walk = (patch = {}) => ({ id: "b1", kind: "build", text: "Walk", twoMin: "Put your shoes on and step outside", recurrence: weeklyRule(EVERY_DAY), startDate: "2026-01-01", createdAt: 1, ...patch });
  const st = (patch = {}) => ({ tasks: [walk()], dayLog: {}, srbai: [], checkins: [], freezes: {}, settings: { notify: { ...DEFAULT_NOTIFY } }, ...patch });
  const run = (s, nowHHMM = "12:00") => buildNudges(s, { days: 3, now: NOW(nowHHMM) }).filter((n) => n.kind === "rescue");
  const n = run(st());
  t.eq("one, today only", n.map((x) => x.date), [TODAY]);
  t.ok("at eight in the evening", n[0].at.getHours() === 20 && n[0].at.getMinutes() === 0);
  t.eq("naming the habit", n[0].title, "Walk is still open");
  t.eq("...and offering its own small version", n[0].body, "The small version counts: Put your shoes on and step outside.");
  t.eq("with a button for just the tiny bit", n[0].actions.map((a) => a.id), ["done", "twoMin", "snooze"]);
  t.eq("carrying the habit, so the button knows what to mark", n[0].taskId, "b1");
  t.eq("a habit already done today isn't offered", run(st({ dayLog: { [TODAY]: { b1: { done: true } } } })).length, 0);
  t.eq("one with no small version isn't either", run(st({ tasks: [walk({ twoMin: null })] })).length, 0);
  t.eq("nothing after eight has passed", run(st(), "20:30").length, 0);
  t.eq("two open: still one note, saying how many more", run(st({ tasks: [walk(), walk({ id: "b2", text: "Read" })] }))[0].body, "The small version counts: Put your shoes on and step outside. (1 more still open.)");
  t.eq("the switch turns it off", run(st({ settings: { notify: { ...DEFAULT_NOTIFY, rescue: false } } })).length, 0);
  t.ok("it's on by default, and switchable", DEFAULT_NOTIFY.rescue === true && NUDGE_KINDS.some((k) => k.id === "rescue" && k.kind === "toggle"));
});

t.group("the usual window, as a time of day");
atDate(`${TODAY}T12:00:00`, () => {
  const w = usualWindow(quit(), state(), NOW("12:00"));
  t.ok("evening urges give an evening window", w && w.startMin >= 19 * 60 && w.startMin <= 21 * 60 && w.endMin > w.startMin && w.endMin <= 23 * 60 + 30, w);
  t.eq("on half-hour boundaries", [w.startMin % 30, w.endMin % 30], [0, 0]);
  t.eq("too few urges: no window", usualWindow(quit(), state({ urgeLog: evenings.slice(0, 4) }), NOW("12:00")), null);
  t.eq("urges spread all day: no window", usualWindow(quit(), state({ urgeLog: ["03:10", "07:20", "10:40", "13:50", "16:10", "19:30", "22:00", "23:40"].map((h, i) => ({ ...ev(i + 1, h), id: `sp${i}` })) }), NOW("12:00")), null);
  const late = [1, 2, 3, 4, 5, 6].map((d, i) => ({ ...ev(d, i % 2 ? "23:50" : "00:20"), id: `w${i}` }));
  const wrap = usualWindow(quit(), state({ urgeLog: late }), NOW("12:00"));
  t.ok("across midnight it ends at an earlier minute than it starts", wrap && wrap.endMin < wrap.startMin, wrap);
});

t.group("what the widget is handed");
atDate(`${TODAY}T12:00:00`, () => {
  const s = { tasks: [quit()], dayLog: {}, urgeLog: evenings };
  t.eq("without the radar there's no risk, rather than a guess", widgetSnapshot(s, TODAY).quitting[0].risk, null);
  const withRadar = widgetSnapshot(s, TODAY, { usualWindow });
  t.eq("with it, the window as a time of day", Object.keys(withRadar.quitting[0].risk).sort(), ["endMin", "startMin"]);
  t.eq("...the same one the app works out", withRadar.quitting[0].risk, usualWindow(quit(), s));
  t.eq("a habit with too little history gets none", widgetSnapshot({ ...s, urgeLog: evenings.slice(0, 3) }, TODAY, { usualWindow }).quitting[0].risk, null);
});
