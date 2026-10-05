import { atDate, suite } from "./harness.mjs";
import {
  KIND_BY_ID, MIN_PAIRS, adherence, analyze, assignmentsFor, buildContext, chanceInWords, describeMetric,
  describeResult, endDateOf, liveToday, metricProblem, metricValue, newExperiment, pairedRandomizationP,
  permutationP, phaseOf, rng, setFollowed, stopExperiment, todayAssignment, dayNumber, asOf, stoppedDate,
} from "../src/lib/experiments.js";
import { addDays } from "../src/lib/date.js";
import { weeklyRule } from "../src/lib/tasks.js";
import { DEFAULT_NOTIFY, NUDGE_KINDS, buildNudges } from "../src/lib/nudges.js";

const t = suite("experiments");

// Experiments on yourself. The point of the whole feature is that its answers can be trusted, so
// these test the statistics as much as the plumbing: that the coin flips are fair and fixed, that
// the test doesn't cry wolf at noise, that it does notice a real effect, and that it says "too
// early" rather than guessing.
const TODAY = "2026-10-20";
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const quit = (patch = {}) => ({ id: "q1", kind: "break", text: "Doomscrolling", recurrence: weeklyRule(EVERY_DAY), startDate: "2026-01-01", createdAt: 1, ...patch });
const walk = (patch = {}) => ({ id: "b1", kind: "build", text: "Walk", recurrence: weeklyRule(EVERY_DAY), startDate: "2026-01-01", createdAt: 1, ...patch });

// A state where every day in [from, to] counts as "used", and urges per day come from `perDay`.
function stateWith({ from, to, perDay = () => 0, tasks = [quit(), walk()], extra = {} }) {
  const dayLog = {};
  const urgeLog = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    dayLog[d] = { q1: { done: true } };
    const n = perDay(d);
    for (let i = 0; i < n; i++) urgeLog.push({ id: `u-${d}-${i}`, taskId: "q1", kind: "urge", outcome: "rode-out", at: Date.parse(`${d}T21:0${i}:00`), date: d });
  }
  return { tasks, dayLog, urgeLog, checkins: [], transactions: [], journalEntries: [], focusSessions: [], ...extra };
}

t.group("the random source");
{
  const a = rng("seed"), b = rng("seed"), c = rng("other");
  const A = Array.from({ length: 5 }, a), B = Array.from({ length: 5 }, b), C = Array.from({ length: 5 }, c);
  t.eq("the same seed gives the same numbers", A, B);
  t.ok("a different seed gives different ones", JSON.stringify(A) !== JSON.stringify(C));
  t.ok("they stay in [0, 1)", A.every((v) => v >= 0 && v < 1));
  const many = rng("fair"); const draws = Array.from({ length: 20000 }, many);
  const mean = draws.reduce((x, y) => x + y, 0) / draws.length;
  t.near("and are evenly spread", mean, 0.5, 0.01);
  t.near("coin flips come up about half and half", draws.filter((v) => v < 0.5).length / draws.length, 0.5, 0.012);
}

t.group("the coin-flip plan");
{
  const plan = assignmentsFor("x-1", "2026-10-01", 14);
  const dates = Object.keys(plan);
  t.eq("every day has an assignment", dates.length, 14);
  t.eq("seven do and seven skip", [dates.filter((d) => plan[d] === "do").length, dates.filter((d) => plan[d] === "skip").length], [7, 7]);
  // The point of pairing: whatever the weekday or the weather, each pair has one of each.
  const pairs = Array.from({ length: 7 }, (_, k) => [plan[addDays("2026-10-01", 2 * k)], plan[addDays("2026-10-01", 2 * k + 1)]]);
  t.ok("every pair has one of each, in either order", pairs.every(([a, b]) => a !== b));
  t.ok("the order varies from pair to pair (it's a coin, not a pattern)", new Set(pairs.map((p) => p.join())).size === 2);
  t.eq("the same experiment always gets the same plan", assignmentsFor("x-1", "2026-10-01", 14), plan);
  t.ok("a different experiment gets a different one", JSON.stringify(assignmentsFor("x-2", "2026-10-01", 14)) !== JSON.stringify(plan));
  t.eq("an odd length leaves the odd day out rather than unbalancing it", Object.keys(assignmentsFor("x-1", "2026-10-01", 9)).length, 8);

  // Over many experiments the first day of a pair should be "do" about half the time.
  let first = 0, total = 0;
  for (let i = 0; i < 400; i++) {
    const p = assignmentsFor(`fair-${i}`, "2026-10-01", 14);
    for (let k = 0; k < 7; k++) { total++; if (p[addDays("2026-10-01", 2 * k)] === "do") first++; }
  }
  t.near("across many plans the coin is fair", first / total, 0.5, 0.03);
}

