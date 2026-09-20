import { suite } from "./harness.mjs";
import { SCHEMA_VERSION, emptyState, loadState, serializeState } from "../src/lib/migrate.js";

const t = suite("migrate");

// v1 kept habits as per-weekday template rows plus a per-day copy of them. v2 has one task
// list with recurrence rules and a single completion log. This migration runs once on real
// people's real data, in a browser, with no way back — so it gets the most coverage here.

const V1 = {
  routines: {
    mon: [{ id: 11, text: "Morning walk", priority: "high", time: "07:00", pillarId: "health" }],
    wed: [{ id: 11, text: "Morning walk", priority: "high", time: "07:00", pillarId: "health" }],
    fri: [{ id: 11, text: "morning walk", priority: "high" }],
    tue: [{ id: 12, text: "Read", priority: "med" }],
  },
  breakRoutines: { mon: [{ id: 21, text: "No scrolling in bed", priority: "high" }] },
  dayPlans: {
    "2026-09-14": { tasks: [{ routineId: 11, done: true, source: "routine" }], mantraIdx: 3 },
    "2026-09-16": {
      tasks: [
        { routineId: 11, done: false, source: "routine" },
        { id: 99, text: "Call the bank", done: true, source: "custom", priority: "med" },
      ],
    },
  },
  breakPlans: { "2026-09-14": { tasks: [{ routineId: 21, done: true }] } },
  customTasks: [{ id: 77, text: "Book dentist", priority: "med", createdAt: 1750000000000 }],
  checkins: [{ date: "2026-09-14", mood: 4, energy: 3, scores: {} }],
  goals: [{ id: 1, text: "Run 10k", pillar: "health", target: 10, current: 4 }],
  strategies: [{ id: 2, name: "Emergency fund", target: 3000, current: 500 }],
  identities: { health: "moves every day" },
  journalEntries: [{ id: 3, date: "2026-09-13", text: "A good day." }],
  transactions: [{ id: 1, type: "expense", amount: 60, category: "needs", date: "2026-09-05" }],
  monthlyIncome: "1800",
};

t.group("a fresh install");
{
  const s = emptyState();
  t.eq("is at the current schema", s.version, SCHEMA_VERSION);
  t.ok("has every collection the app reads", [
    "tasks", "dayLog", "checkins", "goals", "strategies", "journalEntries", "transactions",
    "recurring", "focusSessions", "savedViews", "srbai", "freshStarts", "comebacksSeen",
    "reviews", "milestones", "netWorthLog", "categoryBudgets", "dismissedSubs",
  ].every((k) => s[k] !== undefined), Object.keys(s));
  t.ok("has a default list", s.lists.length > 0);
  t.ok("has notification defaults", !!s.settings.notify);
  t.eq("nothing at all loads as empty", loadState(null).version, SCHEMA_VERSION);
  t.eq("junk loads as empty rather than throwing", loadState("{oh no").tasks, []);
  t.eq("a non-object loads as empty", loadState("42").tasks, []);
}

t.group("v1 → v2");
{
  const s = loadState(JSON.stringify(V1));
  t.eq("lands on the current schema", s.version, SCHEMA_VERSION);

  const walk = s.tasks.find((x) => x.text.toLowerCase() === "morning walk");
  t.ok("a habit on three weekdays becomes one task", !!walk);
  t.eq("...with all three weekdays on one rule",
    [...walk.recurrence.weekdays].sort(), ["fri", "mon", "wed"]);
  t.eq("...keeping its details", [walk.kind, walk.time, walk.pillarId], ["build", "07:00", "health"]);
  t.eq("only one task per habit, however many days it ran on",
    s.tasks.filter((x) => x.text.toLowerCase() === "morning walk").length, 1);

  const brk = s.tasks.find((x) => x.kind === "break");
  t.eq("break habits migrate as break habits", brk.text, "No scrolling in bed");

  t.ok("completions are replayed onto the new ids", s.dayLog["2026-09-14"][walk.id].done === true);
  t.ok("break completions too", s.dayLog["2026-09-14"][brk.id].done === true);
  t.ok("a day it wasn't done stays absent", !s.dayLog["2026-09-16"]?.[walk.id]);

  const custom = s.tasks.find((x) => x.text === "Book dentist");
  t.eq("top-level ad-hoc tasks carry over", [custom.kind, custom.listId], ["todo", "inbox"]);
  const nested = s.tasks.find((x) => x.text === "Call the bank");
  t.ok("ad-hoc tasks nested in an old day plan are rescued", !!nested);
  t.eq("...with the day they sat on as their due date", nested.dueDate, "2026-09-16");
  t.ok("...and their completion", nested.done === true);

  t.eq("mantra choices are kept per day", s.mantraIdxByDate["2026-09-14"], 3);
  t.eq("check-ins carry over", s.checkins.length, 1);
  t.eq("goals carry over and gain their new fields",
    [s.goals[0].text, s.goals[0].subtasks, s.goals[0].starred], ["Run 10k", [], false]);
  t.eq("money goals carry over", s.strategies[0].name, "Emergency fund");
  t.eq("identities carry over", s.identities.health, "moves every day");
  t.eq("journal entries gain their new fields",
    [s.journalEntries[0].kind, s.journalEntries[0].moods], ["free", []]);
  t.eq("transactions carry over with their old bucket", s.transactions[0].category, "needs");
  t.eq("income carries over", s.monthlyIncome, "1800");
  t.ok("collections v1 never had arrive empty, not undefined",
    Array.isArray(s.srbai) && Array.isArray(s.focusSessions) && Array.isArray(s.savedViews));
}

t.group("loading a current-schema state");
{
  const saved = { ...emptyState(), tasks: [{ id: "a", text: "Thing" }], settings: { sortMode: "date" } };
  const s = loadState(JSON.stringify(saved));
  t.eq("keeps what was saved", s.tasks[0].text, "Thing");
  t.eq("keeps the settings that were set", s.settings.sortMode, "date");
  t.ok("fills in settings that weren't", s.settings.notify !== undefined);
  t.ok("fills in collections added since", Array.isArray(s.dismissedSubs));

  // Someone with an old v2 save has no `lists`; falling through to an empty array would
  // leave the Tasks view with nowhere to put anything.
  const listless = loadState(JSON.stringify({ ...saved, lists: [] }));
  t.ok("an empty list set falls back to the default", listless.lists.length > 0);
}

t.group("round trip");
{
  const state = { ...emptyState(), tasks: [{ id: "a", text: "Thing" }], monthlyIncome: "900" };
  const back = loadState(serializeState(state));
  t.eq("what goes out comes back", [back.tasks, back.monthlyIncome], [state.tasks, "900"]);
  t.eq("serializing always stamps the current version",
    JSON.parse(serializeState({ ...state, version: 1 })).version, SCHEMA_VERSION);
}
