// Generates every app icon from one definition, so the set can never drift apart and nobody
// has to open a design tool to change the mark.
//
//   node scripts/make-icons.mjs
//
// The mark is "four beads": the same act repeated, each one counting more than the last.
// Rendered through headless Chromium because that is the thing that will actually be drawing
// it — anti-aliasing and all — rather than a library approximating the same job.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "icons");
const ANDROID = join(ROOT, "android", "app", "src", "main", "res");

// Android densities, for both the legacy square icon and the adaptive foreground. The
// foreground canvas is 108dp of which only the middle 72dp is guaranteed to survive the
// launcher's mask, so the mark gets two thirds of it and no more.
const DENSITIES = [
  { dir: "mipmap-mdpi", legacy: 48, fg: 108 },
  { dir: "mipmap-hdpi", legacy: 72, fg: 162 },
  { dir: "mipmap-xhdpi", legacy: 96, fg: 216 },
  { dir: "mipmap-xxhdpi", legacy: 144, fg: 324 },
  { dir: "mipmap-xxxhdpi", legacy: 192, fg: 432 },
];

const PLATE = "#14131F";     // matches the manifest's background_color, so the splash is seamless
const ORANGE = "#E8946F";
const GOLD = "#E8B75D";

// Four beads climbing a gentle rise, in a 100×100 space. Sizes carry the meaning, so the
// contrast stays full throughout — fading the early ones is what made an earlier version
// illegible below about 24px.
const FOUR = [[24, 74, 5.5], [42, 60, 8], [61, 44, 11], [80, 26, 14]];
// Below about 24px four beads stop resolving, so the small end gets three. Same idea, fewer
// repetitions — which is what an icon set is supposed to do rather than shrinking one mark
// until it turns to mush.
const THREE = [[26, 72, 7], [51, 55, 10.5], [76, 32, 14]];

/** Centres a set of beads and scales it to `extent` units of the 100-unit canvas. */
function fit(beads, extent) {
  const xs = beads.flatMap(([x, , r]) => [x - r, x + r]);
  const ys = beads.flatMap(([, y, r]) => [y - r, y + r]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const y0 = Math.min(...ys), y1 = Math.max(...ys);
  const scale = extent / Math.max(x1 - x0, y1 - y0);
  return { scale, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/**
 * @param extent  how much of the 100-unit canvas the mark fills. A maskable icon is cropped
 *                by the launcher to a shape it doesn't tell you, so everything that must
 *                survive belongs inside the central 80% — hence a smaller mark there.
 */
function markSvg(beads, { extent = 68, plate = PLATE, radius = null } = {}) {
  const { scale, cx, cy } = fit(beads, extent);
  const body = beads
    .map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#sweep)"/>`)
    .join("");
  const bg = plate
    ? `<rect width="100" height="100"${radius ? ` rx="${radius}"` : ""} fill="${plate}"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="sweep" gradientUnits="userSpaceOnUse" x1="18" y1="82" x2="82" y2="18">
      <stop offset="0" stop-color="${ORANGE}"/>
      <stop offset="1" stop-color="${GOLD}"/>
    </linearGradient>
  </defs>
  ${bg}
  <g transform="translate(50 50) scale(${scale.toFixed(4)}) translate(${-cx.toFixed(4)} ${-cy.toFixed(4)})">${body}</g>
</svg>`;
}

const TARGETS = [
  { file: "icon-192.png", size: 192, svg: markSvg(FOUR) },
  { file: "icon-512.png", size: 512, svg: markSvg(FOUR) },
  // Full-bleed plate, mark held well inside the safe circle: a launcher may crop this to a
  // circle, a squircle or a teardrop and does not say which.
  { file: "icon-512-maskable.png", size: 512, svg: markSvg(FOUR, { extent: 50 }) },
  { file: "favicon-32.png", size: 32, svg: markSvg(THREE, { extent: 74 }) },
  { file: "favicon-16.png", size: 16, svg: markSvg(THREE, { extent: 78 }) },
];

const run = async () => {
  await mkdir(OUT, { recursive: true });

  const targets = [...TARGETS];
  for (const { dir, legacy, fg } of DENSITIES) {
    targets.push(
      { file: join(dir, "ic_launcher.png"), size: legacy, svg: markSvg(FOUR), root: ANDROID },
      { file: join(dir, "ic_launcher_round.png"), size: legacy, svg: markSvg(FOUR, { radius: 50 }), root: ANDROID },
      // Transparent: the background is a colour resource, and the launcher composites them.
      { file: join(dir, "ic_launcher_foreground.png"), size: fg, svg: markSvg(FOUR, { extent: 44, plate: null }), root: ANDROID },
    );
  }

  // A scalable favicon for browsers that take one, which is most of them now.
  await writeFile(join(OUT, "icon.svg"), markSvg(FOUR, { radius: 22 }));
  // The mark on its own, no plate — for anywhere it sits on the app's own background.
  await writeFile(join(OUT, "mark.svg"), markSvg(FOUR, { extent: 92, plate: null }));

  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium",
  });
  try {
    for (const { file, size, svg, root = OUT } of targets) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      const page = await browser.newPage({ viewport: { width: size, height: size } });
      await page.setContent(
        `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block}</style>`
        + svg.replace('width="100" height="100"', `width="${size}" height="${size}"`),
      );
      await page.screenshot({ path: join(root, file), omitBackground: true });
      await page.close();
      console.log(`  ${file.padEnd(24)} ${size}×${size}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\nWrote ${targets.length} icons plus icon.svg and mark.svg.`);
};

run().catch((e) => { console.error(e); process.exit(1); });
