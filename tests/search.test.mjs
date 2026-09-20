import { suite } from "./harness.mjs";
import { MIN_QUERY, excerpt, scoreText, searchEverything } from "../src/lib/search.js";
import { newTask, weeklyRule } from "../src/lib/tasks.js";

const t = suite("search");

const state = {
  tasks: [
    newTask({ id: "t1", text: "Book dentist", dueDate: "2026-09-22" }),
    newTask({ id: "t2", text: "Car service", notes: "ring the garage about the booking" }),
    newTask({ id: "t3", text: "Trip", subtasks: [{ id: "s1", text: "Book flights" }] }),
    newTask({ id: "t4", text: "Old booking", archivedAt: 1 }),
    newTask({
      id: "h1", kind: "build", text: "Read ten pages", startDate: "2026-01-01",
      recurrence: weeklyRule(["mon", "wed", "fri"]),
    }),
    newTask({
      id: "h2", kind: "break", text: "No reading in bed", startDate: "2026-01-01",
      recurrence: weeklyRule(["mon"]),
    }),
  ],
  journalEntries: [
    { id: "j1", date: "2026-09-10", kind: "free", text: "Long walk by the river and a good coffee afterwards." },
    { id: "j2", date: "2026-09-12", kind: "free", text: "Nothing much.", prompt: "What went well today?" },
    { id: "j3", date: "2026-08-01", kind: "gratitude", items: ["the river", "quiet mornings"] },
  ],
  transactions: [
    { id: 1, type: "expense", amount: 240, catId: "dining", date: "2026-09-12", payee: "River Bistro", note: "birthday" },
    { id: 2, type: "expense", amount: 60, catId: "transport", date: "2026-09-02", payee: "Garage", note: "service" },
    { id: 3, type: "income", amount: 2600, catId: "salary", date: "2026-09-01", payee: "Work", note: "" },
  ],
  goals: [
    { id: "g1", text: "Run 10k", why: "to feel strong", subtasks: [{ id: "x", text: "Book a race" }] },
    { id: "g2", text: "Read 20 books", done: true },
  ],
  strategies: [{ id: "s1", name: "Emergency fund", target: 3000, current: 500 }],
};

const run = (q) => searchEverything(state, q);
const group = (res, id) => res.groups.find((g) => g.id === id);
const titles = (res, id) => (group(res, id)?.items || []).map((r) => r.title);

t.group("scoring");
{
  // Explainable on purpose: a name beats a body, an exact name beats a prefix, and there is
  // no fuzzy matching — a phone keyboard plus fuzzy scoring produces confident nonsense.
  t.ok("an exact name wins", scoreText("Run", "run") > scoreText("Running club", "run"));
  t.ok("a prefix beats a word inside", scoreText("Running club", "run") > scoreText("A long run today", "run"));
  t.ok("a word boundary beats mid-word", scoreText("A long run today", "run") > scoreText("Brunch", "run"));
  t.eq("no match is zero", scoreText("Nothing here", "xyz"), 0);
  t.eq("nothing to match against", scoreText("", "run"), 0);
  t.ok("weight scales the result", scoreText("Run", "run", 0.5) === scoreText("Run", "run") * 0.5);
  // The query goes into a RegExp for the word-boundary test, so anything typed has to be
  // escaped first — brackets in a payee name shouldn't throw.
  t.eq("regex characters in a query are matched literally", scoreText("a (b) c", "(b)"), 30);
  t.eq("...and match nothing when they aren't there", scoreText("a b c", "(b)"), 0);
}

t.group("a short query says nothing");
{
  // One letter matches most of the app, which is noise rather than an answer.
  t.eq("the floor", MIN_QUERY, 2);
  t.eq("one character", run("r").total, 0);
  t.ok("...and says why rather than looking broken", run("r").tooShort);
  t.eq("an empty field isn't an error", run("  ").tooShort, false);
}

