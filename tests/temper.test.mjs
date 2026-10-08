import { suite } from "./harness.mjs";
import {
  MIN_FOR_PATTERNS, REACTIONS, TRIGGERS, daysSinceLastReaction, insights, isCalm, newTemperEntry, patterns,
  reactionLabel, triggerLabel,
} from "../src/lib/temper.js";

const t = suite("temper");
const DAY = 86400000;
const NOW = new Date("2026-10-08T12:00:00").getTime();
const at = (daysAgo, hour = 12) => { const d = new Date(NOW - daysAgo * DAY); d.setHours(hour, 0, 0, 0); return d.getTime(); };
const e = (o) => newTemperEntry({ trigger: "tired", reaction: "raised", ...o });

// ---- an entry ----
const one = newTemperEntry({ trigger: "hungry", reaction: "harsh", who: "  my brother  ", note: "walk away first", paused: true, at: new Date("2026-10-07T19:30:00").getTime() });
t.eq("records when", [one.date, one.hour], ["2026-10-07", 19]);
t.eq("and what, trimmed", [one.trigger, one.reaction, one.who, one.note, one.paused], ["hungry", "harsh", "my brother", "walk away first", true]);
t.ok("with a usable id", /^tl-/.test(one.id));
t.eq("two entries get different ids", newTemperEntry({ reaction: "held", at: 5 }).id === newTemperEntry({ reaction: "held", at: 5 }).id, false);
t.eq("an entry that doesn't say what happened is refused", newTemperEntry({ trigger: "tired", reaction: "nonsense" }), null);
t.eq("an unknown trigger becomes 'something else'", newTemperEntry({ trigger: "weird", reaction: "held" }).trigger, "other");
t.eq("long notes are cut", newTemperEntry({ reaction: "held", note: "x".repeat(500) }).note.length, 200);
t.eq("long names are cut", newTemperEntry({ reaction: "held", who: "y".repeat(90) }).who.length, 40);
t.ok("calm reactions are calm", REACTIONS.filter((r) => r.calm).every((r) => isCalm({ reaction: r.id })));
t.ok("the rest aren't", REACTIONS.filter((r) => !r.calm).every((r) => !isCalm({ reaction: r.id })));
t.eq("labels read back", [triggerLabel("tired"), reactionLabel("held")], ["Tired", "Felt it, stayed calm"]);
t.eq("an unknown trigger has a fallback label", triggerLabel("zzz"), "Something else");
t.ok("ids are unique", new Set(TRIGGERS.map((x) => x.id)).size === TRIGGERS.length && new Set(REACTIONS.map((x) => x.id)).size === REACTIONS.length);

// ---- days clear ----
t.eq("never, with an empty log", daysSinceLastReaction([], NOW), null);
t.eq("never, if only calm moments are logged", daysSinceLastReaction([e({ reaction: "held", at: at(1) })], NOW), null);
t.eq("days since the last bad moment", daysSinceLastReaction([e({ at: at(3) }), e({ at: at(9) })], NOW), 3);
t.eq("a calm moment doesn't reset it", daysSinceLastReaction([e({ at: at(5) }), e({ reaction: "held", at: at(1) })], NOW), 5);
t.eq("today is zero", daysSinceLastReaction([e({ at: at(0, 9) })], NOW), 0);

// ---- patterns ----
t.eq("an empty log has nothing to say", insights([], NOW), []);
const few = [e({ at: at(1) }), e({ at: at(2) })];
t.eq("a few entries say how many more are needed", insights(few, NOW), [`${MIN_FOR_PATTERNS - 2} more entries and patterns start to show.`]);
t.eq("with one to go it's singular", insights([...few, e({ at: at(3) }), e({ at: at(4) })], NOW)[0], "1 more entry and patterns start to show.");
t.eq("patterns are withheld until there is enough", patterns(few, NOW).trigger, null);

const rows = [
  e({ trigger: "tired", at: at(1, 21), who: "Sam" }),
  e({ trigger: "tired", at: at(2, 22), who: "sam" }),
  e({ trigger: "tired", at: at(4, 21), who: "Sam" }),
  e({ trigger: "rushed", at: at(9, 8), reaction: "cold" }),
  e({ trigger: "hungry", at: at(10, 18), reaction: "harsh" }),
  e({ trigger: "screen", reaction: "held", at: at(3) }),
];
const p = patterns(rows, NOW);
t.eq("counts everything", [p.total, p.calm, p.bad], [6, 1, 5]);
t.eq("the commonest trigger is found", [p.trigger.key, p.trigger.count], ["tired", 3]);
t.eq("calm moments don't count as triggers", patterns([...rows, e({ trigger: "screen", reaction: "held", at: at(5) }), e({ trigger: "screen", reaction: "paused", at: at(6) })], NOW).trigger.key, "tired");
t.eq("the time of day is found, late hours included", p.part.key, "evening");
t.eq("names are matched without regard to case", [p.who.label, p.who.count], ["sam", 3]);
t.eq("this week against last", [p.thisWeek, p.lastWeek], [3, 2]);
t.eq("which is a rougher week", p.trend, "worse");
t.eq("fewer this week than last is better", patterns([e({ at: at(1) }), e({ at: at(10) }), e({ at: at(11) }), e({ at: at(12) }), e({ at: at(13) })], NOW).trend, "better");
t.ok("insights read as sentences", insights(rows, NOW).every((s) => s.length > 15 && /[.]$/.test(s)));
t.ok("the trigger is named", insights(rows, NOW).some((s) => /tired/i.test(s) && /3 times/.test(s)));
t.ok("so is the week", insights(rows, NOW).some((s) => /rougher week/.test(s)));

// a trigger seen only once is a coincidence, not a pattern
const spread = ["tired", "hungry", "rushed", "screen", "stress"].map((x, i) => e({ trigger: x, at: at(i + 1, 10 + i * 3) }));
t.eq("a one-off is not called a pattern", patterns(spread, NOW).trigger, null);

// ---- does pausing help? ----
const paused = (reaction, i) => e({ paused: true, reaction, at: at(i + 1) });
const free = (reaction, i) => e({ paused: false, reaction, at: at(i + 20) });
const good = [paused("paused", 0), paused("held", 1), paused("held", 2), paused("raised", 3), free("raised", 0), free("harsh", 1), free("raised", 2), free("held", 3)];
const eff = patterns(good, NOW).pauseEffect;
t.eq("calm rate with and without", [eff.with, eff.without], [0.75, 0.25]);
t.ok("said plainly", insights(good, NOW).some((s) => /75%.*25%/.test(s)));
t.eq("too few uses and nothing is claimed", patterns([...rows, paused("held", 0)], NOW).pauseEffect, null);
const flat = [paused("raised", 0), paused("held", 1), paused("raised", 2), free("raised", 0), free("held", 1), free("held", 2)];
t.ok("when pausing doesn't help it says so rather than flattering", insights([...flat, e({ at: at(40) }), e({ at: at(41) })], NOW).some((s) => /hasn't made a difference/.test(s)));
