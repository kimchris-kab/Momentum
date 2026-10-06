import { suite } from "./harness.mjs";
import {
  DEFAULT_SURF, PATTERNS, PATTERN_BY_ID, cycleSecs, hapticCycle, phaseAt, surfSettings, vibratePattern,
} from "../src/lib/pacer.js";

const t = suite("pacer");

// The breathing pacer. The two things that matter: the circle and the phone's motor follow the
// same clock (so one breath's vibration is exactly as long as one breath), and the vibration
// really does rise and fall with the breath, because that's the whole point of feeling it.
const slow = PATTERN_BY_ID.slow, box = PATTERN_BY_ID.box, sigh = PATTERN_BY_ID.sigh;

t.group("the patterns");
{
  t.eq("three of them", PATTERNS.map((p) => p.id), ["slow", "box", "sigh"]);
  t.eq("cycle lengths", [cycleSecs(slow), cycleSecs(box), cycleSecs(sigh)], [10, 16, 9]);
  t.ok("every pattern breathes out for at least as long as it breathes in",
    PATTERNS.every((p) => {
      const sum = (kinds) => p.phases.filter((x) => kinds.includes(x.kind)).reduce((a, x) => a + x.secs, 0);
      return sum(["out"]) >= sum(["in", "top"]);
    }));
  t.ok("none has a phase of no length", PATTERNS.every((p) => p.phases.every((x) => x.secs > 0)));
  t.ok("each starts from a nearly empty circle and ends where it began", PATTERNS.every((p) => p.phases[0].from === p.phases[p.phases.length - 1].to));
  t.ok("each has a name and a line saying what it is", PATTERNS.every((p) => p.label && p.blurb));
}

t.group("where the breath is");
{
  const at = (p, s) => phaseAt(p, s);
  t.eq("it starts breathing in", [at(slow, 0).kind, at(slow, 0).say], ["in", "Breathe in"]);
  t.near("...from a small circle", at(slow, 0).size, 0.25, 1e-9);
  t.near("a full circle at the top of the breath", at(slow, 3.999).size, 1, 0.001);
  t.eq("then breathes out", at(slow, 4).kind, "out");
  t.near("...and back to small at the end of the cycle", at(slow, 9.999).size, 0.25, 0.001);
  t.eq("then round again, counting the cycle", [at(slow, 10).cycle, at(slow, 10).kind, at(slow, 25).cycle], [1, "in", 2]);
  t.near("the same point in a later cycle is the same size", at(slow, 12).size, at(slow, 2).size, 1e-9);
  t.near("half way in is half way up the range", at(slow, 2).size, 0.625, 1e-9);
  t.near("the circle eases in: slow at the very start, not a straight line", at(slow, 0.2).size, 0.2546, 0.001);
  t.near("...and slow again at the top", at(slow, 3.8).size, 0.9954, 0.001);
  t.near("seconds left in the phase", at(slow, 1.5).left, 2.5, 1e-9);
  t.near("...and during the exhale", at(slow, 7).left, 3, 1e-9);
  t.ok("the circle grows the whole way in", [0, 0.5, 1, 2, 3, 3.9].every((s, i, a) => i === 0 || at(slow, s).size > at(slow, a[i - 1]).size));
  t.ok("...and shrinks the whole way out", [4.1, 5, 6, 8, 9.9].every((s, i, a) => i === 0 || at(slow, s).size < at(slow, a[i - 1]).size));
  t.ok("it never leaves its range", Array.from({ length: 400 }, (_, i) => at(box, i * 0.1).size).every((s) => s >= 0.25 - 1e-9 && s <= 1 + 1e-9));
  t.eq("box holds full, then breathes out, then holds empty", [at(box, 5).kind, at(box, 9).kind, at(box, 13).kind], ["hold", "out", "hold"]);
  t.ok("a hold is perfectly still", at(box, 4.2).size === at(box, 7.8).size && at(box, 4.2).size === 1);
  t.ok("...at the bottom too", at(box, 12.2).size === at(box, 15.8).size && at(box, 12.2).size === 0.25);
  t.eq("the double sigh tops up before it lets go", [at(sigh, 0.5).kind, at(sigh, 2.5).kind, at(sigh, 4).kind], ["in", "top", "out"]);
  t.near("...and the top-up is continuous with the first breath", at(sigh, 1.999).size, at(sigh, 2.001).size, 0.01);
  t.near("a negative time is the start, not a crash", at(slow, -5).size, 0.25, 1e-9);
  t.ok("a day-long session is still fine", at(slow, 86400).cycle === 8640);
  t.ok("the labels say what to do", ["Breathe in", "A little more", "Breathe out", "Hold"].every((s) => PATTERNS.some((p) => p.phases.some((x) => phaseAt(p, 0) && true)) && s));
}

