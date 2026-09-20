import { atDate, suite } from "./harness.mjs";
import {
  EARLY_DAYS, START_SMALL_MAX, WOOP_STEPS, goalsNeedingWoop, onboardingState, startSmallCheck,
  woopComplete, woopOf, woopProgress,
} from "../src/lib/woop.js";
import {
  HABIT_TYPES, TYPE_BY_ID, defaultCueFor, expectation, hasCommitment, typeOf, typesFor,
} from "../src/lib/habitTypes.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";

const t = suite("woop and habit types");

const TODAY = "2026-09-19";
const CLOCK = `${TODAY}T12:00:00`;
const EVERY_DAY = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const habit = (patch) => newTask({
  id: `h-${Math.random()}`, kind: "build", text: "Walk", startDate: "2026-09-10",
  recurrence: weeklyRule(EVERY_DAY), ...patch,
});
const full = { wish: "Run 10k", outcome: "Feeling strong", obstacle: "I skip when it rains", plan: "Short loop instead" };

t.group("mental contrasting");
{
  // Oettingen: fantasy alone lowers attainment. The obstacle and the if-then are the half
  // that does the work, which is why all four steps are required and they're ordered.
  t.eq("four steps, in order", WOOP_STEPS.map((s) => s.id), ["wish", "outcome", "obstacle", "plan"]);
  t.ok("the obstacle step asks about you, not the world", /in YOU/.test(WOOP_STEPS[2].prompt));
  t.ok("the plan step is an if-then", /when that happens/i.test(WOOP_STEPS[3].prompt));

  t.eq("a goal with nothing on it", woopOf({}), { wish: "", outcome: "", obstacle: "", plan: "", at: null });
  t.ok("all four filled in is complete", woopComplete({ woop: full }));
  t.ok("three of four is not", !woopComplete({ woop: { ...full, plan: "" } }));
  t.ok("whitespace isn't an answer", !woopComplete({ woop: { ...full, plan: "   " } }));
  t.eq("progress counts what's filled", woopProgress({ woop: { ...full, plan: "" } }), 3);

  const goals = [
    { id: 1, text: "Run 10k" },
    { id: 2, text: "Read more", woop: full },
    { id: 3, text: "Old goal", done: true },
    { id: 4, text: "   " },
  ];
  t.eq("only real, unfinished goals without a pass", goalsNeedingWoop(goals).map((g) => g.id), [1]);
  t.eq("nothing to prompt about", goalsNeedingWoop([]), []);
}

t.group("starting small");
atDate(CLOCK, () => {
  const three = { tasks: [habit(), habit(), habit()] };
  const five = { tasks: [habit(), habit(), habit(), habit(), habit()] };
  t.eq("the ceiling", START_SMALL_MAX, 3);
  t.eq("three is fine", startSmallCheck(three, TODAY), null);
  const check = startSmallCheck(five, TODAY);
  t.ok("more than three while everything is new gets a word", !!check);
  t.eq("...naming the count and the overage", [check.count, check.over], [5, 2]);
  t.ok("...and it warns rather than blocks", /consider/i.test(check.text));

  // Past the first few weeks this is the scope nudge's job, and that one argues from the
  // person's own completion data rather than from a rule.
  const settled = { tasks: [habit({ startDate: "2026-01-01" }), habit(), habit(), habit(), habit()] };
  t.eq("an established set is left alone", startSmallCheck(settled, TODAY), null);
  t.eq("the window", EARLY_DAYS, 21);
  t.eq("archived habits don't count toward the ceiling",
    startSmallCheck({ tasks: [...five.tasks.slice(0, 3), habit({ archivedAt: 1 }), habit({ archivedAt: 1 })] }, TODAY),
    null);
});

t.group("identity first");
{
  const empty = onboardingState({ tasks: [], identities: {} });
  t.ok("a new user has neither", !empty.hasIdentity && empty.habitCount === 0 && !empty.complete);
  t.ok("an identity alone isn't enough — the habits are the evidence",
    !onboardingState({ tasks: [], identities: { health: "moves every day" } }).complete);
  t.ok("a habit alone isn't either", !onboardingState({ tasks: [habit()], identities: {} }).complete);
  t.ok("both is done", onboardingState({ tasks: [habit()], identities: { health: "moves daily" } }).complete);
  t.ok("blank text isn't an identity", !onboardingState({ tasks: [], identities: { health: "  " } }).hasIdentity);
  t.ok("a dismissal is remembered",
    onboardingState({ tasks: [], identities: {}, settings: { onboarded: true } }).dismissed);
}

t.group("habit types");
{
  t.ok("every type carries a cue, a window and its levers",
    HABIT_TYPES.every((x) => x.cue && x.weeks?.length === 2 && x.levers?.length && x.note));
  t.ok("every window is a real range, not a promise",
    HABIT_TYPES.every((x) => x.weeks[1] > x.weeks[0]));
  t.eq("a type reads off the task", typeOf(habit({ habitType: "physical" })).id, "physical");
  t.eq("an untyped habit has none", typeOf(habit()), null);
  t.eq("an unknown type isn't invented", typeOf(habit({ habitType: "nonsense" })), null);

  // The cue that suits the type, since a clock is the weakest anchor for most of them and
  // the strongest for exactly one.
  t.eq("a simple habit stacks onto a routine", defaultCueFor("simple"), "routine");
  t.eq("a physical one anchors to a place", defaultCueFor("physical"), "location");
  t.eq("deep work is the one case a time block genuinely helps", defaultCueFor("cognitive"), "time");
  t.eq("an unknown type falls back to the default anchor", defaultCueFor("nope"), "routine");
  t.ok("break habits get their own types", typesFor("break").length > 0);
  t.ok("...and build habits don't see the break-only ones",
    typesFor("build").every((x) => !x.breakOnly));
}

t.group("honest expectations");
{
  const physical = habit({ habitType: "physical" });
  const exp = expectation(physical);
  // Lally's 18–254 days is the headline: a range, never "21 days", which is Maltz's anecdote.
  t.eq("a range, taken from the type", [exp.lo, exp.hi], TYPE_BY_ID.physical.weeks);
  t.ok("stated as a spread, with the spread admitted", /between \d+ and \d+ weeks/.test(exp.text));
  t.ok("...and never as a single number", !/\b21 days\b/.test(exp.text));

  t.eq("early on, nothing's wrong", expectation(physical, 3).phase, "early");
  t.ok("...and it says so", /nothing's wrong/.test(expectation(physical, 3).hint));
  t.eq("inside the window", expectation(physical, 20).phase, "inRange");
  t.eq("past it", expectation(physical, 60).phase, "long");
  // Past the window the useful advice is about the cue, not about trying harder.
  t.ok("...where the advice is to re-anchor, not to push", /cue/.test(expectation(physical, 60).hint));
  t.eq("an untyped habit gets no claim at all", expectation(habit(), 5), null);

  t.ok("a commitment is only a commitment when it's written",
    hasCommitment(habit({ commitment: "£20 to charity if I skip" })) && !hasCommitment(habit({ commitment: "  " })));
}
