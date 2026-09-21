import { suite } from "./harness.mjs";
import {
  CONFIG_KEY, PUSH_DEBOUNCE_MS, SHRINK_RATIO, backupBody, configProblem, describeContents,
  deviceName, fingerprint, isConfigured, pushDecision, readConfig, remoteFacts, restorePreview, unwrap,
  stateFromCloud, statusLine, weigh,
} from "../src/lib/cloud.js";
import {
  SupabaseError, checkProject, headBackup, pullBackup, pushBackup, refreshSession, signIn,
  signOut, signUp, validSession,
} from "../src/lib/supabase.js";
import { emptyState } from "../src/lib/migrate.js";

const t = suite("cloud");

const CFG = { url: "https://abcdefgh.supabase.co", anonKey: "eyJhbGciOi.JIUzI1NiIs.InR5cCI6IkpXVCJ9" };
const SESSION = {
  accessToken: "tok", refreshToken: "ref", expiresAt: Date.now() + 600000,
  user: { id: "11111111-2222-3333-4444-555555555555", email: "a@b.c" },
};
const stateWith = (patch) => ({ ...emptyState(), ...patch });
const busy = stateWith({
  tasks: [{ id: "a" }, { id: "b" }, { id: "c" }],
  dayLog: { "2026-09-18": {}, "2026-09-19": {} },
  transactions: [{ id: 1 }, { id: 2 }],
});

// A stub of fetch that records what was asked for and replies with whatever the test wants.
function stubFetch(responses) {
  const calls = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, ...options, body: options.body ? JSON.parse(options.body) : null });
    const next = queue.length > 1 ? queue.shift() : queue[0];
    if (next instanceof Error) throw next;
    return {
      ok: next.status < 400,
      status: next.status,
      json: async () => {
        if (next.body === undefined) throw new Error("no body");
        return next.body;
      },
    };
  };
  return calls;
}
const realFetch = globalThis.fetch;
const restoreFetch = () => { globalThis.fetch = realFetch; };

t.group("configuration");
{
  // The URL and anon key are public by design — row-level security is what protects the
  // data — so they can come from the build or be typed in on the device.
  t.eq("from the build", readConfig({ VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "k" }).source, "build");
  t.eq("typed in on the device wins", readConfig(
    { VITE_SUPABASE_URL: "https://build.supabase.co" },
    { url: "https://device.supabase.co", anonKey: "k" },
  ).url, "https://device.supabase.co");
  t.eq("neither", readConfig({}).source, "none");
  t.eq("the key it's stored under", CONFIG_KEY, "momentum:supabase");

  t.eq("nothing set up", configProblem({ url: "", anonKey: "" }), "Not set up yet.");
  t.ok("a missing half is named", /project URL/.test(configProblem({ url: "", anonKey: "ey1.2.3" })));
  t.ok("...either half", /anon key/.test(configProblem({ url: "https://x.supabase.co", anonKey: "" })));
  t.ok("a URL that isn't a project", /project URL/.test(configProblem({ url: "https://example.com", anonKey: "ey1.2.3" })));
  t.ok("a key that isn't a key",
    /anon key/.test(configProblem({ url: "https://x.supabase.co", anonKey: "hunter2" })));
  t.eq("a good pair", configProblem(CFG), null);
  t.ok("...and that's what configured means", isConfigured(CFG) && !isConfigured({ url: "", anonKey: "" }));
  t.eq("a local project is allowed for development",
    configProblem({ url: "http://localhost:54321", anonKey: "eyJh.abc.def" }), null);
  t.ok("the newer publishable key format is accepted",
    configProblem({ url: "https://x.supabase.co", anonKey: "sb_publishable_abc123" }) === null);
}

t.group("has anything changed");
{
  t.eq("the same state prints the same", fingerprint(busy), fingerprint(busy));
  t.ok("a different one doesn't", fingerprint(busy) !== fingerprint(stateWith({ tasks: [{ id: "a" }] })));
  t.ok("even a small edit shows", fingerprint({ a: 1 }) !== fingerprint({ a: 2 }));
  t.ok("it's short enough to store", fingerprint(busy).length < 24);

  t.eq("weight counts everything in the state", weigh(busy), 7);
  t.eq("an empty state weighs nothing", weigh(emptyState()), 0);
  t.eq("junk weighs nothing rather than throwing", weigh(null), 0);
  t.ok("contents are described in plain words",
    describeContents(busy).some(([label]) => /tasks/i.test(label)), describeContents(busy));
}

