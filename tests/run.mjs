// Runs every tests/*.test.mjs and reports. `npm test`.
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { totals, unfreezeDate } from "./harness.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const only = process.argv[2]; // `npm test tasks` runs just tasks.test.mjs

const files = (await readdir(here))
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => !only || f.includes(only))
  .sort();

if (!files.length) {
  console.error(only ? `No test file matches "${only}".` : "No test files found.");
  process.exit(1);
}

const started = Date.now();
for (const file of files) {
  const before = totals().fail;
  try {
    await import(join(here, file));
  } catch (err) {
    // A module that throws on import is a failure like any other, not a crashed run.
    totals().fail++;
    totals().failures.push({ file, name: "module failed to load", detail: String(err?.stack || err) });
  } finally {
    // A test that pinned the clock and threw must not leave it pinned for the next file.
    unfreezeDate();
  }
  const added = totals().fail - before;
  console.log(`${added ? "FAIL" : "ok  "}  ${file}`);
}

const { pass, fail, failures } = totals();

if (fail) {
  console.log(`\n${fail} failing:\n`);
  failures.forEach((f) => {
    console.log(`  ✗ ${f.file} — ${f.name}`);
    if (f.detail !== undefined) {
      const text = typeof f.detail === "string" ? f.detail : JSON.stringify(f.detail);
      console.log(`      ${text}`);
    }
  });
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed, ${files.length} files, ${Date.now() - started}ms`);
process.exit(fail ? 1 : 0);
