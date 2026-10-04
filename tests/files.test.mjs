import { suite } from "./harness.mjs";
import { announce, canShareFiles, describeSave, hasNativeFiles, saveFile, shareFile } from "../src/lib/files.js";
import { backupFilename, exportPayload, inspectImport, saveBackup, shareBackup, stateFromImport } from "../src/lib/backup.js";
import { downloadCsv } from "../src/lib/money.js";
import { downloadText } from "../src/lib/journal.js";
import { emptyState } from "../src/lib/migrate.js";

const t = suite("files");

// Getting a file out of the app. The first backup button made a link and clicked it — which does
// nothing inside the Android web view — and still reported "Saved to your downloads". These are
// the cases that would have caught it: what the call does with a real native layer, with one that
// fails, and with a browser; and that it never reports a save that didn't happen.
const asNative = (impl = {}) => {
  const calls = [];
  const events = [];
  globalThis.window = {
    Capacitor: { Plugins: { MomentumFiles: {
      save: async (args) => { calls.push(["save", args]); return impl.save ? impl.save(args) : { name: args.filename, location: "Downloads" }; },
      share: async (args) => { calls.push(["share", args]); if (impl.share) return impl.share(args); return {}; },
    } } },
    dispatchEvent: (e) => events.push(e),
  };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  return { calls, events };
};
const asBrowser = () => {
  const made = { blobs: [], clicks: 0, revoked: [] };
  globalThis.Blob = class { constructor(parts, opts) { made.blobs.push({ text: parts.join(""), type: opts?.type }); } };
  globalThis.URL = { createObjectURL: () => "blob:fake", revokeObjectURL: (u) => made.revoked.push(u) };
  const a = { click: () => { made.clicks++; made.a = a; } };
  globalThis.document = { createElement: () => a, body: { appendChild() {}, removeChild() {} } };
  globalThis.window = { dispatchEvent: () => {} };
  return made;
};
const clear = () => { delete globalThis.window; delete globalThis.document; delete globalThis.Blob; delete globalThis.URL; delete globalThis.CustomEvent; };

t.group("on the phone");
{
  const { calls } = asNative();
  t.ok("the native plugin is noticed", hasNativeFiles());
  t.ok("...and so is the share sheet", canShareFiles());
  const r = await saveFile("momentum-backup-2026-10-04.json", '{"a":1}', "application/json");
  t.eq("a save asks the plugin, with everything it needs", calls[0], ["save", { filename: "momentum-backup-2026-10-04.json", text: '{"a":1}', mime: "application/json" }]);
  t.eq("...and reports where the phone put it", r, { ok: true, via: "native", name: "momentum-backup-2026-10-04.json", location: "Downloads" });
  clear();

  asNative({ save: () => ({ name: "momentum-backup-2026-10-04 (1).json", location: "Downloads" }) });
  const renamed = await saveFile("momentum-backup-2026-10-04.json", "{}", "application/json");
  t.eq("a name the phone changed (a second backup the same day) is reported as it ended up", renamed.name, "momentum-backup-2026-10-04 (1).json");
  clear();
}

t.group("when saving fails");
{
  asNative({ save: () => { throw new Error("Android wouldn't create a file in Downloads"); } });
  const r = await saveFile("b.json", "{}", "application/json");
  t.eq("it says so, and why", [r.ok, r.error], [false, "Android wouldn't create a file in Downloads"]);
  t.ok("...and does not throw into the app", true);
  t.eq("the message names what went wrong", describeSave(r, "Backup"), "Couldn't save backup: Android wouldn't create a file in Downloads");
  clear();

  asNative({ save: () => ({}) });
  const vague = await saveFile("b.json", "{}", "application/json");
  t.eq("an answer that doesn't say where is not a success", vague.ok, false);
  clear();

  asNative({ save: () => { throw "plain string"; } });
  t.eq("an odd rejection still becomes a message", (await saveFile("b.json", "{}")).error, "plain string");
  clear();

  asNative({ save: async () => { throw new Error(""); } });
  t.eq("...and an empty one", (await saveFile("b.json", "{}")).error, "unknown error");
  clear();
}