t.group("creating one");
{
  const x = newExperiment({ title: " Phone out ", change: "Phone outside the bedroom", metric: { kind: "urges", taskId: "q1" }, days: 14, startDate: "2026-10-01", at: 1000 });
  t.eq("it's a coin-flip experiment by default", [x.mode, x.days], ["flip", 14]);
  t.eq("the title is tidied", x.title, "Phone out");
  t.eq("the better direction comes from what's measured", x.better, "down");
  t.eq("it holds a stored plan", Object.keys(x.assignments).length, 14);
  t.eq("it ends where the days run out", endDateOf(x), "2026-10-14");
  t.eq("an odd length is rounded down to whole pairs", newExperiment({ change: "x", metric: { kind: "feel" }, days: 13, startDate: "2026-10-01" }).days, 12);
  t.ok("a too-short one is lengthened to something that can say anything", newExperiment({ change: "x", metric: { kind: "feel" }, days: 2 }).days >= 8);
  t.eq("a huge one is capped", newExperiment({ change: "x", metric: { kind: "feel" }, days: 200 }).days, 28);
  const ba = newExperiment({ change: "Plan tomorrow", metric: { kind: "habits" }, mode: "before-after", days: 14, startDate: "2026-10-01" });
  t.eq("before/after has a baseline and no plan", [ba.baselineDays, ba.assignments], [14, null]);
  t.eq("the title falls back to the change", newExperiment({ change: "Walk daily", metric: { kind: "feel" } }).title, "Walk daily");
  t.ok("ids are unique", newExperiment({ change: "a", metric: { kind: "feel" } }).id !== newExperiment({ change: "a", metric: { kind: "feel" } }).id);
}

t.group("what can be measured");
{
  const state = stateWith({ from: "2026-10-01", to: "2026-10-10", perDay: (d) => (d === "2026-10-03" ? 3 : 0) });
  state.checkins = [{ date: "2026-10-03", feel: 4, recharge: 2, scores: { health: 5, spiritual: 3 } }];
  state.transactions = [{ id: "a", type: "expense", date: "2026-10-03", amount: 12.5 }, { id: "b", type: "expense", date: "2026-10-03", amount: 7.5 }, { id: "c", type: "income", date: "2026-10-03", amount: 99 }];
  state.focusSessions = [{ id: "f", date: "2026-10-03", seconds: 1500 }];
  const ctx = buildContext(state);
  const v = (metric, date) => metricValue(ctx, metric, date);
  t.eq("urges are counted per day", [v({ kind: "urges", taskId: "q1" }, "2026-10-03"), v({ kind: "urges", taskId: "q1" }, "2026-10-04")], [3, 0]);
  t.eq("a day the app wasn't used is unknown, not zero", v({ kind: "urges", taskId: "q1" }, "2026-09-20"), null);
  t.eq("an unknown habit has no answer", v({ kind: "urges", taskId: "nope" }, "2026-10-03"), null);
  t.eq("feel and recharge come from the check-in", [v({ kind: "feel" }, "2026-10-03"), v({ kind: "recharge" }, "2026-10-03")], [4, 2]);
  t.eq("...and are unknown on days with none", v({ kind: "feel" }, "2026-10-04"), null);
  t.eq("balance averages the pillars scored", v({ kind: "balance" }, "2026-10-03"), 4);
  t.eq("one pillar", v({ kind: "pillar", pillarId: "health" }, "2026-10-03"), 5);
  t.eq("spending counts expenses only", v({ kind: "spend" }, "2026-10-03"), 20);
  t.eq("a used day with no spend is zero", v({ kind: "spend" }, "2026-10-05"), 0);
  t.eq("focus is in minutes", v({ kind: "focus" }, "2026-10-03"), 25);
  t.eq("a habit is 1 when done", v({ kind: "habit", taskId: "b1" }, "2026-10-03"), 0);
  const done = { ...state, dayLog: { ...state.dayLog, "2026-10-04": { b1: { done: true } } } };
  t.eq("...and 1 when it was", metricValue(buildContext(done), { kind: "habit", taskId: "b1" }, "2026-10-04"), 1);
  t.eq("all habits is the share done", metricValue(buildContext(done), { kind: "habits" }, "2026-10-04"), 1);
  t.eq("a habit not due that day is unknown", metricValue(buildContext({ ...state, tasks: [walk({ recurrence: weeklyRule(["mon"]) })] }), { kind: "habit", taskId: "b1" }, "2026-10-04"), null);
  t.eq("an unknown kind has no answer", v({ kind: "nope" }, "2026-10-03"), null);

  t.eq("a measure can be checked: needs a habit", metricProblem({ kind: "urges" }, state), "Pick which habit you're quitting.");
  t.eq("...the right kind", metricProblem({ kind: "urges", taskId: "b1" }, state), "That's not the right kind of habit for this measure.");
  t.eq("...a pillar", metricProblem({ kind: "pillar" }, state), "Pick a pillar.");
  t.eq("...and a good one has no problem", metricProblem({ kind: "urges", taskId: "q1" }, state), null);
  t.eq("nothing chosen", metricProblem({}, state), "Pick something to measure.");
  t.eq("it reads in words", describeMetric({ kind: "urges", taskId: "q1" }, state), "urges and slips · Doomscrolling");
}

