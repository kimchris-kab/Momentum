import { BACKUP_APP, exportPayload, stateFromImport, summarise } from "./backup.js";
import { SCHEMA_VERSION } from "./migrate.js";

// The rules around the cloud copy, kept apart from the HTTP so they can be reasoned about
// and tested without a network.
//
// This is a backup, not sync. One row per account, replaced wholesale, newest write wins.
// That is a real limitation and the UI says so, because the failure it invites is specific:
// edit on the phone, edit on the laptop, and one of them quietly loses. What this does
// promise is that losing the device doesn't lose the data.
//
// The dangerous direction is the other one — an automatic push that overwrites months of
// history with an empty state, which is exactly what a fresh install signing in would do if
// nothing stopped it. Hence the guards below: a push that would shrink the cloud copy has to
// be asked for, never assumed.

export const PUSH_DEBOUNCE_MS = 45_000;
// Below this, a push that shrinks the backup is treated as suspicious rather than routine.
export const SHRINK_RATIO = 0.75;

/** Cheap, stable, and only ever compared against itself: has anything changed since last push? */
export function fingerprint(value) {
  const s = typeof value === "string" ? value : JSON.stringify(value ?? null);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${s.length.toString(36)}`;
}

/** How much is in a state, as one number, for comparing a local copy against a cloud one. */
export const weigh = (data) =>
  summarise(data || {}).reduce((total, [, n]) => total + n, 0);

/**
 * What the cloud copy holds, from the row's own metadata rather than by downloading it.
 *
 * The count is stored on the row for exactly this reason: on a device that has just signed
 * in — the case the guards exist for — nothing local knows how big the backup is, and a
 * guard that only works on the device that wrote the backup is no guard at all.
 */
export const remoteFacts = (meta) => ({
  exists: !!meta,
  weight: typeof meta?.item_count === "number" ? meta.item_count
    : typeof meta?.weight === "number" ? meta.weight
    : null,
});

export const describeContents = (data) => summarise(data || {});

// ---- Configuration ----
// The URL and anon key are public by design — row-level security is what protects the data,
// not secrecy of the key. They can come from the build, or be typed in on the device, which
// matters here because the published preview can't be rebuilt with someone's own project in
// it.
export const CONFIG_KEY = "momentum:supabase";

export const readConfig = (env = {}, stored = null) => {
  const fromStore = stored && typeof stored === "object" ? stored : {};
  const url = (fromStore.url || env.VITE_SUPABASE_URL || "").trim();
  const anonKey = (fromStore.anonKey || env.VITE_SUPABASE_ANON_KEY || "").trim();
  return { url, anonKey, source: fromStore.url ? "device" : (env.VITE_SUPABASE_URL ? "build" : "none") };
};

export function configProblem(cfg) {
  if (!cfg.url && !cfg.anonKey) return "Not set up yet.";
  if (!cfg.url) return "Missing the project URL.";
  if (!cfg.anonKey) return "Missing the anon key.";
  if (!/^https:\/\/[^\s/]+\.supabase\.(co|in|net)$/i.test(cfg.url.replace(/\/+$/, ""))
    && !/^https?:\/\/localhost(:\d+)?$/i.test(cfg.url.replace(/\/+$/, ""))) {
    return "That doesn't look like a project URL — it should end in .supabase.co.";
  }
  // Supabase keys are JWTs (three dot-separated parts) or the newer publishable format.
  if (!/^ey[\w-]+\.[\w-]+\.[\w-]+$/.test(cfg.anonKey) && !/^sb_publishable_/.test(cfg.anonKey)) {
    return "That doesn't look like an anon key.";
  }
  return null;
}

export const isConfigured = (cfg) => configProblem(cfg) === null;

// ---- What to send, and whether to send it ----

export const backupBody = (state, at = Date.now()) => exportPayload(state, at);

/**
 * Should this state be pushed?
 * @returns { push, reason, needsConfirmation }  — needsConfirmation means "ask, don't assume".
 */
export function pushDecision({
  state, lastPush = null, remote = null, now = Date.now(), force = false,
}) {
  const local = weigh(state);
  const print = fingerprint(state);

  const cloud = remote ? { exists: remote.exists ?? (remote.weight ?? 0) > 0, weight: remote.weight ?? null } : null;

  if (local === 0 && cloud?.exists) {
    // The fresh-install case: signing in on a new phone must not push its emptiness over
    // everything. Restoring is what's wanted here, and it's the opposite direction.
    return { push: false, reason: "empty-local", needsConfirmation: false, fingerprint: print };
  }
  if (force) return { push: true, reason: "asked", needsConfirmation: false, fingerprint: print };

  if (lastPush?.fingerprint === print) {
    return { push: false, reason: "unchanged", needsConfirmation: false, fingerprint: print };
  }
  if (lastPush?.at && now - lastPush.at < PUSH_DEBOUNCE_MS) {
    return { push: false, reason: "too-soon", needsConfirmation: false, fingerprint: print };
  }
  // Only when the size of the cloud copy is actually known: guessing in either direction
  // would either block ordinary pushes or wave through the one that destroys the backup.
  if (cloud && typeof cloud.weight === "number" && cloud.weight > 0 && local < cloud.weight * SHRINK_RATIO) {
    // Losing a quarter of everything between two pushes is either a deliberate clear-out or
    // a mistake, and the app can't tell which. Asking costs one tap; guessing costs the data.
    return { push: false, reason: "shrunk", needsConfirmation: true, fingerprint: print, local, remote: cloud.weight };
  }
  return { push: true, reason: "changed", needsConfirmation: false, fingerprint: print };
}

/**
 * What restoring the cloud copy would do to what's here, so the choice is made with the
 * numbers in view rather than after the fact.
 */
export function restorePreview(remoteRow, localState) {
  if (!remoteRow?.data) return { ok: false, error: "There's no backup in this account yet." };
  // What's stored is the same envelope the export file uses — app, format, then the state —
  // so unwrap it. A bare state is accepted too, for a row written by hand.
  const data = unwrap(remoteRow.data);
  if (typeof data !== "object" || (!Array.isArray(data.tasks) && !Array.isArray(data.transactions) && !data.checkins)) {
    return { ok: false, error: "The backup in this account isn't readable. Nothing has been changed." };
  }
  const schema = remoteRow.schema_version ?? data.version ?? null;
  if (schema && schema > SCHEMA_VERSION) {
    return {
      ok: false,
      error: `That backup came from a newer version of Momentum (schema ${schema}). Update the app before restoring it.`,
    };
  }
  return {
    ok: true,
    at: remoteRow.updated_at || null,
    device: remoteRow.device || null,
    schema,
    summary: describeContents(data),
    cloudWeight: weigh(data),
    localWeight: weigh(localState),
    // Restoring replaces, so the honest question is what it costs, not what it gains.
    losing: Math.max(0, weigh(localState) - weigh(data)),
    data,
  };
}

export const stateFromCloud = (data) => stateFromImport(unwrap(data));

/** The state inside an export envelope, or the thing itself if it's already one. */
export function unwrap(value) {
  if (value && typeof value === "object" && value.app === BACKUP_APP && value.data) return value.data;
  return value;
}

/** A row's own summary, for the status line, without pulling the whole state down. */
export function statusLine(meta, now = Date.now()) {
  if (!meta?.updated_at) return "No backup yet";
  const then = Date.parse(meta.updated_at);
  if (Number.isNaN(then)) return "Backed up";
  const mins = Math.round((now - then) / 60000);
  if (mins < 1) return "Backed up just now";
  if (mins < 60) return `Backed up ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Backed up ${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "Backed up yesterday" : `Backed up ${days} days ago`;
}

/** Something to tell one device from another in the status line. */
export function deviceName(ua = "") {
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iPhone or iPad";
  if (/macintosh/i.test(ua)) return "Mac";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  return "This device";
}
