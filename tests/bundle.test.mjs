import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suite } from "./harness.mjs";

const t = suite("bundle");

// recharts is roughly half of everything this app ships. Keeping it off the first-paint
// path is one static import away from being undone by accident, and nothing about a working
// app would look different if it were — so the boundary is asserted here rather than left
// to be rediscovered in a build log.

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const files = [];
const walk = (dir) => {
  readdirSync(join(SRC, dir), { withFileTypes: true }).forEach((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) walk(rel);
    else if (/\.jsx?$/.test(e.name)) files.push(rel);
  });
};
walk("");

const read = (rel) => readFileSync(join(SRC, rel), "utf8");
const staticImports = (text) =>
  [...text.matchAll(/^import\s[^;]*?from\s+["']([^"']+)["']/gm)].map((m) => m[1]);

t.group("what may reach for recharts");
{
  const importers = files.filter((f) => staticImports(read(f)).includes("recharts"));
  // Exactly one module, and it is the one the views load lazily.
  t.eq("only the chart modules import it directly",
    importers.sort(), ["components/PillarRadar.jsx", "views/InsightsView.jsx", "views/MoneyView.jsx"]);

  const today = read("views/TodayView.jsx");
  t.ok("the landing view doesn't import it at all", !staticImports(today).includes("recharts"));
  t.ok("...it loads the chart lazily instead", /lazy\(\s*\(\)\s*=>\s*import\("\.\.\/components\/PillarRadar/.test(today));
  t.ok("...behind a Suspense boundary", /<Suspense/.test(today));
}

t.group("the two chart-heavy views stay split");
{
  const root = read("Momentum.jsx");
  const imports = staticImports(root);
  t.ok("Money is not statically imported", !imports.some((i) => /MoneyView/.test(i)));
  t.ok("Insights is not statically imported", !imports.some((i) => /InsightsView/.test(i)));
  t.ok("...both are lazy", /lazy\(\s*\(\)\s*=>\s*import\("\.\/views\/MoneyView/.test(root)
    && /lazy\(\s*\(\)\s*=>\s*import\("\.\/views\/InsightsView/.test(root));
  t.ok("...with something to show while they arrive", /<Suspense fallback=/.test(root));

  // A lazy view that another eagerly-loaded module also imports is not split at all: the
  // static import pulls it straight back into the entry chunk.
  const lazyViews = ["views/MoneyView.jsx", "views/InsightsView.jsx", "components/PillarRadar.jsx"];
  const leaks = files
    .filter((f) => !lazyViews.includes(f))
    .flatMap((f) => staticImports(read(f))
      .filter((i) => lazyViews.some((v) => i.includes(v.split("/").pop().replace(/\.jsx$/, ""))))
      .map((i) => `${f} → ${i}`));
  t.eq("nothing eagerly imports a split module", leaks, []);
}