t.group("across everything");
{
  const res = run("river");
  t.eq("the kinds that matched", res.groups.map((g) => g.id), ["journal", "money"]);
  t.eq("a journal entry", titles(res, "journal").length, 2);
  t.eq("a transaction by payee", titles(res, "money"), ["River Bistro"]);
  t.eq("...counted across all of them", res.total, 3);

  t.eq("a task by name", titles(run("dentist"), "task"), ["Book dentist"]);
  t.eq("a task by its notes", titles(run("garage"), "task"), ["Car service"]);
  t.eq("a task by a subtask", titles(run("flights"), "task"), ["Trip"]);
  t.ok("an archived task is not a result", !titles(run("booking"), "task").includes("Old booking"));

  // Habits are their own kind: they live in a different place and are found differently.
  const reading = run("read");
  t.eq("habits are grouped apart from tasks", titles(reading, "habit"), ["Read ten pages", "No reading in bed"]);
  t.ok("...with their schedule as the subtitle",
    /Mon, Wed, Fri/.test(group(reading, "habit").items[0].subtitle));
  t.ok("...and a break habit says so", /Breaking/.test(group(reading, "habit").items[1].subtitle));

  t.eq("a goal by name", titles(run("10k"), "goal"), ["Run 10k"]);
  t.eq("a goal by why", titles(run("strong"), "goal"), ["Run 10k"]);
  t.eq("a money goal too", titles(run("emergency"), "goal"), ["Emergency fund"]);
  t.ok("...marked as one", /Money goal/.test(group(run("emergency"), "goal").items[0].subtitle));

  t.eq("a transaction by category name", titles(run("eating"), "money"), ["River Bistro"]);
  t.eq("...and by note", titles(run("birthday"), "money"), ["River Bistro"]);
  t.ok("...with the amount in the subtitle", /240/.test(group(run("birthday"), "money").items[0].subtitle));

  t.eq("nothing at all matches nothing", run("zzzzz").total, 0);
  t.eq("...and there are no empty groups to render", run("zzzzz").groups, []);
}

t.group("order");
{
  const res = run("book");
  // "Book dentist" starts with it; "Book flights" is a subtask of "Trip" and scores lower;
  // "Old booking" is archived and shouldn't be there at all.
  t.eq("the strongest match first", titles(res, "task")[0], "Book dentist");
  t.ok("a body match comes after a name match", titles(res, "task").indexOf("Trip") > 0);
  // Groups keep their declared order: a list that reorders itself as you type is a list
  // you can't aim at.
  t.eq("groups stay in the same order whatever matched",
    run("book").groups.map((g) => g.id).filter((id) => ["task", "goal"].includes(id)), ["task", "goal"]);
}

t.group("results carry what's needed to open them");
{
  t.ok("a task result carries its task", !!group(run("dentist"), "task").items[0].task);
  t.ok("a journal result carries its entry", !!group(run("river"), "journal").items[0].entry);
  t.ok("a money result carries its transaction", !!group(run("bistro"), "money").items[0].tx);
  t.ok("a goal result carries its goal", !!group(run("10k"), "goal").items[0].goal);
  t.ok("a money goal carries its strategy", !!group(run("emergency"), "goal").items[0].strategy);
  t.ok("everything has a date to sort and show by",
    group(run("river"), "journal").items.every((r) => !!r.date));
}

t.group("rows don't say the same thing twice");
{
  // The date has its own column on the row, so a subtitle repeating it is just crowding.
  t.eq("a task's subtitle doesn't repeat its due date",
    group(run("dentist"), "task").items[0].subtitle, "");
  t.eq("...but does show a matching note", group(run("garage"), "task").items[0].subtitle,
    "ring the garage about the booking");
  // An entry with no prompt is already titled by its own opening words.
  const opening = group(run("long walk"), "journal").items[0];
  t.eq("a journal excerpt that only repeats the title is dropped", opening.subtitle, null);
  const later = group(run("coffee"), "journal").items[0];
  t.ok("...but a match further in is worth showing", /coffee/i.test(later.subtitle || ""), later.subtitle);
}

t.group("showing why something matched");
{
  const res = group(run("coffee"), "journal").items[0];
  t.ok("the excerpt contains the match", /coffee/i.test(res.subtitle), res.subtitle);
  t.ok("...and is trimmed around it", res.subtitle.length < 80, res.subtitle);
  t.ok("...with ellipses where it was cut", /…/.test(res.subtitle), res.subtitle);
  t.eq("a short body is shown whole", excerpt("Nothing much.", "much"), "Nothing much.");
  t.eq("no body, nothing to excerpt", excerpt("", "x"), "");
  t.eq("a match at the start doesn't get a leading ellipsis",
    excerpt("Coffee and a walk", "coffee"), "Coffee and a walk");
}

t.group("capping");
{
  const many = { ...state, tasks: Array.from({ length: 12 }, (_, i) => newTask({ id: `x${i}`, text: `Book ${i}` })) };
  const res = searchEverything(many, "book");
  t.eq("a group shows at most a handful", group(res, "task").items.length, 6);
  t.eq("...and says how many more there are", group(res, "task").more, 6);
  // The total counts every match across every kind — twelve tasks plus two goals that
  // happen to mention a book — not just the rows on screen.
  t.eq("the total is the true count, not the shown one", res.total, 14);
  t.eq("a custom cap is honoured", searchEverything(many, "book", { perKind: 2 }).groups[0].items.length, 2);
}

t.group("an empty app");
{
  const empty = searchEverything({}, "anything");
  t.eq("nothing to search isn't an error", [empty.total, empty.groups], [0, []]);
}
