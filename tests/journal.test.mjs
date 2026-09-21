import { atDate, suite } from "./harness.mjs";
import {
  entryText, filterEntries, groupByMonth, journalStats, onThisDay, toMarkdown, wordCount,
  writingStreak,
} from "../src/lib/journal.js";

const t = suite("journal");

const TODAY = "2026-09-21";
const CLOCK = `${TODAY}T10:00:00`;

let n = 0;
const entry = (date, patch = {}) => ({
  id: `e${++n}`, date, kind: "free", text: "", moods: [], pillarId: null,
  favorite: false, createdAt: n, ...patch,
});
const note = (date, text) => ({ date, note: text, mood: 3 });

t.group("counting words");
{
  t.eq("plain prose", wordCount("three words here"), 3);
  t.eq("runs of whitespace are one break", wordCount("two   \n  words"), 2);
  t.eq("nothing is nothing", wordCount(""), 0);
  t.eq("...and so is only spaces", wordCount("   \n "), 0);
  t.eq("...and so is nothing at all", wordCount(null), 0);
}

t.group("what an entry says");
{
  t.eq("a free entry is its text", entryText({ kind: "free", text: "Went for a walk" }), "Went for a walk");
  // Gratitude entries hold a list, and the empty slots people leave behind shouldn't
  // become blank lines in an export or pad the word count.
  t.eq("a gratitude entry is its items",
    entryText({ kind: "gratitude", items: ["Coffee", "", "Rain"] }), "Coffee\nRain");
  t.eq("an empty gratitude entry is empty", entryText({ kind: "gratitude", items: [] }), "");
  t.eq("a free entry with nothing in it", entryText({ kind: "free" }), "");
}

t.group("writing on consecutive days");
atDate(CLOCK, () => {
  t.eq("three days running", writingStreak(
    [entry("2026-09-21"), entry("2026-09-20"), entry("2026-09-19")], []), 3);
  // Not having written yet today is not a broken streak — the day isn't over.
  t.eq("today still being blank doesn't break it",
    writingStreak([entry("2026-09-20"), entry("2026-09-19")], []), 2);
  t.eq("...but a missed day does",
    writingStreak([entry("2026-09-21"), entry("2026-09-19"), entry("2026-09-18")], []), 1);

  // A reflection left in a check-in is writing too.
  t.eq("a check-in note counts as having written",
    writingStreak([entry("2026-09-21")], [note("2026-09-20", "Tough day, but I showed up")]), 2);
  t.eq("...but an empty one doesn't",
    writingStreak([entry("2026-09-21")], [note("2026-09-20", "   ")]), 1);
  t.eq("...and neither does a check-in with no note at all",
    writingStreak([entry("2026-09-21")], [{ date: "2026-09-20", mood: 4 }]), 1);

  t.eq("two entries on one day are still one day",
    writingStreak([entry("2026-09-21"), entry("2026-09-21"), entry("2026-09-20")], []), 2);
  t.eq("never written", writingStreak([], []), 0);
});

t.group("the numbers under a journal");
atDate(CLOCK, () => {
  const entries = [
    entry("2026-09-21", { text: "one two three" }),
    entry("2026-09-20", { text: "a much longer entry with rather more words in it", favorite: true }),
    entry("2026-08-30", { kind: "gratitude", items: ["Rain", "Coffee"] }),
  ];
  const s = journalStats(entries, []);
  t.eq("every entry is counted", s.total, 3);
  t.eq("...and every word", s.words, 3 + 10 + 2);
  t.eq("...averaged", s.avgWords, Math.round(15 / 3));
  t.eq("only this month's entries are this month's", s.thisMonth, 2);
  t.eq("days written, not entries written", s.daysWritten, 3);
  t.eq("starred entries are counted", s.favourites, 1);
  t.eq("the longest is the one with the most words", s.longest.text.startsWith("a much longer"), true);

  const empty = journalStats([], []);
  t.eq("an empty journal averages zero rather than dividing by it", empty.avgWords, 0);
  t.eq("...and has no longest entry", empty.longest, null);
});

