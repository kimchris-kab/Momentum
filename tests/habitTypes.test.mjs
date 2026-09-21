import { suite } from "./harness.mjs";
import {
  HABIT_TYPES, TYPE_BY_ID, defaultCueFor, expectation, hasCommitment, typeOf, typesFor,
} from "../src/lib/habitTypes.js";
import { CUE_BY_ID, DEFAULT_CUE } from "../src/lib/cues.js";
import { drainActions, queueAction } from "../src/lib/actionQueue.js";

const t = suite("habit types");

t.group("the catalogue");
{
  t.ok("every type is reachable by id", HABIT_TYPES.every((h) => TYPE_BY_ID[h.id] === h));
  t.ok("...and carries what it needs to be rendered",
    HABIT_TYPES.every((h) => h.label && h.examples && h.note && h.levers?.length));
  // The cue a type defaults to has to be a cue that exists, or the sheet opens on nothing.
  t.ok("every default cue is a real cue type", HABIT_TYPES.every((h) => !!CUE_BY_ID[h.cue]),
    HABIT_TYPES.filter((h) => !CUE_BY_ID[h.cue]).map((h) => h.id));

  // The whole point of showing a range: Lally found 18–254 days and only 39 of 82 people
  // fitted the curve at all. A single number would be a promise the evidence can't keep.
  t.ok("every window is a range, low before high",
    HABIT_TYPES.every((h) => Array.isArray(h.weeks) && h.weeks.length === 2 && h.weeks[0] < h.weeks[1]),
    HABIT_TYPES.map((h) => [h.id, h.weeks]));
  t.ok("...and none of them promises three weeks",
    HABIT_TYPES.every((h) => h.weeks[1] > 3));

  t.eq("things to quit are offered only when quitting",
    typesFor("break").map((h) => h.id), ["consumptive"]);
  t.ok("...and never when building", !typesFor("build").some((h) => h.breakOnly));
  t.eq("building offers everything else", typesFor("build").length, HABIT_TYPES.length - 1);
}

t.group("reading a type off a habit");
{
  t.eq("a habit with a type", typeOf({ habitType: "physical" }).id, "physical");
  t.eq("a habit without one", typeOf({ text: "Read" }), null);
  // A type id from an older build shouldn't resolve to something arbitrary.
  t.eq("a type this build doesn't have", typeOf({ habitType: "telepathy" }), null);
  t.eq("nothing at all", typeOf(null), null);

  t.eq("a type brings its usual cue", defaultCueFor("cognitive"), "time");
  t.eq("...and physical habits default to a place", defaultCueFor("physical"), "location");
  t.eq("no type falls back to the strongest anchor", defaultCueFor(undefined), DEFAULT_CUE);
  t.eq("...and so does an unknown one", defaultCueFor("telepathy"), DEFAULT_CUE);
}

t.group("how long this should take");
{
  t.eq("no type, no expectation", expectation({ text: "Read" }), null);

  const cold = expectation({ habitType: "physical" });
  t.eq("the range comes from the type", [cold.lo, cold.hi], [9, 36]);
  t.ok("...and is stated as a range", /between 9 and 36 weeks/.test(cold.text));
  t.eq("...with no phase until there's a week count", cold.phase, null);

  t.eq("before the window opens, nothing is wrong",
    expectation({ habitType: "physical" }, 4).phase, "early");
  t.ok("...and it says so", /nothing's wrong/.test(expectation({ habitType: "physical" }, 4).hint));
  t.ok("...in the singular when it's one week",
    /You're 1 week in/.test(expectation({ habitType: "physical" }, 1).hint));

  t.eq("the low end is inside the window, not before it",
    expectation({ habitType: "physical" }, 9).phase, "inRange");
  t.eq("...and so is the high end",
    expectation({ habitType: "physical" }, 36).phase, "inRange");
  t.eq("past it is past it", expectation({ habitType: "physical" }, 37).phase, "long");
  // The useful reading of "still hard after a year" is that the anchor is wrong, not that
  // the person is.
  t.ok("...and it points at the cue rather than the effort",
    /the cue, not the effort/.test(expectation({ habitType: "physical" }, 52).hint));
}

t.group("a stake someone else knows about");
{
  t.ok("a written commitment counts", hasCommitment({ commitment: "Told Sam I'd run Tuesdays" }));
  t.ok("...but whitespace doesn't", !hasCommitment({ commitment: "   " }));
  t.ok("...and neither does nothing", !hasCommitment({}) && !hasCommitment(null));
}

// ---- The offline action queue ----
// The real round-trip needs a real IndexedDB and is driven in a browser. What matters here
// is the path node can actually reach: a service worker on a platform without IndexedDB must
// degrade rather than take the notification handler down with it.
t.group("queued actions where there is nowhere to queue them");
{
  const queued = await queueAction({ action: "done", taskId: "t1" });
  t.eq("queueing reports that it couldn't", queued, false);
  t.eq("draining an unreachable queue is empty, not an error", await drainActions(), []);
}
