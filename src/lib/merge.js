// Merging two copies of the state, for when the same account has been used on two devices.
//
// The backup this sits next to is deliberately not sync: one row, replaced wholesale, newest
// device wins. That is safe and easy to explain, and it silently throws away a day's work if
// you logged on your phone and your tablet between backups. This is the alternative — but it
// is worth being exact about what it can and cannot promise, because "merge" invites people
// to assume more than any merge can deliver.
//
// What it guarantees: no record is ever lost. Everything either side knows about ends up in
// the result.
//
// What it cannot: if the SAME record was edited on both devices, one of those edits wins.
// There is no way around that short of a real CRDT, which would mean rewriting every write in
// the app. The winner is the later edit by wall clock, and two devices' clocks may disagree.
//
// The three kinds of collection are listed explicitly below rather than inferred, because
// getting one of them into the wrong group is exactly the bug that loses data quietly.

/** Records that are only ever added, never edited. Union by key; ties keep either. */
const LOGS = {
  milestones: "id",
  focusSessions: "id",
  srbai: "id",
  habitAudit: "id",
  freshStarts: "id",
  reviews: "date",
};

/** Records that can be edited after the fact. Union by id; a conflict goes to the later edit. */
const EDITABLE = ["tasks", "goals", "strategies", "lists", "recurring", "savedViews",
  "transactions", "journalEntries"];

/** One row per date, rewritten in place. */
const BY_DATE = ["checkins", "netWorthLog"];

/** Sets of plain strings — "I've seen this" markers. Union. */
const SETS = ["comebacksSeen", "dismissedSubs"];

/** Maps whose values are replaced wholesale per key. */
const KEYED = ["identities", "moneyPrinciples", "moneyIdeas", "categoryBudgets", "weekPlans",
  "mantraIdxByDate", "freezes"];

/** Everything else is a setting or a scalar and follows whichever state was saved later. */
const WHOLE = ["monthlyIncome", "budgetSplit", "netWorth", "settings", "journalDraft", "lists"];

// How long a deletion is remembered. A tombstone exists to stop the other device resurrecting
// something you deleted; once both have synced it is dead weight, and keeping them forever
// would grow the backup without bound. Three months is far longer than any realistic gap
// between two devices being opened.
export const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const stamp = (r) => r?.updatedAt || r?.at || r?.endedAt || r?.createdAt || 0;

/** Records a deletion so the other device doesn't hand it back. */
export const bury = (graveyard, id, at = Date.now()) =>
  (id ? { ...(graveyard || {}), [id]: at } : (graveyard || {}));

/** Takes a deletion back. An undone delete never happened, so its tombstone must go too. */
export function unbury(graveyard, id) {
  if (!graveyard || !(id in graveyard)) return graveyard || {};
  const { [id]: _raised, ...rest } = graveyard;
  return rest;
}

/** Drops tombstones old enough that nothing can still be carrying the record. */
export function pruneGraveyard(graveyard, now = Date.now()) {
  const out = {};
  Object.entries(graveyard || {}).forEach(([id, at]) => {
    if (now - at < TOMBSTONE_TTL_MS) out[id] = at;
  });
  return out;
}

const mergeGraveyards = (a, b) => {
  const out = { ...(a || {}) };
  Object.entries(b || {}).forEach(([id, at]) => {
    // The earliest deletion is the one to keep: it is the one a stale edit has to beat.
    if (!(id in out) || at < out[id]) out[id] = at;
  });
  return out;
};

const unionBy = (key, mine, theirs) => {
  const out = new Map();
  [...(mine || []), ...(theirs || [])].forEach((r) => {
    const k = r?.[key];
    if (k === undefined || k === null) return;
    if (!out.has(k)) out.set(k, r);
  });
  return [...out.values()];
};

const mergeEditable = (mine, theirs, graveyard) => {
  const out = new Map();
  [...(mine || []), ...(theirs || [])].forEach((r) => {
    if (!r?.id) return;
    const seen = out.get(r.id);
    if (!seen || stamp(r) > stamp(seen)) out.set(r.id, r);
  });
  // A deletion beats an edit that predates it, and loses to one that came after — someone
  // who deleted a task on one device and then edited it on the other meant the edit.
  return [...out.values()].filter((r) => {
    const buriedAt = graveyard[r.id];
    return buriedAt === undefined || stamp(r) > buriedAt;
  });
};

const mergeByDate = (mine, theirs, mineIsNewer) => {
  const out = new Map();
  const first = (mineIsNewer ? theirs : mine) || [];
  const second = (mineIsNewer ? mine : theirs) || [];
  // The later-saved state is applied second, so its row for a date wins.
  [...first, ...second].forEach((r) => { if (r?.date) out.set(r.date, r); });
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
};