t.group("finding an entry again");
{
  const entries = [
    entry("2026-09-21", { text: "Ran five miles before work", moods: ["proud"], pillarId: "health" }),
    entry("2026-09-20", { text: "Quiet morning", moods: ["calm"], pillarId: "spiritual", favorite: true }),
    entry("2026-09-19", { kind: "gratitude", items: ["My brother", "Rain on the window"] }),
    entry("2026-09-18", { text: "", prompt: "What went well this week?" }),
  ];
  const ids = (list) => list.map((e) => e.date);

  t.eq("no filters, everything", filterEntries(entries, {}).length, 4);
  t.eq("by text", ids(filterEntries(entries, { query: "five miles" })), ["2026-09-21"]);
  t.eq("...ignoring case", ids(filterEntries(entries, { query: "QUIET" })), ["2026-09-20"]);
  // The words of a gratitude list live in its items, not in a text field.
  t.eq("...reaching inside a gratitude list", ids(filterEntries(entries, { query: "brother" })), ["2026-09-19"]);
  // An entry can be empty and still be findable by the question it was answering.
  t.eq("...and matching the prompt", ids(filterEntries(entries, { query: "went well" })), ["2026-09-18"]);
  t.eq("whitespace is not a search", filterEntries(entries, { query: "   " }).length, 4);

  t.eq("by mood", ids(filterEntries(entries, { mood: "calm" })), ["2026-09-20"]);
  t.eq("by pillar", ids(filterEntries(entries, { pillarId: "health" })), ["2026-09-21"]);
  t.eq("by star", ids(filterEntries(entries, { favouritesOnly: true })), ["2026-09-20"]);
  t.eq("filters narrow together", filterEntries(entries, { query: "quiet", mood: "proud" }).length, 0);
}

t.group("grouping by month");
{
  const days = [
    { date: "2026-09-21", entries: [entry("2026-09-21")] },
    { date: "2026-09-02", entries: [entry("2026-09-02"), entry("2026-09-02")] },
    { date: "2026-08-15", entries: [entry("2026-08-15")] },
  ];
  const groups = groupByMonth(days);
  t.eq("one group per month", groups.map((g) => g.mKey), ["2026-09", "2026-08"]);
  t.eq("newest month first", groups[0].mKey, "2026-09");
  t.eq("days stay inside their month", groups[0].items.length, 2);
  t.eq("entries are counted across the month's days", groups[0].entryCount, 3);
  t.eq("nothing to group", groupByMonth([]), []);
}

t.group("on this day");
{
  const marks = onThisDay([
    entry("2026-08-21", { text: "A month back" }),
    entry("2026-06-21", { text: "Three months back" }),
    entry("2025-09-21", { text: "A year back" }),
    entry("2026-09-01", { text: "Not a milestone" }),
  ], TODAY);
  t.eq("only the dates that have something on them",
    marks.map((m) => m.label), ["A month ago", "Three months ago", "A year ago"]);
  t.eq("...carrying the entry itself", marks[0].entry.text, "A month back");
  t.eq("nothing written then, nothing shown", onThisDay([entry("2026-09-01")], TODAY), []);

  // The 31st has no counterpart in a 30-day month, and inventing one would silently look
  // up a date that cannot exist.
  const shortMonth = onThisDay([entry("2026-04-30", { text: "End of April" })], "2026-05-31");
  t.eq("the 31st falls back to the last day of a shorter month", shortMonth.length, 1);
  t.eq("...and it's the right entry", shortMonth[0].entry.text, "End of April");
  const leap = onThisDay([entry("2026-02-28", { text: "Not a leap year" })], "2026-03-28");
  t.eq("...and February is no different", leap.length, 1);
}

t.group("exporting it all");
{
  const md = toMarkdown([
    entry("2026-09-21", { text: "Ran five miles", moods: ["proud"], pillarId: "health", favorite: true }),
    entry("2026-09-20", { kind: "gratitude", items: ["Rain", ""], prompt: "What are you grateful for?" }),
  ], [note("2026-09-21", "Showed up anyway")]);

  t.ok("it opens as a document", md.startsWith("# Journal"));
  t.ok("newest day first", md.indexOf("Sep 21") < md.indexOf("Sep 20"), md.slice(0, 120));
  t.ok("the check-in reflection comes through", /> From check-in: Showed up anyway/.test(md));
  t.ok("a gratitude list exports as a list", /- Rain/.test(md));
  t.ok("...without the slots left blank", !/^- $/m.test(md));
  t.ok("the prompt is kept with what it prompted", /\*\*What are you grateful for\?\*\*/.test(md));
  t.ok("a star is recorded", /starred/.test(md));
  t.ok("...alongside the pillar and mood by name", /Health/.test(md) && /Proud/.test(md), md);

  // A check-in with a note but no journal entry is still a day worth exporting.
  const onlyCheckin = toMarkdown([], [note("2026-09-19", "Short but honest")]);
  t.ok("a day with only a check-in still appears", /Short but honest/.test(onlyCheckin), onlyCheckin);
  t.eq("an empty journal exports an empty document", toMarkdown([], []), "# Journal\n");
}
