import { suite } from "./harness.mjs";
import {
  OTA_CHECK_EVERY_MS, applyOtaNow, checkAndInstallOta, confirmOtaBoot, describeOta, otaBaseUrl, otaDecision, otaLatestUrl,
  otaSupported, shouldCheckOta,
} from "../src/lib/ota.js";

const t = suite("ota");

// The app's half of over-the-air updates: when to look, what counts as an update, and what is said. The
// native half does the downloading and checking; here it's a stand-in that records what it's asked.
const store = {};
globalThis.window = {
  localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } },
};
const CFG = { url: "https://abc.supabase.co/", anonKey: "k" };
const manifest = (over = {}) => ({ app: "momentum", id: "20261009-000000Z-abc1234", build: "2026-10-09T00:00:00.000Z", requiresNativeApi: 1, notes: "Faster", files: [{ path: "index.html" }], ...over });
const info = (over = {}) => ({ nativeApi: 1, bundledBuild: "2026-10-08T05:31:46.351Z", currentBuild: null, pending: null, ...over });
const fakePlugin = (over = {}) => {
  const calls = [];
  const p = {
    calls,
    info: async () => { calls.push(["info"]); return info(over.info); },
    install: async (a) => { calls.push(["install", a]); if (over.installError) throw Object.assign(new Error("nope"), { code: over.installError }); return { installed: true }; },
    confirm: async () => { calls.push(["confirm"]); },
    apply: async () => { calls.push(["apply"]); return { applied: over.applied !== false }; },
  };
  return p;
};
const useNative = (p) => { globalThis.window.Capacitor = p ? { Plugins: { MomentumOta: p } } : undefined; };
const net = (m, ok = true, status = 200) => async (url, init) => { net.last = url; net.init = init; return { ok, status, json: async () => m }; };

t.group("where it applies");
{
  useNative(null);
  t.ok("not in a browser", !otaSupported());
  t.eq("so a check there says nothing and does nothing", await checkAndInstallOta({ cfg: CFG, fetcher: net(manifest()) }), { state: "unavailable" });
  useNative(fakePlugin());
  t.ok("in the installed app", otaSupported());
  t.eq("with no Supabase set up, there is nowhere to look", await checkAndInstallOta({ cfg: {}, fetcher: net(manifest()) }), { state: "not-configured" });
}

t.group("where it looks");
{
  t.eq("the manifest sits in the public bucket", otaLatestUrl(CFG), "https://abc.supabase.co/storage/v1/object/public/app/ota/latest.json");
  t.eq("a trailing slash on the project address makes no difference", otaLatestUrl({ url: "https://abc.supabase.co///" }), otaLatestUrl(CFG));
  t.eq("the files sit in a folder named for the build", otaBaseUrl(CFG, { id: "20261009-000000Z-abc1234" }), "https://abc.supabase.co/storage/v1/object/public/app/ota/20261009-000000Z-abc1234/");
  t.eq("another bucket, if that's what was set up", otaLatestUrl(CFG, "web"), "https://abc.supabase.co/storage/v1/object/public/web/ota/latest.json");
}

t.group("what counts as an update");
{
  t.eq("a newer build", otaDecision(manifest(), info()), { action: "install", reason: "newer" });
  t.eq("the same build as the app has", otaDecision(manifest({ build: "2026-10-08T05:31:46.351Z" }), info()).reason, "current");
  t.eq("an older one", otaDecision(manifest({ build: "2026-10-01T00:00:00.000Z" }), info()).reason, "current");
  t.eq("newer than the app but not than what's already downloaded and running", otaDecision(manifest({ build: "2026-10-09T00:00:00.000Z" }), info({ currentBuild: "2026-10-10T00:00:00.000Z" })).reason, "current");
  t.eq("newer than both", otaDecision(manifest({ build: "2026-10-11T00:00:00.000Z" }), info({ currentBuild: "2026-10-10T00:00:00.000Z" })).action, "install");
  t.eq("the one already waiting isn't fetched again", otaDecision(manifest(), info({ pending: "20261009-000000Z-abc1234" })), { action: "none", reason: "waiting" });
  t.eq("a build that needs a newer app than this", otaDecision(manifest({ requiresNativeApi: 2 }), info()).reason, "needs-native");
  t.eq("...even if it would otherwise be current", otaDecision(manifest({ requiresNativeApi: 2, build: "2020-01-01T00:00:00.000Z" }), info()).reason, "needs-native");
  t.eq("another app's manifest", otaDecision(manifest({ app: "other" }), info()).reason, "not-ours");
  t.eq("nothing at all", otaDecision(null, info()).reason, "unreadable");
  t.eq("no id", otaDecision(manifest({ id: "" }), info()).reason, "unreadable");
  t.eq("no files", otaDecision(manifest({ files: undefined }), info()).reason, "unreadable");
  t.eq("a build time that isn't one", otaDecision(manifest({ build: "yesterday" }), info()).reason, "unreadable");
  t.eq("an app that doesn't know when it was built is offered anything real", otaDecision(manifest(), info({ bundledBuild: null })).action, "install");
  t.eq("a missing native level counts as none, so nothing newer than 0 is needed from it", otaDecision(manifest({ requiresNativeApi: undefined }), info()).action, "install");
}

