// Telling a running copy of the app that a newer one exists.
//
// A manifest sits next to the built files in Supabase Storage; the app fetches it now and
// then and compares it against the build stamped into itself. What "apply it" means depends
// on where it's running, and the honest answer differs per platform — see applyPlan below.

export const MANIFEST_NAME = "version.json";
export const DEFAULT_BUCKET = "app";
// Often enough to matter, rare enough to be invisible on a metered connection.
export const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/* global __APP_VERSION__, __APP_BUILD__, __APP_COMMIT__ */
export const currentBuild = () => ({
  version: typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0",
  build: typeof __APP_BUILD__ === "string" ? __APP_BUILD__ : null,
  commit: typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "",
});

export const manifestUrl = (cfg, bucket = DEFAULT_BUCKET) =>
  `${String(cfg?.url || "").replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/${MANIFEST_NAME}`;

/**
 * -1, 0 or 1.
 * A part that simply isn't there counts as zero, so "1.2" and "1.2.0" are the same version.
 * A part that is there but isn't a number sorts below everything, so a mangled manifest can
 * never talk the app into thinking it's out of date.
 */
export function compareVersions(a, b) {
  const parts = (v) => String(v ?? "").split(".");
  const at = (list, i) => {
    if (i >= list.length) return 0;
    const n = parseInt(list[i], 10);
    return Number.isFinite(n) && /^\d/.test(list[i].trim()) ? n : -1;
  };
  const x = parts(a);
  const y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    const l = at(x, i);
    const r = at(y, i);
    if (l !== r) return l > r ? 1 : -1;
  }
  return 0;
}

const time = (iso) => {
  const t = Date.parse(iso || "");
  return Number.isNaN(t) ? null : t;
};

/**
 * Is `latest` actually newer than `current`?
 * Version first; when two builds share a version — which is normal, since not every deploy
 * bumps a number — the build timestamp decides.
 */
export function isNewer(latest, current) {
  const byVersion = compareVersions(latest?.version, current?.version);
  if (byVersion !== 0) return byVersion > 0;
  const a = time(latest?.build);
  const b = time(current?.build);
  if (a === null || b === null) return false;
  return a > b;
}

/**
 * Reads a fetched manifest. Deliberately unwilling to claim an update: a manifest that is
 * missing, malformed, for another app, or not actually newer all mean "nothing to do".
 */
export function readManifest(manifest, current = currentBuild()) {
  if (!manifest || typeof manifest !== "object") {
    return { available: false, reason: "unreadable" };
  }
  if (manifest.app && manifest.app !== "momentum") {
    return { available: false, reason: "not-ours" };
  }
  if (!manifest.version && !manifest.build) {
    return { available: false, reason: "unreadable" };
  }
  const latest = {
    version: manifest.version || null,
    build: manifest.build || null,
    commit: manifest.commit || "",
    notes: typeof manifest.notes === "string" ? manifest.notes.slice(0, 400) : "",
  };
  if (!isNewer(latest, current)) return { available: false, reason: "current", latest };
  return { available: true, latest, reason: "newer" };
}

/** Rate limiting, so an app left open for a week doesn't poll a bucket all day. */
export const shouldCheck = (lastCheckedAt, now = Date.now(), every = CHECK_EVERY_MS) =>
  !lastCheckedAt || now - lastCheckedAt >= every;

/**
 * Fetches and reads the manifest. Any failure is "nothing to do" rather than an error worth
 * showing: an update check that interrupts someone is worse than no update check.
 */
export async function checkForUpdate(url, { current = currentBuild(), fetcher = fetch } = {}) {
  if (!url) return { available: false, reason: "not-configured" };
  try {
    // cache: no-store, or the browser will happily hand back the manifest it cached last
    // week and the check becomes theatre.
    const res = await fetcher(url, { cache: "no-store" });
    if (!res.ok) return { available: false, reason: `status-${res.status}` };
    return readManifest(await res.json(), current);
  } catch {
    return { available: false, reason: "unreachable" };
  }
}

/**
 * How an update actually gets applied here, which is not the same everywhere — and saying
 * "update available" on a platform that can't take it would be a lie with a button on it.
 */
export function applyPlan({ hasServiceWorker = false, isNative = false } = {}) {
  if (isNative) {
    return {
      can: false,
      label: "Update in the store",
      text: "This is the installed Android app, and its code ships inside the APK. A new"
        + " version has to be installed the way this one was — the app can't replace itself.",
    };
  }
  if (hasServiceWorker) {
    return {
      can: true,
      label: "Reload to update",
      text: "The new version is already downloaded. Reloading swaps it in; nothing on this"
        + " device is touched.",
    };
  }
  return {
    can: true,
    label: "Reload to update",
    text: "Reloading fetches the new version. Nothing on this device is touched.",
  };
}

/**
 * Asks the service worker to take the new build, then reloads. Falls back to a plain reload
 * wherever there isn't one.
 */
export async function applyUpdate({ reload = () => window.location.reload() } = {}) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg) {
      await reg.update().catch(() => {});
      reg.waiting?.postMessage?.({ type: "SKIP_WAITING" });
    }
  } catch { /* no worker, or it refused — a reload still gets the new files */ }
  reload();
}

export const describeBuild = (b) =>
  [b?.version ? `v${b.version}` : null, b?.commit || null].filter(Boolean).join(" · ") || "Unknown build";
