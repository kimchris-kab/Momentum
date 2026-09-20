import { suite } from "./harness.mjs";
import {
  BACKUP_FORMAT, backupFilename, exportPayload, inspectImport, stateFromImport, summarise,
} from "../src/lib/backup.js";
import { emptyState } from "../src/lib/migrate.js";

const t = suite("backup");

t.group("backup.js");
{
  const at = Date.UTC(2026, 8, 19, 10, 30, 0); // 2026-09-19
  const state = { ...emptyState(), tasks: [{ id: "a" }], dayLog: { "2026-09-18": {} } };
  const p = exportPayload(state, at);
  t.eq("exportPayload app/format", [p.app, p.format], ["momentum", BACKUP_FORMAT]);
  t.eq("exportPayload schema matches state", p.schema, state.version);
  t.eq("exportPayload exportedAt is ISO", p.exportedAt, "2026-09-19T10:30:00.000Z");
  t.ok("exportPayload carries the state by reference", p.data === state);
  t.eq("backupFilename is dated", backupFilename(at), "momentum-backup-2026-09-19.json");

  t.eq("summarise drops empty collections", summarise(state), [["Tasks and habits", 1], ["Days of completions", 1]]);
  t.eq("summarise of junk is empty", summarise(null), []);
  t.eq("summarise counts goals and strategies together",
    summarise({ goals: [1, 2], strategies: [3] }), [["Goals", 3]]);

  t.eq("inspectImport rejects an empty file", inspectImport("  ").error, "That file is empty.");
  t.ok("inspectImport rejects broken JSON", /valid JSON/.test(inspectImport("{nope").error));
  t.ok("inspectImport rejects unrelated JSON", /not like a Momentum backup/.test(inspectImport('{"a":1}').error));
  t.ok("inspectImport rejects a bare number", inspectImport("42").ok === false);

  const wrapped = JSON.stringify(exportPayload(state, at));
  const r = inspectImport(wrapped);
  t.ok("inspectImport accepts a wrapped export", r.ok === true, r.error);
  t.eq("inspectImport reports exportedAt", r.exportedAt, "2026-09-19T10:30:00.000Z");
  t.eq("inspectImport summarises", r.summary, [["Tasks and habits", 1], ["Days of completions", 1]]);

  const bare = inspectImport(JSON.stringify(state));
  t.ok("inspectImport accepts a bare state object", bare.ok === true, bare.error);
  t.eq("inspectImport falls back to state.version for schema", bare.schema, state.version);

  const future = inspectImport(JSON.stringify({ ...exportPayload(state, at), format: BACKUP_FORMAT + 1 }));
  t.ok("inspectImport refuses a newer format", future.ok === false);
  t.ok("...and says which format", /format 2/.test(future.error), future.error);

  const restored = stateFromImport({ tasks: [{ id: "z" }] });
  t.eq("stateFromImport keeps imported data", restored.tasks, [{ id: "z" }]);
  t.eq("stateFromImport fills missing collections", [restored.savedViews, restored.srbai], [[], []]);
  t.ok("stateFromImport sets the current schema", restored.version === emptyState().version);
  t.ok("stateFromImport carries notification defaults", !!restored.settings.notify);
}