t.group("checking and installing");
{
  const p = fakePlugin(); useNative(p);
  const r = await checkAndInstallOta({ cfg: CFG, fetcher: net(manifest()), now: 1000 });
  t.eq("a newer build is installed", r, { state: "installed", id: "20261009-000000Z-abc1234", notes: "Faster" });
  t.eq("it asked the app what it has, then installed", p.calls.map((c) => c[0]), ["info", "install"]);
  t.eq("it handed over the manifest and where to fetch from", [p.calls[1][1].manifest.id, p.calls[1][1].baseUrl], ["20261009-000000Z-abc1234", "https://abc.supabase.co/storage/v1/object/public/app/ota/20261009-000000Z-abc1234/"]);
  t.eq("the manifest was fetched fresh, from the right place", net.last, "https://abc.supabase.co/storage/v1/object/public/app/ota/latest.json");
  t.eq("and never from a cache, or the check becomes theatre", net.init?.cache, "no-store");
  t.eq("what it found is remembered, with the time", JSON.parse(store["momentum:ota"]), { at: 1000, state: "installed", id: "20261009-000000Z-abc1234", reason: null, notes: "Faster" });

  const q = fakePlugin(); useNative(q);
  t.eq("nothing newer: nothing is installed", (await checkAndInstallOta({ cfg: CFG, fetcher: net(manifest({ build: "2026-10-01T00:00:00.000Z" })) })).state, "current");
  t.ok("not even asked to", !q.calls.some((c) => c[0] === "install"));

  const w = fakePlugin({ info: { pending: "20261009-000000Z-abc1234" } }); useNative(w);
  t.eq("already staged: said so, not fetched again", (await checkAndInstallOta({ cfg: CFG, fetcher: net(manifest()) })).state, "waiting");
  t.ok("and nothing downloaded", !w.calls.some((c) => c[0] === "install"));

  useNative(fakePlugin());
  t.eq("needing a newer shell is its own answer", (await checkAndInstallOta({ cfg: CFG, fetcher: net(manifest({ requiresNativeApi: 3 })) })).state, "needs-native");

  t.eq("a missing manifest is a quiet failure, not a crash", (await checkAndInstallOta({ cfg: CFG, fetcher: net(null, false, 404) })).reason, "status-404");
  t.eq("a network that throws", (await checkAndInstallOta({ cfg: CFG, fetcher: async () => { throw new Error("offline"); } })).state, "failed");
  t.eq("a manifest that isn't JSON", (await checkAndInstallOta({ cfg: CFG, fetcher: async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }) })).state, "failed");

  for (const [code, state] of [["signature", "failed"], ["download", "failed"], ["invalid", "failed"], ["bad-build", "failed"], ["not-newer", "current"], ["needs-native", "needs-native"]]) {
    useNative(fakePlugin({ installError: code }));
    const out = await checkAndInstallOta({ cfg: CFG, fetcher: net(manifest()) });
    t.ok(`a refusal for "${code}" is ${state}, with the reason kept`, out.state === state && (state === "failed" ? out.reason === code : true), out);
  }
  useNative(fakePlugin({ installError: undefined }));
  const broke = fakePlugin(); broke.install = async () => { throw new Error("boom"); }; useNative(broke);
  t.eq("an error with no code is a download failure", (await checkAndInstallOta({ cfg: CFG, fetcher: net(manifest()) })).reason, "download");
}

t.group("how often");
{
  t.ok("never checked: check", shouldCheckOta({}));
  t.ok("an hour ago: not yet", !shouldCheckOta({ at: 1000 }, 1000 + 3600000));
  t.ok("six hours ago: yes", shouldCheckOta({ at: 1000 }, 1000 + OTA_CHECK_EVERY_MS));
  t.ok("just under: no", !shouldCheckOta({ at: 1000 }, 1000 + OTA_CHECK_EVERY_MS - 1));
}

t.group("the rest of the plugin's calls");
{
  const p = fakePlugin(); useNative(p);
  await confirmOtaBoot();
  t.eq("the app says it came up", p.calls.map((c) => c[0]), ["confirm"]);
  t.eq("applying now reports whether anything was swapped", [await applyOtaNow(), (useNative(fakePlugin({ applied: false })), await applyOtaNow())], [true, false]);
  useNative(null);
  await confirmOtaBoot();
  t.ok("confirming in a browser does nothing, and does not throw", true);
  t.eq("nor does applying", await applyOtaNow(), false);
  const bad = fakePlugin(); bad.confirm = async () => { throw new Error("x"); }; useNative(bad);
  await confirmOtaBoot();
  t.ok("a plugin that throws on confirm can't take the app down", true);
}

t.group("what is said");
{
  t.ok("ready", /next time you open the app/.test(describeOta({ state: "installed" })) && /next time you open the app/.test(describeOta({ state: "waiting" })));
  t.ok("needing the APK says so", /new install of the app itself/.test(describeOta({ state: "needs-native" })));
  t.ok("up to date", /newest version/.test(describeOta({ state: "current" })));
  t.ok("an unsigned update is named as such", /isn't signed by you/.test(describeOta({ state: "failed", reason: "signature" })));
  t.ok("a build that failed to start is said to be avoided", /failed to start before/.test(describeOta({ state: "failed", reason: "bad-build" })));
  t.ok("an ordinary failure is gentle and says it will try again", /try again later/.test(describeOta({ state: "failed", reason: "download" })));
  t.eq("nothing to say in a browser", describeOta({ state: "unavailable" }), null);
  t.eq("or for nothing", describeOta(null), null);
  t.ok("none of it blames the person or shouts", ["installed", "needs-native", "current", "failed"].every((s) => !/[!]/.test(describeOta({ state: s }))));
}

// Leave the global scope as it was found: other files expect to be running with no window.
delete globalThis.window;
