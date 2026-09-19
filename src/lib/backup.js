import { SCHEMA_VERSION, emptyState } from "./migrate.js";

// Ten phases in, everything this app knows lives in one browser's localStorage with no
// sync: habits, the completion log, SRBAI history, focus sessions, journal entries, money
// records, goals. Clear site data, change phone, or have the browser evict storage under
// pressure, and all of it is gone with no way back. CSV export covered transactions alone.
//
// This is the way out. Deliberately a plain JSON file: no format to reverse-engineer later,
// readable in any text editor, and restorable by the same code that wrote it.
export const BACKUP_APP = "momentum";
export const BACKUP_FORMAT = 1;

export function exportPayload(state, at = Date.now()) {
  return {
    app: BACKUP_APP,
    format: BACKUP_FORMAT,
    schema: SCHEMA_VERSION,
    exportedAt: new Date(at).toISOString(),
    data: state,
  };
}

export const backupFilename = (at = Date.now()) =>
  `momentum-backup-${new Date(at).toISOString().slice(0, 10)}.json`;

export function downloadJson(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const count = (v) => (Array.isArray(v) ? v.length : v && typeof v === "object" ? Object.keys(v).length : 0);

/** A plain-language inventory, so nobody restores a file without seeing what's in it. */
export function summarise(data) {
  if (!data || typeof data !== "object") return [];
  const rows = [
    ["Tasks and habits", count(data.tasks)],
    ["Days of completions", count(data.dayLog)],
    ["Automaticity readings", count(data.srbai)],
    ["Focus sessions", count(data.focusSessions)],
    ["Check-ins", count(data.checkins)],
    ["Journal entries", count(data.journalEntries)],
    ["Money records", count(data.transactions)],
    ["Recurring entries", count(data.recurring)],
    ["Goals", count(data.goals) + count(data.strategies)],
    ["Saved views", count(data.savedViews)],
  ];
  return rows.filter(([, n]) => n > 0);
}

/**
 * Reads a backup file without applying it. Every failure mode gets its own message,
 * because "invalid file" tells someone holding their only copy of three months of data
 * nothing at all.
 */
export function inspectImport(raw) {
  if (!raw || !String(raw).trim()) {
    return { ok: false, error: "That file is empty." };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That isn't valid JSON — it may have been edited or truncated." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "That file doesn't contain a backup." };
  }

  // Accept both a wrapped export and a bare state object, since someone may well have
  // copied the inner data out by hand.
  const data = parsed.app === BACKUP_APP ? parsed.data : parsed;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "That file doesn't contain a backup." };
  }
  if (!Array.isArray(data.tasks) && !Array.isArray(data.transactions) && !data.checkins) {
    return { ok: false, error: "That looks like JSON, but not like a Momentum backup." };
  }
  if (parsed.app === BACKUP_APP && parsed.format > BACKUP_FORMAT) {
    return {
      ok: false,
      error: `That backup was written by a newer version of Momentum (format ${parsed.format}). Update the app first — restoring it here could lose data.`,
    };
  }

  return {
    ok: true,
    exportedAt: parsed.exportedAt || null,
    schema: parsed.schema ?? data.version ?? null,
    summary: summarise(data),
    data,
  };
}

/**
 * What actually gets loaded. Missing collections fall back to the empty state rather than
 * arriving as undefined, so an older backup can't leave the app half-initialised.
 */
export const stateFromImport = (data) => ({ ...emptyState(), ...data, version: SCHEMA_VERSION });
