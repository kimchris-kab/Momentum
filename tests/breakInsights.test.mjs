import { suite } from "./harness.mjs";
import {
  BREAK_MINIMUMS, breakFindings, hasBreakEvidence, peakTime, peakWeekday, topCause, urgeRate,
} from "../src/lib/breakInsights.js";
import { newLapse, newUrge } from "../src/lib/urges.js";

const t = suite("break insights");

const quit = { id: "q1", kind: "break", text: "Doomscrolling", trigger: "Boredom" };
// Dated by local wall time, the way the app stamps them.
const lapseAt = (iso, patch = {}) => newLapse({ taskId: "q1", at: new Date(iso).getTime(), ...patch });

t.group("nothing said without enough behind it");
{
  t.eq("the floor for a pattern", BREAK_MINIMUMS.MIN_LAPSES, 4);
  const three = ["2026-09-01T22:00", "2026-09-02T22:30", "2026-09-03T23:00"].map((d) => lapseAt(d));
  t.eq("three slips, however alike, are not a pattern", peakTime(three), null);
  t.eq("...and produce no findings", breakFindings({ tasks: [quit], urgeLog: three }), []);
  t.ok("...so the section stays hidden", !hasBreakEvidence({ tasks: [quit], urgeLog: three }));
  t.eq("no habits, no findings", breakFindings({ tasks: [], urgeLog: [] }), []);
}

t.group("when in the day");
{
  const night = ["2026-09-01T22:00", "2026-09-02T21:30", "2026-09-03T23:10", "2026-09-04T10:00"]
    .map((d) => lapseAt(d));
  const peak = peakTime(night);
  t.eq("the stretch holding most of them is named", peak.band.id, "night");
  t.eq("...with the count behind it", [peak.n, peak.of], [3, 4]);

  const spread = ["2026-09-01T02:00", "2026-09-02T08:00", "2026-09-03T14:00", "2026-09-04T19:00"]
    .map((d) => lapseAt(d));
  t.eq("spread evenly, nothing is named", peakTime(spread), null);
}

t.group("which day of the week");
{
  // Sunday is weekday 0. Filtering falsy values would have made it impossible to name.
  const sundays = ["2026-09-06T20:00", "2026-09-13T20:00", "2026-09-20T20:00", "2026-09-16T20:00"]
    .map((d) => lapseAt(d));
  const sun = peakWeekday(sundays);
  t.ok("Sunday can be the day it breaks", sun && sun.day === "Sundays", sun);
  t.eq("...counted", sun && [sun.n, sun.of], [3, 4]);

  const fridays = ["2026-09-04T20:00", "2026-09-11T20:00", "2026-09-18T20:00", "2026-09-16T20:00", "2026-09-15T20:00"]
    .map((d) => lapseAt(d));
  t.eq("any other day too", peakWeekday(fridays)?.day, "Fridays");
  t.eq("two on one day is not a weekday pattern",
    peakWeekday(["2026-09-04T20:00", "2026-09-11T20:00", "2026-09-15T20:00", "2026-09-16T20:00"].map((d) => lapseAt(d))), null);
}