t.group("the randomization test");
{
  t.eq("no pairs, no evidence", pairedRandomizationP([]), 1);
  t.eq("a difference of nothing is as likely as anything", pairedRandomizationP([0, 0, 0, 0, 0]), 1);
  t.eq("five pairs all the same way: 2 in 32, which is the best five can do", pairedRandomizationP([1, 1, 1, 1, 1]), 2 / 32);
  t.eq("six all the same way: 2 in 64", pairedRandomizationP([2, 2, 2, 2, 2, 2]), 2 / 64);
  t.eq("a mix that cancels out is certainly chance", pairedRandomizationP([1, -1, 1, -1]), 1);
  t.ok("a lopsided mix is not significant", pairedRandomizationP([3, -1, 2, -2, 1, -1]) > 0.3);
  t.eq("direction doesn't matter, only size", pairedRandomizationP([-1, -1, -1, -1, -1, -1]), 2 / 64);
  const big = pairedRandomizationP(Array(20).fill(1), "seed");
  t.ok("beyond the exact limit it samples, and still finds a clear effect", big < 0.001 && big > 0, big);
  t.eq("...the same answer every time", pairedRandomizationP(Array(20).fill(1), "seed"), big);

  t.eq("identical windows differ by nothing", permutationP([1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]), 1);
  t.ok("windows far apart are clearly different", permutationP([1, 1, 1, 1, 1, 1], [5, 5, 5, 5, 5, 5], "w") < 0.01);
  t.ok("overlapping windows aren't", permutationP([1, 5, 2, 6, 3, 4], [2, 4, 3, 5, 1, 6], "w") > 0.5);
  t.eq("an empty window is no evidence", permutationP([], [1, 2]), 1);
}

t.group("is the test honest? (calibration)");
{
  // Noise only: every pair's difference is a draw from a symmetric distribution around zero.
  // If the test is sound it should call fewer than 1 in 20 of these significant.
  const next = rng("calibration");
  const noise = () => (next() - 0.5) * 6;
  let falseAlarms = 0;
  const sims = 600;
  for (let i = 0; i < sims; i++) {
    const diffs = Array.from({ length: 7 }, noise);
    if (pairedRandomizationP(diffs) < 0.05) falseAlarms++;
  }
  t.ok(`pure noise is called an effect rarely (${falseAlarms} of ${sims})`, falseAlarms / sims <= 0.06, falseAlarms);

  // A real effect: the "do" day is better by 2 units on average, with noise of ±1.5.
  let caught = 0;
  const real = rng("power");
  for (let i = 0; i < sims; i++) {
    const diffs = Array.from({ length: 7 }, () => 2 + (real() - 0.5) * 3);
    if (pairedRandomizationP(diffs) < 0.05) caught++;
  }
  t.ok(`a real effect is usually caught (${caught} of ${sims})`, caught / sims >= 0.9, caught);
}

