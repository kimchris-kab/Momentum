// Over-the-air updates: the pieces that don't touch the network, so they can be tested.
//
// A new web build is described by a manifest: every file in the build with its SHA-256 and size,
// which native API it needs, and optionally a signature. The Android app downloads exactly the
// files listed, checks every hash, and only then swaps the build in. Nothing here decides *when*;
// the app does that.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export const MAX_FILES = 400;
export const MAX_TOTAL_BYTES = 30 * 1024 * 1024;
export const SAFE_PATH = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const SAFE_ID = /^[A-Za-z0-9._-]{4,80}$/;

export const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/** A path is allowed if it can't climb out of the build's folder: no dots-only segments, no leading slash. */
export const isSafePath = (p) => typeof p === "string" && p.length <= 200 && SAFE_PATH.test(p)
  && !p.split("/").some((seg) => seg === "." || seg === "..");

export function filesIn(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return filesIn(full, base);
    return [{ path: relative(base, full).split("\\").join("/"), full }];
  });
}

/** Folder name for a build: its timestamp and commit, so builds sort by when they were made. */
export const buildId = (info) =>
  `${String(info.build).replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z").replace("T", "-")}-${info.commit || "dev"}`;

/**
 * The exact text that is signed. Fixed and spelled out rather than "the JSON", because the Android side has to
 * rebuild it byte for byte and JSON has too many ways to be written the same thing differently.
 */
export function signingPayload(m) {
  return `momentum-ota-v1\n${m.id}\n${m.build}\n${m.requiresNativeApi}\n${m.files.map((f) => `${f.sha256} ${f.size} ${f.path}`).join("\n")}\n`;
}

export function signManifest(manifest, privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  return sign("sha256", Buffer.from(signingPayload(manifest)), key).toString("base64");
}

export function verifyManifest(manifest, publicKeyDerBase64) {
  try {
    const key = createPublicKey({ key: Buffer.from(publicKeyDerBase64, "base64"), format: "der", type: "spki" });
    return verify("sha256", Buffer.from(signingPayload(manifest)), key, Buffer.from(manifest.signature || "", "base64"));
  } catch {
    return false;
  }
}

/**
 * The manifest for a built folder. `info` is what build.json says about the build (version, build time, commit,
 * the native API it needs). Source maps are left out: nothing needs them on a phone.
 */
export function buildManifest({ dir, info, notes = "", privateKeyPem = "" }) {
  const files = filesIn(dir)
    .filter((f) => !f.path.endsWith(".map"))
    .map((f) => {
      const buf = readFileSync(f.full);
      return { path: f.path, sha256: sha256(buf), size: statSync(f.full).size };
    })
    .sort((a, b) => (a.path < b.path ? -1 : 1));
  const bad = files.find((f) => !isSafePath(f.path));
  if (bad) throw new Error(`A file name that can't be shipped safely: ${bad.path}`);
  if (files.length > MAX_FILES) throw new Error(`${files.length} files is more than the ${MAX_FILES} an update may carry.`);
  const total = files.reduce((a, f) => a + f.size, 0);
  if (total > MAX_TOTAL_BYTES) throw new Error(`The build is ${(total / 1048576).toFixed(1)} MB; an update may carry ${MAX_TOTAL_BYTES / 1048576}.`);
  if (!files.some((f) => f.path === "index.html")) throw new Error("There is no index.html in the build.");
  const manifest = {
    app: "momentum",
    id: buildId(info),
    version: info.version,
    build: info.build,
    commit: info.commit || "",
    notes: String(notes || "").slice(0, 400),
    requiresNativeApi: Number(info.requiresNativeApi) || 1,
    files,
  };
  if (!SAFE_ID.test(manifest.id)) throw new Error(`The build id ${manifest.id} isn't usable as a folder name.`);
  if (privateKeyPem) manifest.signature = signManifest(manifest, privateKeyPem);
  return manifest;
}