t.group("the trigger and the feeling behind them");
{
  const lapses = [
    lapseAt("2026-09-01T22:00", { trigger: "Can't sleep", feeling: "tired" }),
    lapseAt("2026-09-02T22:00", { trigger: "can't sleep", feeling: "tired" }),
    lapseAt("2026-09-03T15:00", { trigger: "Waiting", feeling: "bored" }),
    lapseAt("2026-09-04T22:00", { trigger: "Can't sleep", feeling: "tired" }),
  ];
  const trig = topCause(lapses, "trigger");
  t.eq("the most common trigger is named, case aside", trig && [trig.n, trig.of], [3, 4]);
  t.eq("...and so is the feeling", topCause(lapses, "feeling")?.value, "tired");
  t.eq("lapses that gave no trigger aren't counted against it",
    topCause([...lapses, lapseAt("2026-09-05T22:00")], "trigger")?.of, 4);
  t.eq("an even spread names nothing",
    topCause([1, 2, 3, 4].map((i) => lapseAt(`2026-09-0${i}T20:00`, { trigger: `T${i}` })), "trigger"), null);

  const found = breakFindings({ tasks: [quit], urgeLog: lapses });
  const trigFinding = found.find((f) => /sets it off/.test(f.label));
  // The one it names isn't the one typed at setup — and that's worth saying.
  t.ok("a trigger that differs from the setup guess says so",
    trigFinding && /isn't the trigger you named/.test(trigFinding.text), trigFinding);
  const agreed = breakFindings({ tasks: [{ ...quit, trigger: "can't sleep" }], urgeLog: lapses })
    .find((f) => /sets it off/.test(f.label));
  t.ok("...and one that matches it says that instead", agreed && /you knew/.test(agreed.text), agreed);
}

t.group("urges ridden out");
{
  const at = (i) => new Date(`2026-09-0${i}T20:00`).getTime();
  const rode = [1, 2, 3, 4].map((i) => newUrge({ taskId: "q1", at: at(i) }));
  t.eq("four urges is not enough to rate", urgeRate(rode), null);
  const five = [...rode, newUrge({ taskId: "q1", at: at(5), outcome: "gave-in" })];
  t.eq("five is", urgeRate(five), { rode: 4, of: 5, pct: 80 });
  const f = breakFindings({ tasks: [quit], urgeLog: five });
  t.ok("riding most out is good news, with the numbers", f.some((x) => x.tone === "good" && /4 of 5/.test(x.text)), f);

  const losing = [1, 2, 3, 4, 5].map((i) => newUrge({ taskId: "q1", at: at(i), outcome: i === 1 ? "rode-out" : "gave-in" }));
  const l = breakFindings({ tasks: [quit], urgeLog: losing }).find((x) => /urges/i.test(x.label));
  t.ok("losing most still counts the ones won", l && /1 of 5/.test(l.text) && /more than none/.test(l.text), l);
}

t.group("every finding is checkable");
{
  const lapses = [
    lapseAt("2026-09-06T22:00", { trigger: "Can't sleep", feeling: "tired" }),
    lapseAt("2026-09-13T22:30", { trigger: "Can't sleep", feeling: "tired" }),
    lapseAt("2026-09-20T23:00", { trigger: "Can't sleep", feeling: "tired" }),
    lapseAt("2026-09-16T21:30", { trigger: "Can't sleep", feeling: "tired" }),
  ];
  const all = breakFindings({ tasks: [quit, { ...quit, id: "archived", archivedAt: 1 }], urgeLog: lapses });
  t.ok("every finding carries a number", all.length > 0 && all.every((f) => /\d/.test(f.text)), all);
  t.ok("...and a tone to render by", all.every((f) => ["good", "bad"].includes(f.tone)));
  t.ok("archived habits are left out", all.every((f) => !/archived/i.test(f.label)));
}

t.group("a single afternoon is not a pattern");
{
  // The false findings this exists for: four +1s in one afternoon, three of them inside a
  // limit of three, reported as "happens in the afternoon" and "Mondays are where it breaks".
  const smoke = { id: "s1", kind: "break", text: "Smoking", limit: 3 };
  const oneAfternoon = ["14:01", "14:02", "14:03", "14:04"].map((hhmm) =>
    newLapse({ taskId: "s1", at: new Date(`2026-09-28T${hhmm}:00`).getTime() }));
  const found = breakFindings({ tasks: [smoke], urgeLog: oneAfternoon });
  t.eq("four in one afternoon, over a limit once, says nothing", found, []);

  // Stopping altogether, four slips on one day is still one day for day and time patterns.
  const stopped = { ...smoke, limit: 0 };
  const same = breakFindings({ tasks: [stopped], urgeLog: oneAfternoon });
  t.ok("four slips on one day don't name a weekday", !same.some((f) => /where it breaks/.test(f.label)), same);
  t.ok("...or a time of day", !same.some((f) => /happens/.test(f.label)), same);

  // Over the limit on four separate days is the real thing.
  const fourDays = [21, 22, 23, 24].flatMap((d) => [1, 2, 3, 4].map((i) =>
    newLapse({ taskId: "s1", at: new Date(`2026-09-${d}T2${i - 1}:00:00`).getTime() })));
  const real = breakFindings({ tasks: [smoke], urgeLog: fourDays });
  t.ok("over the limit on four different nights is named", real.some((f) => /happens at night/.test(f.label)), real);
  t.ok("...counted in days, not events", real.some((f) => /4 of your last 4/.test(f.text)), real);
}
