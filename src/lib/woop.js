import { todayStr } from "./date.js";

// Spec item 3, rated STRONG: Oettingen's mental contrasting. Indulging in positive fantasy
// LOWERS effort and attainment; contrasting the wish against the obstacle, then pre-committing
// an if-then plan, is what carries the effect. Goals here had a "why" and a target date — the
// half that does the work was missing.
export const WOOP_STEPS = [
  {
    id: "wish",
    label: "Wish",
    prompt: "What do you want, in one line?",
    placeholder: "Run 10k without stopping",
    help: "Challenging but feasible. Not a fantasy, not a certainty.",
  },
  {
    id: "outcome",
    label: "Outcome",
    prompt: "What's the best thing about getting there?",
    placeholder: "Feeling strong and unhurried on a long run",
    help: "Picture it properly — this is the only step where imagining is the point.",
  },
  {
    id: "obstacle",
    label: "Obstacle",
    prompt: "What in YOU gets in the way?",
    placeholder: "I talk myself out of it when it's raining",
    help: "Inside you, not out in the world. Traffic isn't an obstacle; the part of you that uses traffic as a reason is.",
  },
  {
    id: "plan",
    label: "Plan",
    prompt: "When that happens, what will you do?",
    placeholder: "When it rains, I will run the shorter loop instead of skipping",
    help: "An if-then, pre-decided. This is the step that carries the effect.",
  },
];

export const emptyWoop = () => ({ wish: "", outcome: "", obstacle: "", plan: "", at: null });

export const woopOf = (goal) => ({ ...emptyWoop(), ...(goal?.woop || {}) });

export const woopComplete = (goal) => {
  const w = woopOf(goal);
  return WOOP_STEPS.every((s) => (w[s.id] || "").trim().length > 0);
};

export const woopProgress = (goal) => {
  const w = woopOf(goal);
  return WOOP_STEPS.filter((s) => (w[s.id] || "").trim()).length;
};

/** Goals worth prompting about: real goals, not done, without a contrast pass yet. */
export const goalsNeedingWoop = (goals = []) =>
  goals.filter((g) => !g.done && (g.text || "").trim() && !woopComplete(g));

// ---- Start small (spec item 2) ----
// "Start with 1–3 habits, not many." Self-regulatory scaffolding is effortful early and
// automaticity takes weeks-to-months, so sequencing beats swarming. A soft ceiling — it
// warns, it never blocks, because it is the person's life and not the app's.
export const START_SMALL_MAX = 3;
export const EARLY_DAYS = 21;

export function startSmallCheck(state, today = todayStr()) {
  const habits = (state.tasks || []).filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt);
  if (habits.length <= START_SMALL_MAX) return null;

  // Only speak up while everything is still new — past the first few weeks this is the scope
  // nudge's job, and that one argues from the person's own completion data.
  const oldest = habits.reduce((min, t) => {
    const started = t.startDate || todayStr();
    return started < min ? started : min;
  }, today);
  const ageDays = Math.round((new Date(`${today}T00:00:00`) - new Date(`${oldest}T00:00:00`)) / 86400000);
  if (ageDays > EARLY_DAYS) return null;

  return {
    count: habits.length,
    max: START_SMALL_MAX,
    over: habits.length - START_SMALL_MAX,
    text: `You're starting ${habits.length} habits at once. The evidence is consistent that `
      + `one to three sticks and more than that collapses — early habits need real attention, `
      + `and there isn't enough to go round. Consider parking a few until the first ones hold.`,
  };
}

// ---- Identity first (spec item 1) ----
// Hudson & Fraley (2015): wanting to change a trait did nothing; training implementation
// intentions produced measurable change. Hudson (2019): actually completing behavioural
// challenges predicted change, while setting goals and NOT following through backfired. So
// identity is the frame, and the behaviour is the evidence — never the other way round.
export const IDENTITY_PROMPT = "I am someone who…";
export const IDENTITY_HELP =
  "Name the person, then let the habits be the evidence. Declaring an identity on its own "
  + "does very little — Hudson found that setting a goal and not following through can even "
  + "backfire. Every completed habit below is a vote for this.";

export const hasIdentity = (identities = {}) =>
  Object.values(identities).some((v) => (v || "").trim().length > 0);

export const identityCount = (identities = {}) =>
  Object.values(identities).filter((v) => (v || "").trim().length > 0).length;

/** Onboarding is done once there's an identity and at least one habit to carry it. */
export function onboardingState(state) {
  const habits = (state.tasks || []).filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt);
  return {
    hasIdentity: hasIdentity(state.identities),
    habitCount: habits.length,
    complete: hasIdentity(state.identities) && habits.length > 0,
    dismissed: !!state.settings?.onboarded,
  };
}
