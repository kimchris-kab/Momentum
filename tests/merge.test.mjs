import { suite } from "./harness.mjs";
import {
  TOMBSTONE_TTL_MS, bury, mergeDayLog, mergePreview, mergeStates, pruneGraveyard, unbury,
} from "../src/lib/merge.js";
import { emptyState } from "../src/lib/migrate.js";

const t = suite("merge");

const NOW = new Date("2026-09-21T12:00:00").getTime();
const ago = (ms) => NOW - ms;

const state = (patch = {}) => ({ ...emptyState(), savedAt: NOW, ...patch });
const task = (id, patch = {}) => ({
  id, kind: "todo", text: `Task ${id}`, createdAt: ago(86400000), ...patch,
});
const tx = (id, patch = {}) => ({
  id, type: "expense", amount: 10, catId: "groceries", date: "2026-09-20", createdAt: ago(86400000), ...patch,
});
const ids = (list) => list.map((r) => r.id).sort();

t.group("nothing is lost");
{
  // The case the plain backup gets wrong: two devices, both used, one backup. Whatever the
  // other device did between backups is gone. A merge has to keep both.
  const phone = state({ tasks: [task("a"), task("b")], transactions: [tx(1)] });
  const tablet = state({ tasks: [task("a"), task("c")], transactions: [tx(2)] });
  const merged = mergeStates(phone, tablet, { now: NOW });

  t.eq("tasks from both devices survive", ids(merged.tasks), ["a", "b", "c"]);
  t.eq("...and so do the ledger entries", ids(merged.transactions), [1, 2]);
  t.eq("a record on both sides isn't duplicated", merged.tasks.filter((x) => x.id === "a").length, 1);

  t.eq("merging with nothing is the thing itself", mergeStates(phone, null), phone);
  t.eq("...in either direction", mergeStates(null, tablet), tablet);
}

t.group("the same record edited on both");
{
  const older = state({ savedAt: ago(1000), tasks: [task("a", { text: "Old wording", updatedAt: ago(9000) })] });
  const newer = state({ savedAt: NOW, tasks: [task("a", { text: "New wording", updatedAt: ago(500) })] });

  // One of the two edits has to lose. It is the earlier one, by the clock, and the app says
  // so rather than pretending a merge can keep both.
  t.eq("the later edit wins", mergeStates(older, newer, { now: NOW }).tasks[0].text, "New wording");
  t.eq("...whichever side it came from", mergeStates(newer, older, { now: NOW }).tasks[0].text, "New wording");

  // An edit with no stamp at all is from before this existed; it must not beat a real one.
  const unstamped = state({ tasks: [task("a", { text: "Never stamped", createdAt: 0 })] });
  t.eq("a stamped edit beats an unstamped one",
    mergeStates(unstamped, newer, { now: NOW }).tasks[0].text, "New wording");
}

t.group("a deletion stays deleted");
{
  // Without a tombstone, a union merge hands back everything either side deleted — the
  // record is still sitting in the other device's copy.
  const deleted = state({ tasks: [task("a")], graveyard: bury({}, "b", ago(1000)) });
  const stillHas = state({ savedAt: ago(5000), tasks: [task("a"), task("b")] });

  t.eq("a deleted task doesn't come back", ids(mergeStates(deleted, stillHas, { now: NOW }).tasks), ["a"]);
  t.eq("...from either direction", ids(mergeStates(stillHas, deleted, { now: NOW }).tasks), ["a"]);
  t.ok("...and the tombstone is carried forward, so the next merge knows too",
    "b" in mergeStates(deleted, stillHas, { now: NOW }).graveyard);

  // But deleting on one device and then editing on the other means the edit.
  const editedAfter = state({ savedAt: NOW, tasks: [task("b", { text: "Changed my mind", updatedAt: ago(500) })] });
  t.eq("an edit made after the deletion wins",
    ids(mergeStates(deleted, editedAfter, { now: NOW }).tasks), ["a", "b"]);

  const editedBefore = state({ tasks: [task("b", { text: "Stale", updatedAt: ago(9000) })] });
  t.eq("...but one made before it does not",
    ids(mergeStates(deleted, editedBefore, { now: NOW }).tasks), ["a"]);

  t.eq("deleted ledger entries stay deleted too",
    ids(mergeStates(state({ graveyard: bury({}, 1, ago(1000)) }),
      state({ savedAt: ago(5000), transactions: [tx(1), tx(2)] }), { now: NOW }).transactions), [2]);
}