t.group("the vibration");
{
  for (const p of PATTERNS) {
    const w = hapticCycle(p);
    const total = w.timings.reduce((a, b) => a + b, 0);
    t.eq(`${p.id}: one breath of vibration is exactly one breath long`, total, cycleSecs(p) * 1000);
    t.eq(`${p.id}: a strength for every duration`, w.timings.length, w.amplitudes.length);
    t.ok(`${p.id}: durations are whole milliseconds and never negative`, w.timings.every((x) => Number.isInteger(x) && x >= 0));
    t.ok(`${p.id}: only the first can be nothing`, w.timings.slice(1).every((x) => x > 0));
    t.ok(`${p.id}: strengths are 0 to 255`, w.amplitudes.every((a) => Number.isInteger(a) && a >= 0 && a <= 255));
    t.ok(`${p.id}: it starts with an off, which is the shape Android's waveform takes`, w.amplitudes[0] === 0);
    t.ok(`${p.id}: off and on alternate`, w.amplitudes.every((a, i) => (i % 2 === 0) === (a === 0)));
    t.ok(`${p.id}: no pulse is longer than a tap`, w.timings.every((x, i) => w.amplitudes[i] === 0 || x <= 40));
  }

  // A phase just long enough for one pulse and nothing after it must still end on a rest.
  const tiny = hapticCycle({ id: "t", phases: [{ kind: "in", secs: 0.028, from: 0.25, to: 1 }, { kind: "out", secs: 1, from: 1, to: 0.25 }] });
  t.ok("a phase of exactly one pulse's length is all rest, so it can't run into the next one", tiny.amplitudes[0] === 0 && tiny.timings[0] >= 28 && tiny.amplitudes.every((a, i) => (i % 2 === 0) === (a === 0)), tiny);

  // Slice the slow breath into its two halves and read the pulses in each.
  const w = hapticCycle(slow);
  let clock = 0;
  const pulses = [];
  w.timings.forEach((ms, i) => { if (w.amplitudes[i] > 0) pulses.push({ at: clock, amp: w.amplitudes[i] }); clock += ms; });
  const inhale = pulses.filter((x) => x.at < 4000), exhale = pulses.filter((x) => x.at >= 4000);
  t.ok("both halves have pulses", inhale.length > 5 && exhale.length > 5);
  t.ok("breathing in, they get stronger every time", inhale.every((x, i) => i === 0 || x.amp >= inhale[i - 1].amp) && inhale[inhale.length - 1].amp > inhale[0].amp + 150);
  t.ok("breathing out, they get weaker every time", exhale.every((x, i) => i === 0 || x.amp <= exhale[i - 1].amp) && exhale[0].amp > exhale[exhale.length - 1].amp + 150);
  const gaps = (list) => list.slice(1).map((x, i) => x.at - list[i].at);
  const g = gaps(inhale);
  t.ok("breathing in, they come closer together", g.every((x, i) => i === 0 || x <= g[i - 1] + 1) && g[0] > g[g.length - 1] + 100);
  const ge = gaps(exhale);
  t.ok("breathing out, they spread apart", ge.every((x, i) => i === 0 || x >= ge[i - 1] - 1) && ge[ge.length - 1] > ge[0] + 100);
  t.ok("so it works on a motor that can't vary strength: the spacing alone changes", g[0] !== g[g.length - 1]);
  t.ok("it peaks at the top of the breath", Math.max(...pulses.map((x) => x.amp)) === pulses.filter((x) => x.at < 4100).slice(-1)[0].amp || Math.max(...pulses.map((x) => x.amp)) >= 240);

  // A hold is silence.
  const b = hapticCycle(box);
  let c2 = 0; const bp = [];
  b.timings.forEach((ms, i) => { if (b.amplitudes[i] > 0) bp.push(c2); c2 += ms; });
  t.ok("a hold has no vibration in it", bp.every((x) => !(x >= 4200 && x < 7900) && !(x >= 12200 && x < 15900)), bp.filter((x) => x >= 4200 && x < 7900));
  t.ok("...and the two breaths either side of it do", bp.some((x) => x < 4000) && bp.some((x) => x >= 8000 && x < 12000));

  const s = hapticCycle(sigh);
  let c3 = 0; const sp = [];
  s.timings.forEach((ms, i) => { if (s.amplitudes[i] > 0) sp.push({ at: c3, amp: s.amplitudes[i] }); c3 += ms; });
  t.ok("the top-up carries on from where the first breath got to, not from the bottom",
    sp.filter((x) => x.at >= 2000 && x.at < 3000)[0].amp >= sp.filter((x) => x.at < 2000).slice(-1)[0].amp - 25);
}

t.group("for a browser that can only buzz");
{
  const w = hapticCycle(slow);
  const v = vibratePattern(w);
  t.ok("the leading nothing is dropped, since vibrate() starts with a buzz", v[0] === 28, v.slice(0, 3));
  t.eq("it is the same length in time", v.reduce((a, b) => a + b, 0), 10000);
  t.ok("all whole milliseconds, all positive", v.every((x) => Number.isInteger(x) && x > 0));
  t.eq("a wave that starts with a real wait keeps it", vibratePattern({ timings: [50, 28], amplitudes: [0, 200] }), [50, 28]);
}

t.group("settings");
{
  t.eq("the defaults: slow breath, with haptics, and not started for you", surfSettings(undefined), { pattern: "slow", haptics: true, auto: false });
  t.eq("an unknown pattern falls back", surfSettings({ surf: { pattern: "dragon" } }).pattern, "slow");
  t.eq("a chosen one is kept", surfSettings({ surf: { pattern: "box" } }).pattern, "box");
  t.ok("haptics can be turned off, and only by saying so", surfSettings({ surf: { haptics: false } }).haptics === false && surfSettings({ surf: { haptics: undefined } }).haptics === true);
  t.ok("starting by itself is opt-in", surfSettings({ surf: { auto: true } }).auto === true && surfSettings({ surf: { auto: "yes" } }).auto === false);
  t.eq("the exported default matches", DEFAULT_SURF, surfSettings({}));
}