t.group("reading a coin-flip experiment");
atDate(`${TODAY}T10:00:00`, () => {
  // Do days have 1 urge; skip days have 4. 14 days ended yesterday-ish: start 2026-10-06 → 10-19.
  const exp = newExperiment({ change: "Phone out", metric: { kind: "urges", taskId: "q1" }, startDate: "2026-10-06", days: 14, at: 5 });
  const state = stateWith({ from: "2026-09-20", to: "2026-10-19", perDay: (d) => (exp.assignments[d] === "do" ? 1 : exp.assignments[d] === "skip" ? 4 : 0) });
  const r = analyze(exp, state, TODAY);
  t.eq("seven complete pairs", r.n, 7);
  t.eq("on do days it averaged 1, on skip days 4", [r.treated, r.base], [1, 4]);
  t.eq("a gap of three", r.diff, -3);
  t.ok("and it counts as an improvement because fewer is better", r.gain > 0);
  t.ok("the p-value is as small as seven pairs allow", Math.abs(r.p - 2 / 128) < 1e-9, r.p);
  t.eq("verdict: it worked", r.verdict, "worked");
  const words = describeResult(r, exp);
  t.eq("the headline says so, in plain words", words.headline, "It looks like it helped");
  t.ok("...with the numbers", /averaged 1 a day, against 4 a day on the days you didn't/.test(words.numbers), words.numbers);
  t.ok("...and the chance, in words", /1 time in 64/.test(words.body), words.body);
  t.ok("...and a percentage", /75%/.test(words.body), words.body);
  t.ok("it explains why coin flips are trustworthy", r.caveats[0].includes("coin flip"));
  t.ok("it reminds that unlogged days aren't counted as good ones", r.caveats.some((c) => /opened the app/.test(c)));

  // The same data the other way round: doing it made things worse.
  const worse = stateWith({ from: "2026-09-20", to: "2026-10-19", perDay: (d) => (exp.assignments[d] === "do" ? 4 : exp.assignments[d] === "skip" ? 1 : 0) });
  t.eq("do days worse: it backfired", analyze(exp, worse, TODAY).verdict, "backfired");
  t.eq("...and says so", describeResult(analyze(exp, worse, TODAY), exp).headline, "It moved the wrong way");

  // No difference at all.
  const flat = stateWith({ from: "2026-09-20", to: "2026-10-19", perDay: () => 2 });
  const f = analyze(exp, flat, TODAY);
  t.eq("no gap: no clear effect", f.verdict, "nothing");
  t.eq("...which it presents as an answer, not a failure", describeResult(f, exp).headline, "No clear effect");
  t.ok("...and says you can stop", /stop doing it without losing anything/.test(describeResult(f, exp).body));
});

t.group("the middle ground: suggestive, not convincing");
atDate(`${TODAY}T10:00:00`, () => {
  // Pair differences (do minus skip) chosen to land between "chance" and "convincing": a result
  // that suggestive deserves "leaning", never "it worked".
  const make = (diffs) => {
    const exp = newExperiment({ change: "x", metric: { kind: "urges", taskId: "q1" }, startDate: "2026-10-06", days: 14, at: 5 });
    const state = stateWith({
      from: "2026-09-20", to: "2026-10-19",
      perDay: (d) => {
        const k = Math.floor((new Date(`${d}T12:00:00`) - new Date("2026-10-06T12:00:00")) / 86400000 / 2);
        if (!exp.assignments[d] || k < 0 || k >= diffs.length) return 0;
        return exp.assignments[d] === "do" ? 4 + diffs[k] : 4;
      },
    });
    return { exp, result: analyze(exp, state, TODAY) };
  };
  const good = make([-2, -1, -3, 1, -2, -1, 0]);
  t.near("p lands in the grey zone", good.result.p, 0.125, 0.001);
  t.eq("an improvement that suggestive is only 'leaning'", good.result.verdict, "leaning-good");
  t.eq("...worded as not enough to be sure", describeResult(good.result, good.exp).headline, "Leaning in your favour");
  t.ok("...and says more days would settle it", /more days would settle it/.test(describeResult(good.result, good.exp).body));
  const bad = make([2, 1, 3, -1, 2, 1, 0]);
  t.eq("the same shape the wrong way is 'leaning' too, and says so", [bad.result.verdict, describeResult(bad.result, bad.exp).headline], ["leaning-bad", "Leaning the wrong way"]);
  const edge = make([-2, -1, -3, 1, -2, -1, -2]);
  t.near("a p just above 0.05", edge.result.p, 0.0625, 0.001);
  t.eq("is still not called a result", edge.result.verdict, "leaning-good");
  const solid = make([-3, -2, -3, -2, -3, -2, -3]);
  t.eq("while a consistent one is", solid.result.verdict, "worked");
});

t.group("reading it too soon");
atDate("2026-10-10T10:00:00", () => {
  const exp = newExperiment({ change: "x", metric: { kind: "urges", taskId: "q1" }, startDate: "2026-10-06", days: 14, at: 5 });
  const state = stateWith({ from: "2026-09-20", to: "2026-10-09", perDay: (d) => (exp.assignments[d] === "do" ? 0 : 5) });
  const r = analyze(exp, state, "2026-10-10");
  t.eq("only the pairs that are over count", r.n, 2);
  t.eq("it says it's too early", r.verdict, "too-early");
  t.eq("...and how much more it needs", r.need, MIN_PAIRS - 2);
  const w = describeResult(r, exp);
  t.ok("...in words, refusing to guess", w.headline === "Too early to say" && /3 more/.test(w.body), w);
  t.eq("a result this lopsided still isn't called yet", r.verdict === "worked", false);
  t.eq("nothing yet at all", analyze(exp, stateWith({ from: "2026-09-20", to: "2026-10-09" }), "2026-10-06").n, 0);
});

t.group("days with nothing logged");
atDate(`${TODAY}T10:00:00`, () => {
  const exp = newExperiment({ change: "x", metric: { kind: "urges", taskId: "q1" }, startDate: "2026-10-06", days: 14, at: 5 });
  // Only the first four pairs' days were ever opened.
  const state = stateWith({ from: "2026-10-06", to: "2026-10-13", perDay: (d) => (exp.assignments[d] === "do" ? 0 : 4) });
  const r = analyze(exp, state, TODAY);
  t.eq("a pair with an unopened day is left out, not counted as zero", r.n, 4);
  t.eq("so four pairs aren't enough for a verdict", r.verdict, "too-early");
});

t.group("today is still being written");
atDate("2026-10-12T10:00:00", () => {
  const exp = newExperiment({ change: "x", metric: { kind: "urges", taskId: "q1" }, startDate: "2026-10-06", days: 14, at: 5 });
  const state = stateWith({ from: "2026-10-06", to: "2026-10-12", perDay: () => 1 });
  const upTo = analyze(exp, state, "2026-10-12");
  t.eq("pairs 10-06/07, 08/09, 10/11 are done; 12/13 is not", upTo.n, 3);
  t.eq("the half-finished pair doesn't sneak in", upTo.series.filter((s) => s.value !== null).length, 6);
});

t.group("reading a before/after experiment");
atDate(`${TODAY}T10:00:00`, () => {
  const exp = newExperiment({ change: "Plan tomorrow tonight", metric: { kind: "urges", taskId: "q1" }, mode: "before-after", startDate: "2026-10-10", days: 14, baselineDays: 14, at: 5 });
  const state = stateWith({ from: "2026-09-20", to: "2026-10-19", perDay: (d) => (d < "2026-10-10" ? 5 : 1) });
  const r = analyze(exp, state, TODAY);
  t.eq("it compares the days before with the days since", [r.base, r.treated], [5, 1]);
  t.eq("a clear drop in a thing where fewer is better", r.verdict, "worked");
  t.ok("it warns that this design can't rule out other causes", r.caveats[0].includes("anything else that changed"));
  t.ok("...and says coin flips would", r.caveats[0].includes("Coin-flip days rule that out"));
  t.eq("too few days either side: too early", analyze(exp, stateWith({ from: "2026-10-08", to: "2026-10-14", perDay: () => 1 }), "2026-10-15").verdict, "too-early");
  const same = stateWith({ from: "2026-09-20", to: "2026-10-19", perDay: () => 3 });
  t.eq("no change: nothing", analyze(exp, same, TODAY).verdict, "nothing");
});

t.group("a measure where more is better");
atDate(`${TODAY}T10:00:00`, () => {
  const exp = newExperiment({ change: "Walk", metric: { kind: "feel" }, startDate: "2026-10-06", days: 14, at: 5 });
  const checkins = [];
  for (let d = "2026-10-06"; d <= "2026-10-19"; d = addDays(d, 1)) checkins.push({ date: d, feel: exp.assignments[d] === "do" ? 4 : 2, scores: {} });
  const r = analyze(exp, { tasks: [], dayLog: {}, urgeLog: [], checkins, transactions: [], journalEntries: [], focusSessions: [] }, TODAY);
  t.eq("higher on do days counts as better", [r.diff, r.gain > 0, r.verdict], [2, true, "worked"]);
  t.ok("its words say higher, not lower", /higher/.test(describeResult(r, exp).body));
});

t.group("following the plan");
atDate(`${TODAY}T10:00:00`, () => {
  const exp = newExperiment({ change: "x", metric: { kind: "urges", taskId: "q1" }, startDate: "2026-10-06", days: 14, at: 5 });
  const doDays = Object.keys(exp.assignments).filter((d) => exp.assignments[d] === "do" && d < TODAY).sort();
  t.eq("nothing followed yet", adherence(exp, TODAY), { due: doDays.length, done: 0, pct: 0 });
  let x = exp;
  doDays.slice(0, 3).forEach((d) => { x = setFollowed(x, d, true, 9); });
  t.eq("three followed", adherence(x, TODAY).done, 3);
  t.eq("a skip day never counts as owed", adherence(setFollowed(exp, Object.keys(exp.assignments).find((d) => exp.assignments[d] === "skip"), true), TODAY).done, 0);
  t.eq("marking is non-destructive", exp.followed, {});
  t.eq("it can be taken back", setFollowed(setFollowed(exp, "2026-10-06", true), "2026-10-06", false).followed["2026-10-06"], false);
  t.eq("it stamps the edit, for merging", setFollowed(exp, "2026-10-06", true, 777).updatedAt, 777);

  const lazy = analyze(x, stateWith({ from: "2026-09-20", to: "2026-10-19", perDay: (d) => (x.assignments[d] === "do" ? 1 : 4) }), TODAY);
  t.ok("low adherence is called out", lazy.caveats.some((c) => /You followed it on 3 of 7 days/.test(c)), lazy.caveats);
  const diligent = doDays.reduce((acc, d) => setFollowed(acc, d, true), exp);
  t.ok("full adherence isn't", !analyze(diligent, stateWith({ from: "2026-09-20", to: "2026-10-19", perDay: () => 1 }), TODAY).caveats.some((c) => /You followed it/.test(c)));
});

t.group("where it is on the calendar");
{
  const exp = newExperiment({ change: "x", metric: { kind: "feel" }, startDate: "2026-10-10", days: 14, at: 5 });
  t.eq("before it starts", [phaseOf(exp, "2026-10-09"), todayAssignment(exp, "2026-10-09")], ["upcoming", null]);
  t.eq("on the first day", [phaseOf(exp, "2026-10-10"), dayNumber(exp, "2026-10-10")], ["running", 1]);
  t.eq("on the last", [phaseOf(exp, "2026-10-23"), dayNumber(exp, "2026-10-23")], ["running", 14]);
  t.eq("after it", [phaseOf(exp, "2026-10-24"), todayAssignment(exp, "2026-10-24")], ["ended", null]);
  t.ok("today's ask comes from the stored plan", ["do", "skip"].includes(todayAssignment(exp, "2026-10-12")));
  t.eq("it can be stopped early", phaseOf(stopExperiment(exp, 3), "2026-10-12"), "ended");
  const ba = newExperiment({ change: "x", metric: { kind: "feel" }, mode: "before-after", startDate: "2026-10-10", days: 14 });
  t.eq("before/after asks for the change every day", todayAssignment(ba, "2026-10-12"), "do");

  const live = liveToday({ experiments: [exp, ba, stopExperiment(exp, 1)] }, "2026-10-12");
  t.eq("only live ones are listed for today", live.length, 2);
  t.eq("...and none when there are none", liveToday({}, "2026-10-12"), []);
}

t.group("saying how sure");
{
  t.eq("a coin toss", chanceInWords(0.7), "about as often as not");
  t.eq("one in twenty", chanceInWords(0.05), "about 1 time in 20");
  t.eq("one in sixty-four", chanceInWords(1 / 64), "about 1 time in 64");
  t.eq("never claims better than one in two", chanceInWords(0.45), "about 1 time in 2");
  t.ok("every measure has a direction", Object.values(KIND_BY_ID).every((k) => k.better === "up" || k.better === "down"));
}

t.group("judging an experiment as of the right day");
{
  const exp = newExperiment({ change: "x", metric: { kind: "feel" }, startDate: "2026-10-06", days: 14, at: 5 });
  t.eq("while it runs: today", asOf(exp, "2026-10-12"), "2026-10-12");
  t.eq("once it's over: the day after it ended, so every day is complete", asOf(exp, "2026-11-30"), "2026-10-20");
  const stopped = stopExperiment(exp, new Date("2026-10-10T15:00:00").getTime());
  t.eq("stopped early, later days are ignored: as of the day it was stopped", asOf(stopped, "2026-11-30"), "2026-10-10");
  t.eq("...and that day itself, half-lived, is not counted", analyze(stopped, { tasks: [], dayLog: {}, urgeLog: [], checkins: [], transactions: [], journalEntries: [], focusSessions: [] }, asOf(stopped, "2026-11-30")).series.filter((s) => s.date >= "2026-10-10").every((s) => s.value === null), true);
  t.eq("the stop date is local", stoppedDate(stopped), "2026-10-10");
  t.eq("a running one has none", stoppedDate(exp), null);
}

t.group("a note on the days that ask for something");
atDate("2026-10-10T06:00:00", () => {
  const exp = newExperiment({ title: "Phone out", change: "Charge the phone outside the bedroom", metric: { kind: "feel" }, startDate: "2026-10-10", days: 14, at: 5 });
  const state = (patch = {}) => ({ tasks: [], dayLog: {}, srbai: [], checkins: [], freezes: {}, experiments: [exp], settings: { notify: { ...DEFAULT_NOTIFY } }, ...patch });
  const nudges = buildNudges(state(), { days: 14, now: new Date("2026-10-10T05:00:00").getTime() }).filter((n) => n.kind === "experiments");
  const doDays = Object.keys(exp.assignments).filter((d) => exp.assignments[d] === "do");
  t.eq("one on each do-day, none on the others", nudges.map((n) => n.date), doDays.filter((d) => d >= "2026-10-10"));
  t.eq("...seven of them", nudges.length, 7);
  t.ok("they go out in the morning", nudges.every((n) => n.at.getHours() === 8 && n.at.getMinutes() === 30));
  t.ok("they say what to do", /Charge the phone outside the bedroom/.test(nudges[0].body) && /Phone out/.test(nudges[0].title), nudges[0]);
  t.eq("a stable id per day so rescheduling replaces", nudges[0].id, `exp:${exp.id}:${nudges[0].date}`);
  const firstDo = nudges[0].date;
  t.eq("a day already marked done isn't nagged about", buildNudges(state({ experiments: [{ ...exp, followed: { [firstDo]: true } }] }), { days: 14, now: new Date("2026-10-10T05:00:00").getTime() }).filter((n) => n.kind === "experiments").length, 6);
  t.eq("the switch turns them off", buildNudges(state({ settings: { notify: { ...DEFAULT_NOTIFY, experiments: false } } }), { days: 14, now: new Date("2026-10-10T05:00:00").getTime() }).filter((n) => n.kind === "experiments"), []);
  t.eq("a stopped experiment sends nothing", buildNudges(state({ experiments: [stopExperiment(exp, 1)] }), { days: 14, now: new Date("2026-10-10T05:00:00").getTime() }).filter((n) => n.kind === "experiments"), []);
  t.eq("a before/after experiment asks every day", buildNudges(state({ experiments: [newExperiment({ change: "Plan tomorrow", metric: { kind: "habits" }, mode: "before-after", startDate: "2026-10-10", days: 14 })] }), { days: 3, now: new Date("2026-10-10T05:00:00").getTime() }).filter((n) => n.kind === "experiments").length, 3);
  const custom = buildNudges(state({ settings: { notify: { ...DEFAULT_NOTIFY, morning: "07:15" } } }), { days: 3, now: new Date("2026-10-10T05:00:00").getTime() }).filter((n) => n.kind === "experiments");
  t.ok("it follows the morning time if one is set", custom.every((n) => n.at.getHours() === 7 && n.at.getMinutes() === 15));
  t.ok("on by default and switchable", DEFAULT_NOTIFY.experiments === true && NUDGE_KINDS.some((k) => k.id === "experiments" && k.kind === "toggle"));
});