t.group("taking a deletion back");
{
  const g = bury({}, "a", NOW);
  t.eq("burying records when", g.a, NOW);
  t.eq("burying nothing changes nothing", bury({ x: 1 }, null), { x: 1 });
  t.eq("undo removes the tombstone", unbury(g, "a"), {});
  t.eq("...and is harmless for something never buried", unbury({ x: 1 }, "nope"), { x: 1 });
  t.eq("...even with no graveyard at all", unbury(null, "a"), {});

  // The bug this prevents: delete, undo, sync — and the merge deletes it again on the
  // strength of a deletion that was taken back.
  const undone = state({ tasks: [task("a")], graveyard: unbury(bury({}, "a", ago(1000)), "a") });
  const other = state({ savedAt: ago(5000), tasks: [task("a")] });
  t.eq("an undone delete doesn't delete on the next merge",
    ids(mergeStates(undone, other, { now: NOW }).tasks), ["a"]);
}

t.group("tombstones don't pile up forever");
{
  const old = { gone: ago(TOMBSTONE_TTL_MS + 1000) };
  const recent = { fresh: ago(1000) };
  t.eq("a tombstone past its use is dropped", pruneGraveyard(old, NOW), {});
  t.eq("...and a recent one is kept", pruneGraveyard(recent, NOW), recent);
  t.eq("nothing to prune", pruneGraveyard(null, NOW), {});

  // Once pruned, the record is free to come back — which is correct, because by then both
  // devices have long since seen the deletion.
  const merged = mergeStates(state({ graveyard: old }), state({ savedAt: ago(5000), tasks: [task("gone")] }),
    { now: NOW });
  t.eq("an expired tombstone stops blocking", ids(merged.tasks), ["gone"]);
  t.eq("...and is gone from the graveyard", merged.graveyard, {});

  // Two devices that deleted the same thing at different times keep the earlier deletion,
  // because that is the one a stale edit has to beat.
  const a = state({ graveyard: { x: ago(9000) } });
  const b = state({ graveyard: { x: ago(1000) } });
  t.eq("the earliest deletion is the one remembered", mergeStates(a, b, { now: NOW }).graveyard.x, ago(9000));
}

t.group("the day log, which is what streaks are made of");
{
  // Two devices ticking different habits on the same day is not a conflict at all.
  const mine = { "2026-09-20": { h1: { done: true, doneAt: 100 } } };
  const theirs = { "2026-09-20": { h2: { done: true, doneAt: 200 } } };
  t.eq("both ticks on a shared day are kept",
    Object.keys(mergeDayLog(mine, theirs)["2026-09-20"]).sort(), ["h1", "h2"]);

  t.eq("a day only one device has is kept whole",
    mergeDayLog(mine, { "2026-09-19": { h1: { done: true } } })["2026-09-19"].h1.done, true);

  // A tick is a positive act; an absence is just an absence, and may only mean that device
  // never saw it.
  const ticked = { d: { h: { done: true, doneAt: 500 } } };
  const untouched = { d: { h: { done: false } } };
  t.eq("a tick beats an absence", mergeDayLog(ticked, untouched).d.h.done, true);
  t.eq("...whichever side it is on", mergeDayLog(untouched, ticked).d.h.done, true);

  // Between two ticks of the same thing, the earlier is when it actually happened.
  t.eq("the earlier of two ticks is the true one",
    mergeDayLog({ d: { h: { done: true, doneAt: 900 } } }, { d: { h: { done: true, doneAt: 300 } } }).d.h.doneAt, 300);
  t.eq("a tick with a time beats one without",
    mergeDayLog({ d: { h: { done: true } } }, { d: { h: { done: true, doneAt: 300 } } }).d.h.doneAt, 300);

  t.eq("nothing on either side", mergeDayLog(null, null), {});
}

