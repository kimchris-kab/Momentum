import { suite } from "./harness.mjs";
import { parseTaskInput } from "../src/lib/parse.js";

const t = suite("parse");

// The rule the whole parser rests on: nothing is applied silently. Every match comes back
// as a token with the span it claimed, so the UI can show it and take it back. These tests
// check both halves — what it understood, and what it left alone.

const TODAY = "2026-09-19"; // a Saturday
const LISTS = [{ id: "inbox", name: "My Tasks" }, { id: "work", name: "Work" }];
const run = (input, extra) => parseTaskInput(input, { today: TODAY, lists: LISTS, ...extra });
const kinds = (r) => r.tokens.map((x) => x.kind);

t.group("dates");
{
  t.eq("today", run("Call mum today").patch.dueDate, TODAY);
  t.eq("tonight is still today", run("Bins tonight").patch.dueDate, TODAY);
  t.eq("tomorrow", run("Call mum tomorrow").patch.dueDate, "2026-09-20");
  t.eq("next week", run("Review next week").patch.dueDate, "2026-09-26");
  t.eq("in n days", run("Chase invoice in 3 days").patch.dueDate, "2026-09-22");
  t.eq("in n weeks", run("Dentist in 2 weeks").patch.dueDate, "2026-10-03");
  t.eq("an explicit date", run("Ship it 2026-10-01").patch.dueDate, "2026-10-01");
  t.eq("a day and month", run("Book tickets 3 oct").patch.dueDate, "2026-10-03");
  t.eq("month first", run("Book tickets oct 3").patch.dueDate, "2026-10-03");
  // A bare "3 mar" typed in September means next March, not one that has already gone.
  t.eq("a month already gone means next year", run("Taxes 3 mar").patch.dueDate, "2027-03-03");

  // Today is a Saturday, so the next Monday is the 21st.
  t.eq("a bare weekday is the next one", run("Standup monday").patch.dueDate, "2026-09-21");
  t.eq("today's own weekday counts as today", run("Tidy saturday").patch.dueDate, TODAY);
  t.eq("'next' pushes it a week further", run("Standup next monday").patch.dueDate, "2026-09-28");
  t.eq("short day names work", run("Standup mon").patch.dueDate, "2026-09-21");
}

t.group("times");
{
  t.eq("am", run("Gym at 7am").patch.time, "07:00");
  t.eq("pm", run("Call at 7pm").patch.time, "19:00");
  t.eq("with minutes", run("Call at 7:30pm").patch.time, "19:30");
  t.eq("24-hour", run("Call 19:30").patch.time, "19:30");
  t.eq("midnight is 00:00, not 12:00", run("Backup at 12am").patch.time, "00:00");
  t.eq("noon", run("Lunch noon").patch.time, "12:00");
  t.eq("midnight by name", run("Deploy midnight").patch.time, "00:00");
  // A bare hour has to guess; 1–6 reads as afternoon, and the chip says so out loud.
  t.eq("a bare small hour reads as afternoon", run("Call at 3").patch.time, "15:00");
  t.eq("a bare large hour reads as morning", run("Gym at 8").patch.time, "08:00");
  t.eq("an impossible time is not a time", run("Code 99:99").patch.time, undefined);
}

