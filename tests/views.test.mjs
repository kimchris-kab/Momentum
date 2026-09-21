import { suite } from "./harness.mjs";
import {
  EMPTY_FILTERS, activeCount, applyFilters, describeFilters, isFiltered, newView, sameFilters,
} from "../src/lib/views.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";
import { pillarOf } from "../src/data/constants.js";

const t = suite("views");

const TODAY = "2026-09-19";
const LISTS = [{ id: "work", name: "Work" }];
const PILLARS = [{ id: "health", name: "Health" }];

const tasks = [
  newTask({ id: "a", text: "Alpha", listId: "work", priority: "high", starred: true, dueDate: TODAY }),
  newTask({ id: "b", text: "Beta", dueDate: "2026-09-10" }),                     // overdue
  newTask({ id: "c", text: "Gamma", dueDate: "2026-09-22", pillarId: "health" }), // this week
  newTask({ id: "d", text: "Delta" }),                                            // no date
  newTask({ id: "e", text: "Epsilon", dueDate: "2026-12-01" }),                   // far off
  newTask({ id: "f", text: "Walk", kind: "build", startDate: "2026-01-01", recurrence: weeklyRule(["sat"]) }),
  newTask({ id: "g", text: "Read", kind: "build", startDate: "2026-01-01", recurrence: weeklyRule(["mon"]) }),
  newTask({ id: "h", text: "Old", dueDate: "2026-09-10", done: true }),           // overdue but finished
];
const ids = (f) => applyFilters(tasks, f, TODAY).map((x) => x.id);

t.group("counting what's on");
{
  t.eq("nothing by default", activeCount(EMPTY_FILTERS), 0);
  // The list scope and the search box are always-on controls, not filters someone switched
  // on, so they mustn't make the "clear filters" button appear.
  t.eq("a list scope isn't a filter", activeCount({ listId: "work" }), 0);
  t.eq("nor is a search", activeCount({ query: "alpha" }), 0);
  t.eq("the real ones count", activeCount({ starred: true, priority: "high", due: "today" }), 3);
  t.ok("and that's what 'filtered' means", isFiltered({ starred: true }) && !isFiltered({ query: "x" }));
  t.eq("a partial filter set is filled in", newView({ starred: true }).filters, { ...EMPTY_FILTERS, starred: true });
}

t.group("filtering");
{
  t.eq("everything, unfiltered", ids({}).length, tasks.length);
  t.eq("by list", ids({ listId: "work" }), ["a"]);
  t.eq("by star", ids({ starred: true }), ["a"]);
  t.eq("by priority", ids({ priority: "high" }), ["a"]);
  t.eq("an unset priority counts as medium", ids({ priority: "med" }).includes("b"), true);
  t.eq("by pillar", ids({ pillarId: "health" }), ["c"]);
  t.eq("by search", ids({ query: "alph" }), ["a"]);

  t.eq("overdue means late and unfinished", ids({ overdue: true }), ["b"]);
  t.ok("a finished late task isn't overdue", !ids({ overdue: true }).includes("h"));
  // A repeating task has no due date at all, so it can never be "overdue" — it either
  // landed today or it didn't.
  t.ok("a repeating task is never overdue", !ids({ overdue: true }).includes("f"));

  // "Due today" has to mean "lands on today" for a repeating task, or the most common
  // filter in the app hides exactly the things the day is made of.
  t.eq("due today includes habits that land today", ids({ due: "today" }), ["a", "f"]);
  t.eq("this week is today plus the next seven days", ids({ due: "week" }).filter((x) => x < "f"), ["a", "c"]);
  t.ok("...and keeps repeating tasks in view", ids({ due: "week" }).includes("g"));
  t.eq("no date means no date and no schedule", ids({ due: "none" }), ["d"]);

  t.eq("filters stack", ids({ due: "today", starred: true }), ["a"]);
  t.eq("a stack with nothing in it", ids({ due: "none", starred: true }), []);
}

t.group("describing a view");
{
  const opts = { lists: LISTS, pillars: PILLARS };
  t.eq("nothing on", describeFilters(EMPTY_FILTERS, opts), "All tasks");
  t.eq("a list by name", describeFilters({ listId: "work" }, opts), "Work");
  t.eq("a pillar by name", describeFilters({ pillarId: "health" }, opts), "Health");
  t.eq("priority reads as words", describeFilters({ priority: "med" }, opts), "Medium priority");
  t.eq("several chips are joined", describeFilters({ starred: true, due: "today" }, opts), "Starred · Today");
  t.eq("a search is quoted", describeFilters({ query: "rent" }, opts), "“rent”");
  t.eq("an unknown list still says something", describeFilters({ listId: "gone" }, opts), "List");
}

t.group("saved views");
{
  const a = newView({ starred: true, due: "today" }, "  Morning  ");
  t.eq("names are trimmed", a.name, "Morning");
  t.ok("ids are unique", newView({}).id !== newView({}).id);
  // Two views holding the same chips are the same view, whatever they're called — that's
  // what stops the save button offering to save a duplicate.
  t.ok("same chips, same view", sameFilters(a.filters, { starred: true, due: "today" }));
  t.ok("a different chip makes a different view", !sameFilters(a.filters, { starred: true }));
  t.ok("an absent value and a null are the same thing", sameFilters({}, EMPTY_FILTERS));
}

t.group("looking up a pillar that may not exist");
{
  t.eq("a known id resolves", pillarOf("health").name, "Health");
  t.eq("no id at all is no pillar, not a stand-in", pillarOf(null), null);
  t.eq("...and neither is an empty one", pillarOf(""), null);
  // The shape a migrated v1 save or a restored backup arrives in. Looking this up directly
  // returns undefined, which crashed on the next property access.
  t.eq("an id this build doesn't have falls back", pillarOf("telepathy").name, "No pillar");
  t.ok("...to something safe to render",
    !!pillarOf("telepathy").color && !!pillarOf("telepathy").Icon);
}