t.group("the rest of the state");
{
  const mine = state({
    savedAt: NOW,
    checkins: [{ date: "2026-09-20", mood: 5 }],
    dayFocus: { "2026-09-20": ["a"] },
    comebacksSeen: ["x:1"],
    categoryBudgets: { dining: 100 },
    settings: { ...emptyState().settings, sortMode: "manual" },
    monthlyIncome: "2000",
  });
  const theirs = state({
    savedAt: ago(5000),
    checkins: [{ date: "2026-09-19", mood: 3 }, { date: "2026-09-20", mood: 2 }],
    dayFocus: { "2026-09-20": ["b"], "2026-09-19": ["c"] },
    comebacksSeen: ["y:2"],
    categoryBudgets: { dining: 50, travel: 200 },
    settings: { ...emptyState().settings, sortMode: "priority" },
    monthlyIncome: "1500",
  });
  const merged = mergeStates(mine, theirs, { now: NOW });

  t.eq("check-ins from both days survive", merged.checkins.map((c) => c.date), ["2026-09-19", "2026-09-20"]);
  // One row per date, so a day checked in on both devices has to pick one: the later save.
  t.eq("...and a shared day takes the later device's answer",
    merged.checkins.find((c) => c.date === "2026-09-20").mood, 5);

  t.eq("focus picks are pooled, not replaced", merged.dayFocus["2026-09-20"].sort(), ["a", "b"]);
  t.eq("...and a day only one side had is kept", merged.dayFocus["2026-09-19"], ["c"]);
  t.eq("seen-markers are a union", merged.comebacksSeen.sort(), ["x:1", "y:2"]);

  // A budget set on both is one number, not two, and the later save is the one meant.
  t.eq("a budget changed on both takes the later", merged.categoryBudgets.dining, 100);
  t.eq("...and one only the other side had is kept", merged.categoryBudgets.travel, 200);

  t.eq("settings follow the device that saved last", merged.settings.sortMode, "manual");
  t.eq("...and so do plain values", merged.monthlyIncome, "2000");
  t.eq("the merged copy is stamped with the later save", merged.savedAt, NOW);
}

t.group("saying what a merge would do before doing it");
{
  const mine = state({ tasks: [task("a")], transactions: [tx(1)], dayLog: { d: { h1: { done: true } } } });
  const theirs = state({
    savedAt: ago(5000),
    tasks: [task("a"), task("b")],
    transactions: [tx(1), tx(2), tx(3)],
    dayLog: { d: { h1: { done: true }, h2: { done: true } } },
  });
  const preview = mergePreview(mine, theirs);

  // Counted, not described: "2 entries, 1 task" can be checked against the screen, "some
  // things" cannot.
  t.eq("it says how many tasks would arrive", preview.gained.tasks, 1);
  t.eq("...and how many ledger entries", preview.gained.transactions, 2);
  t.eq("...and how many habit ticks", preview.ticks, 1);
  t.eq("...and totals them", preview.total, 4);
  t.ok("...and carries the merged copy, so nothing is computed twice", !!preview.merged);

  // Merging against a backup that holds nothing new should say exactly that.
  t.eq("a merge that changes nothing says nothing changed", mergePreview(mine, mine).total, 0);
  t.eq("no backup, no preview", mergePreview(mine, null), null);
}

t.group("a merge is repeatable");
{
  const phone = state({ tasks: [task("a"), task("b")], graveyard: bury({}, "z", ago(1000)) });
  const tablet = state({ savedAt: ago(5000), tasks: [task("a"), task("c")] });
  const once = mergeStates(phone, tablet, { now: NOW });
  const twice = mergeStates(once, tablet, { now: NOW });
  // Merging the same backup again must not keep changing the answer, or two devices syncing
  // repeatedly would never settle.
  t.eq("merging the same copy twice changes nothing", ids(twice.tasks), ids(once.tasks));
  t.eq("...including the graveyard", twice.graveyard, once.graveyard);
  t.eq("...and merging a state with itself is itself", ids(mergeStates(once, once, { now: NOW }).tasks),
    ids(once.tasks));
}