t.group("sharing");
{
  const { calls } = asNative();
  const r = await shareFile("b.json", '{"x":1}', "application/json");
  t.eq("it asks the share sheet with the file", [r.ok, calls[0]], [true, ["share", { filename: "b.json", text: '{"x":1}', mime: "application/json" }]]);
  clear();
  asNative({ share: () => { throw new Error("no app to share with"); } });
  t.eq("a failure is reported, not thrown", (await shareFile("b.json", "{}")).error, "no app to share with");
  clear();
  asBrowser();
  t.ok("a browser has no share sheet to offer", !canShareFiles());
  t.eq("...and says so if asked anyway", (await shareFile("b.json", "{}")).ok, false);
  clear();
}

t.group("in a browser");
{
  const made = asBrowser();
  t.ok("no native plugin", !hasNativeFiles());
  const r = await saveFile("b.json", '{"a":1}', "application/json");
  t.eq("the usual download still works", [r.ok, r.via, made.blobs[0], made.clicks], [true, "browser", { text: '{"a":1}', type: "application/json" }, 1]);
  t.eq("...named as asked", made.a.download, "b.json");
  clear();

  asBrowser();
  globalThis.document.createElement = () => { throw new Error("no DOM"); };
  const broken = await saveFile("b.json", "{}", "application/json");
  t.eq("a browser that can't download says so rather than throwing", [broken.ok, broken.error], [false, "no DOM"]);
  clear();

  t.ok("with no window at all (this very test runner), nothing is native", !hasNativeFiles() && !canShareFiles());
}

t.group("the backup itself");
{
  const { calls } = asNative();
  const state = { ...emptyState(), tasks: [{ id: "t1", kind: "build", text: "Walk — café ✓" }] };
  const r = await saveBackup(backupFilename(Date.parse("2026-10-04T12:00:00Z")), exportPayload(state));
  t.eq("it's named for the day", calls[0][1].filename, "momentum-backup-2026-10-04.json");
  t.eq("it goes out as JSON", calls[0][1].mime, "application/json");
  t.ok("a real success", r.ok);
  // What's written must be restorable: pass the exact text the plugin was handed back through the
  // same checks the Restore button uses.
  const verdict = inspectImport(calls[0][1].text);
  t.ok("the file that was written is a valid backup", verdict.ok, verdict);
  const restored = stateFromImport(verdict.data);
  t.eq("...and restoring it gives the same habit back, accents and all", restored.tasks[0].text, "Walk — café ✓");
  await shareBackup("momentum-backup-2026-10-04.json", exportPayload(state));
  t.eq("sharing sends the same content", inspectImport(calls[1][1].text).ok, true);
  clear();
}

t.group("journal and money exports");
{
  const { calls, events } = asNative();
  const csv = await downloadCsv("momentum-transactions-2026-10-04.csv", "date,amount\n2026-10-04,1.00");
  t.eq("a money export is saved as csv", [calls[0][1].filename, calls[0][1].mime], ["momentum-transactions-2026-10-04.csv", "text/csv;charset=utf-8"]);
  t.ok("...and the person is told where it went", events[0]?.type === "momentum:toast" && /Transactions saved: momentum-transactions-2026-10-04\.csv in Downloads/.test(events[0].detail), events[0]);
  t.ok("...with the result handed back", csv.ok);
  const md = await downloadText("momentum-journal.md", "# Journal");
  t.eq("a journal export is saved as markdown", [calls[1][1].filename, calls[1][1].mime], ["momentum-journal.md", "text/markdown;charset=utf-8"]);
  t.ok("...and announced", /Journal saved: momentum-journal\.md in Downloads/.test(events[1].detail), events[1]?.detail);
  clear();

  asNative({ save: () => { throw new Error("disk full"); } });
  const ev = [];
  globalThis.window.dispatchEvent = (e) => ev.push(e);
  await downloadCsv("t.csv", "a");
  t.ok("a failed export is announced as a failure, never as a save", /Couldn't save transactions: disk full/.test(ev[0]?.detail) && !/saved:/.test(ev[0].detail), ev[0]?.detail);
  clear();

  announce({ ok: true, name: "x", location: "Downloads" }, "File");
  t.ok("announcing with no window is harmless", true);
}