t.group("recurrence");
{
  t.eq("every day", run("Read every day").patch.recurrence.freq, "daily");
  t.eq("daily", run("Read daily").patch.recurrence.freq, "daily");
  t.eq("every other day", run("Run every other day").patch.recurrence.interval, 2);
  t.eq("every n days", run("Water plants every 3 days").patch.recurrence.interval, 3);
  t.eq("weekdays", run("Standup on weekdays").patch.recurrence.weekdays,
    ["mon", "tue", "wed", "thu", "fri"]);
  t.eq("weekends", run("Long walk every weekend").patch.recurrence.weekdays, ["sat", "sun"]);
  t.eq("named days, in week order", run("Gym every mon, wed and fri").patch.recurrence.weekdays,
    ["mon", "wed", "fri"]);
  t.eq("a quota", run("Gym 3x a week").patch.recurrence,
    { freq: "weeklyCount", interval: 1, weekdays: [], monthDay: null, timesPerWeek: 3 });
  t.eq("a quota in words", run("Swim twice a week").patch.recurrence.timesPerWeek, 2);
  t.eq("once a week", run("Call gran once a week").patch.recurrence.timesPerWeek, 1);
  t.eq("monthly on a day", run("Pay rent monthly on the 1").patch.recurrence.monthDay, 1);
  t.eq("...with an ordinal suffix", run("Pay rent monthly on the 1st").patch.recurrence.monthDay, 1);
  t.eq("...in the other order", run("Pay rent on the 1st monthly").patch.recurrence.monthDay, 1);
  t.eq("...spelled out in full", run("Pay rent on the 22nd of every month").patch.recurrence.monthDay, 22);
  t.eq("a bare 'every month' takes today's date", run("Pay rent every month").patch.recurrence.monthDay, 19);
  t.eq("...and the title is left clean", run("Pay rent on the 1st monthly").text, "Pay rent");

  // Recurrence is matched before dates on purpose, or "every friday" loses its "friday".
  const repeating = run("Gym every friday");
  t.eq("a repeating weekday is a schedule, not a due date", kinds(repeating), ["repeat"]);
  t.eq("...and clears any due date it would have had", repeating.patch.dueDate, null);
}

t.group("priority, list and pillar");
{
  t.eq("!high", run("Ship it !high").patch.priority, "high");
  t.eq("!1", run("Ship it !1").patch.priority, "high");
  t.eq("!low", run("Tidy !low").patch.priority, "low");
  t.eq("p1", run("Ship it p1").patch.priority, "high");
  t.eq("a list by name", run("Email Bob #work").patch.listId, "work");
  t.eq("a list by prefix", run("Email Bob #wo").patch.listId, "work");
  t.eq("an unknown list is left as plain text", run("Note #nonsense").text, "Note #nonsense");
  t.eq("a pillar", run("Gym @health").patch.pillarId, "health");
  t.eq("an unknown pillar is left alone", run("Note @nobody").text, "Note @nobody");
}

t.group("what it must not eat");
{
  // The word that named this guard: a bare p + low would have quietly turned "plow" into
  // a low-priority "ow".
  t.eq("plow", run("Buy a plow").text, "Buy a plow");
  t.eq("...and claims nothing", kinds(run("Buy a plow")), []);
  t.eq("a word that merely contains a day name", run("Read Sunday Times").text.includes("Times"), true);
  t.eq("no matches means no chips", run("Just some words").hasMatch, false);
  t.eq("an empty line", run("").tokens.length, 0);
}

t.group("the title left behind");
{
  const r = run("Gym tomorrow at 7am 3x a week !high @health");
  t.eq("everything claimed is stripped out", r.text, "Gym");
  t.eq("and every kind is represented", [...kinds(r)].sort(),
    ["date", "pillar", "priority", "repeat", "time"].sort());
  t.eq("spacing is tidied up", run("Call  mum   tomorrow").text, "Call mum");
  t.eq("punctuation isn't left hanging", run("Call mum, tomorrow").text, "Call mum,");
}

t.group("one span, one meaning");
{
  // Two due dates in one line is a typo, not an intent — the first wins.
  const two = run("Call mum today tomorrow");
  t.eq("only one date is taken", two.tokens.filter((x) => x.kind === "date").length, 1);
  t.eq("...the first one", two.patch.dueDate, TODAY);
  t.eq("...and the loser stays in the text", two.text.includes("tomorrow"), true);
}

t.group("taking a match back");
{
  const first = run("Read Friday notes");
  t.eq("it claims the weekday", first.patch.dueDate, "2026-09-25");
  const id = first.tokens[0].id;
  const second = run("Read Friday notes", { ignore: new Set([id]) });
  t.eq("dismissing the chip re-parses without it", second.patch.dueDate, undefined);
  t.eq("...and gives the word back to the title", second.text, "Read Friday notes");
  t.eq("...and the dismissal is reported back", second.ignored, [id]);
  t.ok("token ids are stable across re-parses", run("Read Friday notes").tokens[0].id === id);
}

t.group("token spans");
{
  const r = run("Gym tomorrow");
  const tok = r.tokens[0];
  t.eq("a token knows exactly what it claimed", "Gym tomorrow".slice(tok.start, tok.end), "tomorrow");
  t.eq("...and has something to show for it", tok.label, "Tomorrow");
}