t.group("when to push");
{
  const now = 1_800_000_000_000;
  const remote = { exists: true, weight: 7 };

  t.ok("a changed state goes up", pushDecision({ state: busy, now }).push);
  t.eq("...and says why", pushDecision({ state: busy, now }).reason, "changed");

  const last = { fingerprint: fingerprint(busy), at: now - 10 * 60_000 };
  t.ok("an unchanged state doesn't", !pushDecision({ state: busy, lastPush: last, now }).push);
  t.eq("...for the obvious reason", pushDecision({ state: busy, lastPush: last, now }).reason, "unchanged");

  // Every keystroke writes state; pushing on each one would be rude to both battery and quota.
  const justPushed = { fingerprint: "other", at: now - 1000 };
  t.eq("a push moments ago holds the next one",
    pushDecision({ state: busy, lastPush: justPushed, now }).reason, "too-soon");
  t.eq("the gap", PUSH_DEBOUNCE_MS, 45_000);
  t.ok("...but asking explicitly overrides all of it",
    pushDecision({ state: busy, lastPush: justPushed, now, force: true }).push);

  // The failure this exists to prevent: a fresh install signs in, local is empty, and an
  // automatic push wipes months of history.
  const fresh = pushDecision({ state: emptyState(), remote, now });
  t.ok("an empty device never overwrites a full backup", !fresh.push);
  t.eq("...and it isn't even a question to ask", [fresh.reason, fresh.needsConfirmation], ["empty-local", false]);

  // A big shrink might be a deliberate clear-out or a mistake; the app can't tell.
  const shrunk = pushDecision({ state: stateWith({ tasks: [{ id: "a" }] }), remote, now });
  t.ok("a big drop isn't pushed on its own", !shrunk.push);
  t.ok("...it's asked about", shrunk.needsConfirmation);
  t.eq("...with both numbers to hand", [shrunk.local, shrunk.remote], [1, 7]);
  t.eq("the threshold", SHRINK_RATIO, 0.75);
  t.ok("a small drop is just an edit", pushDecision({
    state: stateWith({ tasks: [{ id: "a" }, { id: "b" }], dayLog: { x: {}, y: {} }, transactions: [{ id: 1 }, { id: 2 }] }),
    remote, now,
  }).push);
  t.ok("...and a confirmed shrink goes up",
    pushDecision({ state: stateWith({ tasks: [{ id: "a" }] }), remote, now, force: true }).push);

  t.eq("the body is the same shape as the export file", backupBody(busy, 0).app, "momentum");

  // The guards have to work on a device that has just signed in and knows nothing but the
  // row's metadata — that is the case they exist for.
  t.eq("a row's own count is what's compared against",
    remoteFacts({ item_count: 12, updated_at: "x" }), { exists: true, weight: 12 });
  t.eq("no row at all", remoteFacts(null), { exists: false, weight: null });
  t.eq("a row of unknown size is known to exist, at least",
    remoteFacts({ updated_at: "x" }), { exists: true, weight: null });
  const unknownSize = pushDecision({ state: emptyState(), remote: remoteFacts({ updated_at: "x" }), now });
  t.eq("an empty device still refuses to overwrite a backup of unknown size",
    unknownSize.reason, "empty-local");
  t.ok("...but an ordinary edit isn't blocked just because the size is unknown",
    pushDecision({ state: busy, remote: remoteFacts({ updated_at: "x" }), now }).push);
}

