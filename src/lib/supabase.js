// A small REST client for the two Supabase services this app uses: GoTrue for accounts and
// PostgREST for the one table it writes to.
//
// Hand-rolled rather than @supabase/supabase-js on purpose. The official client is ~100 kB
// on a bundle that was just halved to keep the first paint quick, and the surface used here
// is four endpoints. Everything below is plain fetch, so it also works in the service worker
// and under node in the tests.
//
// NOT VERIFIED AGAINST A LIVE PROJECT: there is no Supabase project or key in the
// environment this was written in, so every call below has been exercised against a stub of
// fetch rather than a real server. The shapes follow the published REST API, but expect to
// meet at least one surprise the first time it points at a real project.

export class SupabaseError extends Error {
  constructor(message, { status = 0, code = null, kind = "request" } = {}) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.code = code;
    this.kind = kind;
  }
}

const trimUrl = (url) => String(url || "").trim().replace(/\/+$/, "");

/** Turns whatever the service said into something worth showing a person. */
export async function readError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* html error page, or nothing */ }
  const raw = body?.error_description || body?.msg || body?.message || body?.error || "";
  const code = body?.code || body?.error || null;

  if (res.status === 401 || res.status === 403) {
    return new SupabaseError(
      /jwt|token/i.test(raw) ? "Your session expired — sign in again." : (raw || "Not allowed."),
      { status: res.status, code, kind: "auth" },
    );
  }
  if (res.status === 404) {
    return new SupabaseError(
      "That project doesn't have the table this needs — run the setup SQL first.",
      { status: 404, code, kind: "setup" },
    );
  }
  if (res.status === 429) {
    return new SupabaseError("Too many attempts. Wait a minute and try again.", { status: 429, code, kind: "rate" });
  }
  if (res.status >= 500) {
    return new SupabaseError("Supabase is having trouble. Nothing was lost — try again shortly.",
      { status: res.status, code, kind: "server" });
  }
  return new SupabaseError(raw || `Request failed (${res.status}).`, { status: res.status, code });
}

async function call(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    // Offline, DNS, a blocked request — none of which is the user's fault or their data's.
    throw new SupabaseError("Couldn't reach Supabase. Your data is safe on this device.",
      { kind: "offline" });
  }
  if (!res.ok) throw await readError(res);
  if (res.status === 204) return null;
  try { return await res.json(); } catch { return null; }
}

const sessionFrom = (body) => ({
  accessToken: body.access_token,
  refreshToken: body.refresh_token,
  // A minute of slack, so a request never goes out with a token that expires mid-flight.
  expiresAt: Date.now() + Math.max(0, (body.expires_in || 3600) - 60) * 1000,
  user: { id: body.user?.id || null, email: body.user?.email || null },
});

const authUrl = (cfg, path) => `${trimUrl(cfg.url)}/auth/v1${path}`;
const restUrl = (cfg, path) => `${trimUrl(cfg.url)}/rest/v1${path}`;

const baseHeaders = (cfg) => ({ apikey: cfg.anonKey, "Content-Type": "application/json" });

// ---- Accounts ----

/**
 * Creates an account. With email confirmation on (the Supabase default) this returns a user
 * but no session, and the caller has to say so rather than looking like it failed.
 */
export async function signUp(cfg, email, password) {
  const body = await call(authUrl(cfg, "/signup"), {
    method: "POST",
    headers: baseHeaders(cfg),
    body: JSON.stringify({ email, password }),
  });
  if (!body?.access_token) {
    return { session: null, needsConfirmation: true, user: body?.user || null };
  }
  return { session: sessionFrom(body), needsConfirmation: false, user: body.user };
}

export async function signIn(cfg, email, password) {
  const body = await call(`${authUrl(cfg, "/token")}?grant_type=password`, {
    method: "POST",
    headers: baseHeaders(cfg),
    body: JSON.stringify({ email, password }),
  });
  return sessionFrom(body);
}

export async function refreshSession(cfg, session) {
  const body = await call(`${authUrl(cfg, "/token")}?grant_type=refresh_token`, {
    method: "POST",
    headers: baseHeaders(cfg),
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  return sessionFrom(body);
}

/** Refreshes only when the token is about to expire, so ordinary use costs one request. */
export async function validSession(cfg, session, now = Date.now()) {
  if (!session?.accessToken) throw new SupabaseError("Sign in first.", { kind: "auth" });
  if (session.expiresAt && session.expiresAt > now) return session;
  return refreshSession(cfg, session);
}

export async function signOut(cfg, session) {
  // Best effort: a failed logout must never strand someone in a signed-in state locally.
  try {
    await call(authUrl(cfg, "/logout"), {
      method: "POST",
      headers: { ...baseHeaders(cfg), Authorization: `Bearer ${session.accessToken}` },
    });
  } catch { /* the local session is cleared by the caller either way */ }
}

// ---- The one table ----
export const TABLE = "backups";

const rowHeaders = (cfg, session, extra = {}) => ({
  ...baseHeaders(cfg),
  Authorization: `Bearer ${session.accessToken}`,
  ...extra,
});

/**
 * One row per user, replaced wholesale. The primary key is the user's own id, so the upsert
 * can never create a second row and row-level security can never expose someone else's.
 */
export async function pushBackup(cfg, session, { payload, device, schema, items = null }) {
  const json = JSON.stringify(payload);
  const row = {
    user_id: session.user.id,
    data: payload,
    schema_version: schema ?? null,
    device: device || null,
    size_bytes: json.length,
    // Stored so another device can judge the backup's size without downloading it.
    item_count: items,
    updated_at: new Date().toISOString(),
  };
  const out = await call(restUrl(cfg, `/${TABLE}`), {
    method: "POST",
    headers: rowHeaders(cfg, session, {
      Prefer: "resolution=merge-duplicates,return=representation",
    }),
    body: JSON.stringify(row),
  });
  return Array.isArray(out) ? out[0] : out;
}

/** The user's row, or null when they've never backed up. */
export async function pullBackup(cfg, session) {
  const query = `select=data,updated_at,schema_version,device,size_bytes&user_id=eq.${session.user.id}&limit=1`;
  const rows = await call(restUrl(cfg, `/${TABLE}?${query}`), {
    method: "GET",
    headers: rowHeaders(cfg, session),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** Just the metadata, for a status line that doesn't drag the whole state down the wire. */
export async function headBackup(cfg, session) {
  const query = `select=updated_at,schema_version,device,size_bytes,item_count&user_id=eq.${session.user.id}&limit=1`;
  const rows = await call(restUrl(cfg, `/${TABLE}?${query}`), {
    method: "GET",
    headers: rowHeaders(cfg, session),
  });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/** A cheap round trip to tell "wrong URL" apart from "wrong key" apart from "no table". */
export async function checkProject(cfg) {
  const res = await fetch(restUrl(cfg, `/${TABLE}?select=user_id&limit=1`), {
    method: "GET",
    headers: baseHeaders(cfg),
  }).catch(() => null);
  if (!res) return { ok: false, reason: "unreachable" };
  // 401 means the project and table are there and RLS is doing its job for an anonymous
  // caller, which is exactly what a correctly configured project looks like from here.
  if (res.status === 401 || res.status === 200) return { ok: true, reason: null };
  if (res.status === 404) return { ok: false, reason: "no-table" };
  return { ok: false, reason: `status-${res.status}` };
}
