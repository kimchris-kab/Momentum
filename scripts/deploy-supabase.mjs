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
import { buildManifest } from "./ota.mjs";

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

export const OTA_KEEP = 3;

/**
 * Publishes a build for installed Android apps to pick up: every file under ota/<id>/, then ota/latest.json last so it
 * never points at a build whose files haven't all arrived, then the folders of builds more than OTA_KEEP back are removed.
 * `fetcher` is injectable so the order and the requests can be checked without a project.
 */
// A storage hiccup (a 5xx from the edge, a rate limit, a dropped connection) is not a reason to abandon a publish half-way: the files are
// uploaded one by one and the manifest last, so retrying one file is always safe.
const TRANSIENT = (status) => status === 408 || status === 429 || status >= 500;

export async function publishOta({
  base, key, bucket = "app", dir = "dist", notes = "", privateKeyPem = "", dry = false, fetcher = fetch, log = () => {},
  tries = 5, sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const info = JSON.parse(readFileSync(join(dir, "build.json"), "utf8"));
  const manifest = buildManifest({ dir, info, notes, privateKeyPem });
  const prefix = `ota/${manifest.id}`;
  log(`OTA ${manifest.id}: ${manifest.files.length} files, needs native API ${manifest.requiresNativeApi}, ${manifest.signature ? "signed" : "NOT signed"}`);
  if (dry) {
    manifest.files.forEach((f) => log(`  ${prefix}/${f.path}  ${contentType(f.path)}`));
    return { manifest, uploaded: 0, pruned: [] };
  }
  const auth = { Authorization: `Bearer ${key}` };
  const put = async (path, body, type) => {
    let last = "";
    for (let attempt = 1; attempt <= tries; attempt++) {
      let res = null;
      try {
        res = await fetcher(`${base}/storage/v1/object/${bucket}/${path}`, {
          method: "POST", headers: { ...auth, "Content-Type": type, "Cache-Control": "no-cache", "x-upsert": "true" }, body,
        });
      } catch (e) { last = `${path}: ${e?.message || e}`; }
      if (res?.ok) return;
      if (res) {
        last = `${path}: ${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}`;
        if (!TRANSIENT(res.status)) throw new Error(last);
      }
      if (attempt < tries) { log(`  ${path}: try ${attempt} failed, trying again`); await sleep(1000 * 2 ** (attempt - 1)); }
    }
    throw new Error(`${last} (gave up after ${tries} tries)`);
  };
  for (const f of manifest.files) await put(`${prefix}/${f.path}`, readFileSync(join(dir, f.path)), contentType(f.path));
  await put("ota/latest.json", JSON.stringify(manifest), "application/json");

  // Tidy up: keep the newest few builds so a phone in the middle of downloading an older one isn't cut off.
  const pruned = [];
  const list = async (p) => {
    const res = await fetcher(`${base}/storage/v1/object/list/${bucket}`, {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ prefix: p, limit: 1000, offset: 0 }),
    });
    return res.ok ? res.json() : [];
  };
  const folders = (await list("ota")).filter((e) => e.id === null && e.name !== manifest.id).map((e) => e.name).sort();
  const old = folders.slice(0, Math.max(0, folders.length - (OTA_KEEP - 1)));
  for (const name of old) {
    const files = (await list(`ota/${name}`)).filter((e) => e.id !== null).map((e) => `ota/${name}/${e.name}`);
    if (!files.length) continue;
    const res = await fetcher(`${base}/storage/v1/object/${bucket}`, {
      method: "DELETE", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: files }),
    });
    if (res.ok) pruned.push(name);
  }
  return { manifest, uploaded: manifest.files.length + 1, pruned };
}

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

  if (process.argv.includes("--ota")) {
    const r = await publishOta({
      base, key, bucket: BUCKET, dir: DIR, notes: NOTES, dry: DRY,
      // From the environment, like the service key, and never written anywhere.
      privateKeyPem: (process.env.OTA_SIGNING_KEY || "").replace(/\\n/g, "\n"),
      log: (m) => console.log(m),
    });
    if (!DRY) console.log(`Published ${r.manifest.id}.${r.pruned.length ? ` Removed ${r.pruned.length} old build${r.pruned.length === 1 ? "" : "s"}.` : ""}`);
    return;
  }

  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const commit = (() => {
    try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return ""; }
  })();
  
  // The build stamp baked into the code, not the time of this deploy: an app comparing itself against this
  // manifest is comparing against the same clock it was stamped with.
  const stamped = (() => { try { return JSON.parse(readFileSync(join(DIR, "build.json"), "utf8")); } catch { return null; } })();
  const manifest = {
    app: "momentum",
    version: pkg.version,
    build: stamped?.build || new Date().toISOString(),
    commit: stamped?.commit ?? commit,
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