t.group("restoring, with the cost in view");
{
  // What the app actually stores is the export envelope, not a bare state — this fixture
  // used to be the bare one, which is how a real mismatch slipped past it.
  const row = {
    data: backupBody(busy, 0), updated_at: "2026-09-20T08:00:00.000Z", schema_version: 2, device: "Android",
  };
  t.eq("the envelope is unwrapped to the state inside", unwrap(backupBody(busy, 0)).tasks.length, 3);
  t.eq("...and a bare state is left as it is", unwrap(busy).tasks.length, 3);
  t.ok("a bare state still previews", restorePreview({ data: busy }, busy).ok);
  const preview = restorePreview(row, stateWith({ tasks: [{ id: "z" }] }));
  t.ok("a readable backup previews", preview.ok);
  t.eq("...saying when and from where", [preview.at, preview.device], [row.updated_at, "Android"]);
  t.ok("...with an inventory", preview.summary.length > 0);
  // Restoring replaces, so the honest question is what it costs.
  t.eq("...and what restoring would cost", preview.losing, 0);
  t.eq("...counted against what's here", [preview.cloudWeight, preview.localWeight], [7, 1]);
  t.eq("a local copy that's bigger is a real loss, stated",
    restorePreview({ data: stateWith({ tasks: [{ id: "a" }] }) }, busy).losing, 6);

  t.ok("an empty account says so", /no backup/i.test(restorePreview(null, busy).error));
  t.ok("an unreadable row doesn't get applied", /isn't readable/i.test(restorePreview({ data: { nope: 1 } }, busy).error));
  t.ok("...including an envelope with nothing in it",
    /isn't readable/i.test(restorePreview({ data: { app: "momentum", format: 1, data: { nope: 1 } } }, busy).error));
  t.ok("a newer schema is refused, not guessed at",
    /newer version/i.test(restorePreview({ data: backupBody(busy, 0), schema_version: 99 }, busy).error));

  const restored = stateFromCloud(backupBody(busy, 0));
  t.eq("restoring fills in anything the backup predates", Array.isArray(restored.savedViews), true);
}

t.group("saying where things stand");
{
  const now = Date.parse("2026-09-20T12:00:00.000Z");
  t.eq("never", statusLine(null, now), "No backup yet");
  t.eq("moments ago", statusLine({ updated_at: "2026-09-20T11:59:40.000Z" }, now), "Backed up just now");
  t.eq("minutes", statusLine({ updated_at: "2026-09-20T11:30:00.000Z" }, now), "Backed up 30 min ago");
  t.eq("hours", statusLine({ updated_at: "2026-09-20T06:00:00.000Z" }, now), "Backed up 6h ago");
  t.eq("yesterday", statusLine({ updated_at: "2026-09-19T10:00:00.000Z" }, now), "Backed up yesterday");
  t.eq("days", statusLine({ updated_at: "2026-09-15T10:00:00.000Z" }, now), "Backed up 5 days ago");
  t.eq("a broken timestamp doesn't break the line", statusLine({ updated_at: "nonsense" }, now), "Backed up");
  t.eq("devices are named plainly", deviceName("Mozilla/5.0 (Linux; Android 14)"), "Android");
  t.eq("...whatever they are", deviceName(""), "This device");
}

// ───────────────────── the HTTP layer, against a stub ─────────────────────
t.group("signing up");
{
  const calls = stubFetch({ status: 200, body: { access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: "u1", email: "a@b.c" } } });
  const out = await signUp(CFG, "a@b.c", "pw");
  t.ok("it posts to the right place", calls[0].url === "https://abcdefgh.supabase.co/auth/v1/signup", calls[0].url);
  t.eq("...with the key", calls[0].headers.apikey, CFG.anonKey);
  t.eq("...and the credentials", calls[0].body, { email: "a@b.c", password: "pw" });
  t.eq("a session comes back", out.session.accessToken, "a");
  t.ok("...expiring a little before it really does", out.session.expiresAt <= Date.now() + 3600_000);

  // With email confirmation on — the Supabase default — there's a user but no session, and
  // that has to read as "check your email", not as a failure.
  stubFetch({ status: 200, body: { user: { id: "u1" } } });
  const pending = await signUp(CFG, "a@b.c", "pw");
  t.ok("an unconfirmed signup is reported as such", pending.needsConfirmation && pending.session === null);
  restoreFetch();
}

t.group("signing in and staying in");
{
  const calls = stubFetch({ status: 200, body: { access_token: "a", refresh_token: "r", expires_in: 3600, user: { id: "u1" } } });
  await signIn(CFG, "a@b.c", "pw");
  t.ok("the password grant is used", /grant_type=password/.test(calls[0].url), calls[0].url);

  const refreshCalls = stubFetch({ status: 200, body: { access_token: "a2", refresh_token: "r2", expires_in: 3600, user: { id: "u1" } } });
  const fresh = await refreshSession(CFG, { refreshToken: "r" });
  t.ok("refreshing uses the refresh grant", /grant_type=refresh_token/.test(refreshCalls[0].url));
  t.eq("...and returns the new token", fresh.accessToken, "a2");

  // A valid token shouldn't cost a round trip.
  const idle = stubFetch({ status: 500, body: {} });
  const kept = await validSession(CFG, SESSION);
  t.eq("a live session is used as it is", kept.accessToken, "tok");
  t.eq("...with no request at all", idle.length, 0);

  const expiring = stubFetch({ status: 200, body: { access_token: "a3", refresh_token: "r3", expires_in: 3600, user: { id: "u1" } } });
  const renewed = await validSession(CFG, { ...SESSION, expiresAt: Date.now() - 1 });
  t.eq("an expired one is refreshed first", renewed.accessToken, "a3");
  t.ok("...which is one request", expiring.length === 1);
  restoreFetch();
}

t.group("the row");
{
  const calls = stubFetch({ status: 201, body: [{ user_id: "u1", updated_at: "2026-09-20T08:00:00.000Z" }] });
  await pushBackup(CFG, SESSION, { payload: backupBody(busy, 0), device: "Android", schema: 2, items: 7 });
  t.ok("it posts to the table", /\/rest\/v1\/backups$/.test(calls[0].url), calls[0].url);
  // One row per user, keyed by their own id: the upsert can't create a second, and RLS
  // can't be talked into returning someone else's.
  t.eq("...keyed by the signed-in user", calls[0].body.user_id, SESSION.user.id);
  t.ok("...as an upsert", /merge-duplicates/.test(calls[0].headers.Prefer), calls[0].headers.Prefer);
  t.eq("...bearing the session token", calls[0].headers.Authorization, "Bearer tok");
  t.ok("...with the size recorded", calls[0].body.size_bytes > 0);
  t.eq("...and the device", calls[0].body.device, "Android");
  t.eq("...and how much is in it", calls[0].body.item_count, 7);

  const getCalls = stubFetch({ status: 200, body: [{ data: busy, updated_at: "x" }] });
  const row = await pullBackup(CFG, SESSION);
  t.ok("pulling filters to the user's own row", getCalls[0].url.includes(`user_id=eq.${SESSION.user.id}`), getCalls[0].url);
  t.eq("...and returns it", row.updated_at, "x");

  stubFetch({ status: 200, body: [] });
  t.eq("no row yet is null, not an error", await pullBackup(CFG, SESSION), null);

  const headCalls = stubFetch({ status: 200, body: [{ updated_at: "x", size_bytes: 10 }] });
  await headBackup(CFG, SESSION);
  t.ok("the status check doesn't drag the whole state down the wire",
    !headCalls[0].url.includes("data"), headCalls[0].url);
  t.ok("...but does bring back the count the guards need",
    headCalls[0].url.includes("item_count"), headCalls[0].url);
  restoreFetch();
}

t.group("when it goes wrong");
{
  stubFetch({ status: 401, body: { msg: "invalid JWT" } });
  const expired = await pullBackup(CFG, SESSION).catch((e) => e);
  t.ok("an expired token says to sign in again", /sign in again/i.test(expired.message), expired.message);
  t.eq("...and is marked as an auth problem", expired.kind, "auth");

  stubFetch({ status: 404, body: {} });
  const missing = await pullBackup(CFG, SESSION).catch((e) => e);
  t.ok("a missing table points at the setup step", /setup SQL/i.test(missing.message), missing.message);

  stubFetch({ status: 400, body: { msg: "Invalid login credentials" } });
  const wrong = await signIn(CFG, "a@b.c", "nope").catch((e) => e);
  t.eq("a wrong password is passed through as-is", wrong.message, "Invalid login credentials");

  stubFetch({ status: 429, body: {} });
  const limited = await signIn(CFG, "a@b.c", "pw").catch((e) => e);
  t.ok("rate limiting is explained", /wait a minute/i.test(limited.message));

  stubFetch({ status: 503, body: {} });
  const down = await pullBackup(CFG, SESSION).catch((e) => e);
  t.ok("a service outage reassures rather than alarms", /nothing was lost/i.test(down.message), down.message);

  stubFetch(new TypeError("Failed to fetch"));
  const offline = await pullBackup(CFG, SESSION).catch((e) => e);
  t.ok("being offline is not an error about your data", /safe on this device/i.test(offline.message), offline.message);
  t.eq("...and is marked as such", offline.kind, "offline");
  t.ok("every failure is one of ours", offline instanceof SupabaseError);

  // Signing out must always succeed locally, whatever the server says.
  stubFetch({ status: 500, body: {} });
  let threw = false;
  await signOut(CFG, SESSION).catch(() => { threw = true; });
  t.ok("a failed sign-out doesn't strand you signed in", !threw);
  restoreFetch();
}

t.group("checking a project before trusting it");
{
  // An anonymous read returning 401 is what a correctly configured project looks like from
  // outside: the table is there and row-level security is doing its job.
  stubFetch({ status: 401, body: {} });
  t.eq("locked down is healthy", (await checkProject(CFG)).ok, true);
  stubFetch({ status: 200, body: [] });
  t.eq("readable is healthy too", (await checkProject(CFG)).ok, true);
  stubFetch({ status: 404, body: {} });
  t.eq("a missing table is named", (await checkProject(CFG)).reason, "no-table");
  stubFetch(new TypeError("nope"));
  t.eq("an unreachable project is named", (await checkProject(CFG)).reason, "unreachable");
  restoreFetch();
}
