// Over-the-air updates for the installed Android app: a new web build is fetched from Supabase Storage,
// checked, and swapped in without installing anything. The native half (MomentumOta.java) does the
// downloading and checking; this half decides when to ask, and what to tell the person.
//
// It only ever applies to the installed app. In a browser the service worker already does the job.

export const OTA_CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
export const OTA_STATE_KEY = "momentum:ota";
const BUCKET = "app";

const plugin = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.MomentumOta : null);

/** True only inside the installed app, where there is a native half to hand an update to. */
export const otaSupported = () => !!plugin()?.install;

const root = (cfg, bucket = BUCKET) => `${String(cfg?.url || "").replace(/\/+$/, "")}/storage/v1/object/public/${bucket}/ota`;
export const otaLatestUrl = (cfg, bucket = BUCKET) => `${root(cfg, bucket)}/latest.json`;
export const otaBaseUrl = (cfg, manifest, bucket = BUCKET) => `${root(cfg, bucket)}/${manifest.id}/`;

const isoValue = (s) => (typeof s === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/.test(s) ? Date.parse(s) : null);

/**
 * What to do about a manifest, given what the native side says it has. Deliberately slow to claim an update:
 * anything unreadable, for another app, already here, or needing a newer shell than this one is "nothing to do",
 * and which of those it was is kept so the person can be told.
 */
export function otaDecision(manifest, info) {
  if (!manifest || typeof manifest !== "object" || !manifest.id || !Array.isArray(manifest.files)) return { action: "none", reason: "unreadable" };
  if (manifest.app && manifest.app !== "momentum") return { action: "none", reason: "not-ours" };
  if (Number(manifest.requiresNativeApi || 0) > Number(info?.nativeApi || 0)) return { action: "none", reason: "needs-native" };
  if (manifest.id === info?.pending) return { action: "none", reason: "waiting" };
  const latest = isoValue(manifest.build);
  if (latest === null) return { action: "none", reason: "unreadable" };
  const have = Math.max(isoValue(info?.bundledBuild) ?? 0, isoValue(info?.currentBuild) ?? 0);
  if (latest <= have) return { action: "none", reason: "current" };
  return { action: "install", reason: "newer" };
}

const readState = () => { try { return JSON.parse(window.localStorage.getItem(OTA_STATE_KEY) || "null") || {}; } catch { return {}; } };
const writeState = (s) => { try { window.localStorage.setItem(OTA_STATE_KEY, JSON.stringify(s)); } catch { /* blocked storage */ } };

/** When it last looked, and what it found, so the app doesn't ask more than every six hours. */
export const lastOtaCheck = () => readState();
export const shouldCheckOta = (state = readState(), now = Date.now()) => !state.at || now - state.at >= OTA_CHECK_EVERY_MS;

/**
 * Looks for a newer build and, if there is one, downloads and stages it. Returns { state, ... } where state is one of:
 * unavailable, not-configured, current, waiting, installed, needs-native, failed. Never throws: an update check that
 * interrupts someone is worse than none.
 */
export async function checkAndInstallOta({ cfg, fetcher = fetch, now = Date.now() } = {}) {
  const save = (out) => { writeState({ at: now, state: out.state, id: out.id || null, reason: out.reason || null, notes: out.notes || null }); return out; };
  if (!otaSupported()) return { state: "unavailable" };
  if (!cfg?.url) return { state: "not-configured" };
  try {
    const info = await plugin().info();
    const res = await fetcher(otaLatestUrl(cfg), { cache: "no-store" });
    if (!res.ok) return save({ state: "failed", reason: `status-${res.status}` });
    const manifest = await res.json();
    const d = otaDecision(manifest, info);
    if (d.reason === "needs-native") return save({ state: "needs-native", id: manifest.id, notes: manifest.notes });
    if (d.reason === "waiting") return save({ state: "waiting", id: manifest.id, notes: manifest.notes });
    if (d.action === "none") return save({ state: d.reason === "current" ? "current" : "failed", reason: d.reason });
    await plugin().install({ manifest, baseUrl: otaBaseUrl(cfg, manifest) });
    return save({ state: "installed", id: manifest.id, notes: manifest.notes });
  } catch (e) {
    // The native side rejects with a code: needs-native, signature, bad-build, not-newer, download, invalid.
    const code = e?.code || "download";
    if (code === "needs-native") return save({ state: "needs-native", reason: code });
    if (code === "not-newer") return save({ state: "current", reason: code });
    return save({ state: "failed", reason: code, message: String(e?.message || e).slice(0, 160) });
  }
}

/** The web app is up: tells the native side the build that was just started is a good one. */
export async function confirmOtaBoot() {
  try { await plugin()?.confirm?.(); } catch { /* nothing to confirm */ }
}

/** Switches to a staged build now instead of at the next start. */
export async function applyOtaNow() {
  try { return !!(await plugin().apply())?.applied; } catch { return false; }
}

/** What to tell the person about a result, in plain words. Null when there's nothing worth saying. */
export function describeOta(result) {
  switch (result?.state) {
    case "installed": return "A new version is ready. It starts the next time you open the app.";
    case "waiting": return "A new version is ready. It starts the next time you open the app.";
    case "needs-native": return "There's a newer version, but it needs a new install of the app itself. Download the latest APK.";
    case "current": return "This is the newest version.";
    case "not-configured": return "No update channel is set up.";
    case "unavailable": return null;
    case "failed":
      return result.reason === "signature" ? "An update was found but it isn't signed by you, so it wasn't installed."
        : result.reason === "bad-build" ? "The newest version failed to start before, so it won't be tried again."
        : "Couldn't check just now. It will try again later.";
    default: return null;
  }
}