const mergeKeyed = (mine, theirs, mineIsNewer) =>
  (mineIsNewer ? { ...(theirs || {}), ...(mine || {}) } : { ...(mine || {}), ...(theirs || {}) });

/**
 * dayLog is the one that matters most: it is what streaks are built from, and it is the most
 * natural thing in the app to merge, because two devices ticking different habits on the same
 * day is not a conflict at all. Merged cell by cell rather than day by day, so a day logged
 * on both devices keeps both ticks.
 */
export function mergeDayLog(mineLog, theirsLog) {
  // Defaults don't catch null, and a hand-edited or truncated backup can hold one.
  const mine = mineLog || {};
  const theirs = theirsLog || {};
  const out = {};
  const dates = new Set([...Object.keys(mine), ...Object.keys(theirs)]);
  dates.forEach((date) => {
    const a = mine[date] || {};
    const b = theirs[date] || {};
    const day = {};
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach((taskId) => {
      const x = a[taskId];
      const y = b[taskId];
      if (!x) { day[taskId] = y; return; }
      if (!y) { day[taskId] = x; return; }
      // Done beats not-done: a tick is a positive act, an absence is just an absence. Between
      // two ticks, the earlier one is when it actually happened.
      if (x.done !== y.done) { day[taskId] = x.done ? x : y; return; }
      day[taskId] = (y.doneAt || Infinity) < (x.doneAt || Infinity) ? y : x;
    });
    out[date] = day;
  });
  return out;
}

const mergeDayFocus = (mineMap, theirsMap) => {
  const mine = mineMap || {};
  const theirs = theirsMap || {};
  const out = {};
  new Set([...Object.keys(mine), ...Object.keys(theirs)]).forEach((date) => {
    out[date] = [...new Set([...(mine[date] || []), ...(theirs[date] || [])])];
  });
  return out;
};

/**
 * Merges two states into one.
 * @param mine   the state on this device
 * @param theirs the state that came back from the backup
 */
export function mergeStates(mine, theirs, { now = Date.now() } = {}) {
  if (!theirs) return mine;
  if (!mine) return theirs;

  const mineIsNewer = (mine.savedAt || 0) >= (theirs.savedAt || 0);
  const newer = mineIsNewer ? mine : theirs;
  const graveyard = pruneGraveyard(mergeGraveyards(mine.graveyard, theirs.graveyard), now);

  const out = { ...newer };

  Object.entries(LOGS).forEach(([key, by]) => {
    out[key] = unionBy(by, mine[key], theirs[key]).filter((r) => !(r.id in graveyard));
  });
  EDITABLE.forEach((key) => { out[key] = mergeEditable(mine[key], theirs[key], graveyard); });
  BY_DATE.forEach((key) => { out[key] = mergeByDate(mine[key], theirs[key], mineIsNewer); });
  SETS.forEach((key) => {
    out[key] = [...new Set([...(mine[key] || []), ...(theirs[key] || [])])];
  });
  KEYED.forEach((key) => { out[key] = mergeKeyed(mine[key], theirs[key], mineIsNewer); });
  WHOLE.forEach((key) => { out[key] = newer[key]; });

  out.dayLog = mergeDayLog(mine.dayLog, theirs.dayLog);
  out.dayFocus = mergeDayFocus(mine.dayFocus, theirs.dayFocus);
  out.graveyard = graveyard;
  out.savedAt = Math.max(mine.savedAt || 0, theirs.savedAt || 0);

  // lists is in both EDITABLE and WHOLE above; the merged version is the one to keep, because
  // losing a list loses everything filed under it.
  out.lists = mergeEditable(mine.lists, theirs.lists, graveyard);
  return out;
}

/**
 * What a merge would change, for showing someone before they commit to it. Counted rather
 * than described: "47 entries, 12 tasks" is checkable, "some things" is not.
 */
export function mergePreview(mine, theirs) {
  if (!theirs) return null;
  const merged = mergeStates(mine, theirs);
  const countable = [...Object.keys(LOGS), ...EDITABLE, ...BY_DATE];
  const gained = {};
  countable.forEach((key) => {
    const before = (mine?.[key] || []).length;
    const after = (merged[key] || []).length;
    if (after > before) gained[key] = after - before;
  });
  const dayCells = (log) => Object.values(log || {}).reduce((a, d) => a + Object.keys(d).length, 0);
  const ticks = dayCells(merged.dayLog) - dayCells(mine?.dayLog);
  return {
    gained,
    ticks: Math.max(0, ticks),
    total: Object.values(gained).reduce((a, b) => a + b, 0) + Math.max(0, ticks),
    merged,
  };
}
