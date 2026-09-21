#!/usr/bin/env node
// Publishes a build to Supabase Storage, and writes the manifest the app checks.
//
//   SUPABASE_URL=https://xxx.supabase.co \
//   SUPABASE_SERVICE_KEY=<service role key> \
//   node scripts/deploy-supabase.mjs [--bucket app] [--dir dist] [--notes "What changed"]
//
// The service role key bypasses row-level security, which is exactly why it belongs in a
// terminal and never in the app. It is read from the environment and never written anywhere.
//
// NOT VERIFIED AGAINST A LIVE PROJECT: written without one, so the request shapes follow the
// published Storage API but have only been exercised against a stub.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
export const contentType = (path) => TYPES[path.slice(path.lastIndexOf("."))] || "application/octet-stream";

/**
 * Hashed asset filenames can be cached forever; everything else must not be, or a browser
 * will keep serving last week's index.html and the update will never arrive.
 */
export function cacheControl(path) {
  if (/\/assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z]+$/.test(`/${path}`)) return "public, max-age=31536000, immutable";
  if (/(^|\/)(index\.html|sw\.js|registerSW\.js|version\.json|manifest\.webmanifest)$/.test(path)) {
    return "no-cache";
  }
  return "public, max-age=3600";
}

export function filesIn(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return filesIn(full, base);
    return [{ path: relative(base, full).split("\\").join("/"), full, size: statSync(full).size }];
  });
}

const upload = async ({ base, key, bucket }, path, body, type) => {
  const res = await fetch(`${base}/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": type,
      "Cache-Control": cacheControl(path),
      // Replace whatever is there: a deploy is not an append.
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${path}: ${res.status} ${text.slice(0, 200)}`);
  }
};

/** Only when run directly — importing this file (the tests do) must not deploy anything. */
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

async function main() {
  const base = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY || "";
  const BUCKET = arg("bucket", "app");
  const DIR = arg("dir", "dist");
  const NOTES = arg("notes", "");
  const DRY = process.argv.includes("--dry-run");

  if (!base || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_KEY first. See docs/supabase.md.");
    process.exit(1);
  }

  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const commit = (() => {
    try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return ""; }
  })();
  
  const manifest = {
    app: "momentum",
    version: pkg.version,
    build: new Date().toISOString(),
    commit,
    notes: NOTES,
  };
  
  const files = filesIn(DIR);
  console.log(`${files.length} files from ${DIR}/ → ${BUCKET} (${(files.reduce((a, f) => a + f.size, 0) / 1024).toFixed(0)} kB)`);
  console.log(`manifest: v${manifest.version}${commit ? ` · ${commit}` : ""}`);
  
  if (DRY) {
    files.forEach((f) => console.log(`  ${f.path}  ${contentType(f.path)}  ${cacheControl(f.path)}`));
    console.log("\n--dry-run: nothing was uploaded.");
    return;
  }
  
  for (const file of files) {
    await upload({ base, key, bucket: BUCKET }, file.path, readFileSync(file.full), contentType(file.path));
    process.stdout.write(".");
  }
  // The manifest goes last, so it never announces a build whose files aren't all there yet.
  await upload({ base, key, bucket: BUCKET }, "version.json", JSON.stringify(manifest, null, 2), "application/json");
  console.log(`\nPublished. ${base}/storage/v1/object/public/${BUCKET}/index.html`);
}

if (isMain) await main();
