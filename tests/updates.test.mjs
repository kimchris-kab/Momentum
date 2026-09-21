import { suite } from "./harness.mjs";
import {
  CHECK_EVERY_MS, DEFAULT_BUCKET, MANIFEST_NAME, applyPlan, applyUpdate, checkForUpdate,
  compareVersions, describeBuild, isNewer, manifestUrl, readManifest, shouldCheck,
} from "../src/lib/updates.js";

const t = suite("updates");

const CURRENT = { version: "1.2.0", build: "2026-09-20T10:00:00.000Z", commit: "abc1234" };
const manifest = (patch) => ({
  app: "momentum", version: "1.2.0", build: "2026-09-20T10:00:00.000Z", commit: "abc1234", ...patch,
});

t.group("comparing builds");
{
  t.eq("a bigger major", compareVersions("2.0.0", "1.9.9"), 1);
  t.eq("a bigger minor", compareVersions("1.3.0", "1.2.9"), 1);
  t.eq("a bigger patch", compareVersions("1.2.1", "1.2.0"), 1);
  t.eq("equal", compareVersions("1.2.0", "1.2.0"), 0);
  t.eq("smaller", compareVersions("1.2.0", "1.3.0"), -1);
  t.eq("ten beats nine, which string comparison gets wrong", compareVersions("1.10.0", "1.9.0"), 1);
  // A missing part is zero (1.2 is 1.2.0); a part that isn't a number sorts below anything.
  t.eq("a short version is filled out", compareVersions("1.2", "1.2.0"), 0);
  t.eq("...in both directions", compareVersions("1.2.0", "1.2"), 0);
  // Anything unparseable sorts low, so a mangled manifest can never claim to be newer.
  t.eq("nonsense is not newer", compareVersions("banana", "1.0.0"), -1);
  t.eq("...in either direction", compareVersions("1.0.0", "banana"), 1);

  t.ok("a newer version is newer", isNewer({ version: "1.3.0" }, CURRENT));
  t.ok("an older one isn't", !isNewer({ version: "1.1.0" }, CURRENT));
  // Not every deploy bumps a number, so the build time is what separates two 1.2.0s.
  t.ok("the same version, built later, is newer",
    isNewer({ version: "1.2.0", build: "2026-09-21T10:00:00.000Z" }, CURRENT));
  t.ok("...built earlier is not",
    !isNewer({ version: "1.2.0", build: "2026-09-19T10:00:00.000Z" }, CURRENT));
  t.ok("...built at the same moment is not", !isNewer({ version: "1.2.0", build: CURRENT.build }, CURRENT));
  t.ok("no build stamp at all claims nothing", !isNewer({ version: "1.2.0" }, CURRENT));
}

t.group("reading a manifest");
{
  t.ok("a newer build is offered", readManifest(manifest({ version: "1.3.0" }), CURRENT).available);
  t.eq("...with what changed", readManifest(manifest({ version: "1.3.0", notes: "Search everywhere" }), CURRENT).latest.notes,
    "Search everywhere");
  t.ok("the same build is not", !readManifest(manifest(), CURRENT).available);
  t.eq("...and says so plainly", readManifest(manifest(), CURRENT).reason, "current");

  // An update check has to be unwilling to claim an update. Every one of these is a case
  // where saying "new version available" would be wrong.
  t.eq("nothing at all", readManifest(null, CURRENT).reason, "unreadable");
  t.eq("a string", readManifest("1.3.0", CURRENT).reason, "unreadable");
  t.eq("an empty object", readManifest({}, CURRENT).reason, "unreadable");
  t.eq("someone else's manifest", readManifest(manifest({ app: "other", version: "9.9.9" }), CURRENT).reason, "not-ours");
  t.ok("a manifest with no app name is still read", readManifest({ version: "1.3.0" }, CURRENT).available);
  t.ok("release notes can't run away with the screen",
    readManifest(manifest({ version: "1.3.0", notes: "x".repeat(900) }), CURRENT).latest.notes.length <= 400);
  t.eq("notes that aren't text are dropped",
    readManifest(manifest({ version: "1.3.0", notes: { a: 1 } }), CURRENT).latest.notes, "");
}

t.group("where the manifest lives");
{
  t.eq("next to the built files in the bucket",
    manifestUrl({ url: "https://p.supabase.co" }),
    "https://p.supabase.co/storage/v1/object/public/app/version.json");
  t.eq("a trailing slash doesn't double up",
    manifestUrl({ url: "https://p.supabase.co/" }).includes("//storage"), false);
  t.eq("a named bucket", manifestUrl({ url: "https://p.supabase.co" }, "builds").includes("/builds/"), true);
  t.eq("the defaults", [DEFAULT_BUCKET, MANIFEST_NAME], ["app", "version.json"]);
}

t.group("how often to look");
{
  const now = 1_800_000_000_000;
  t.ok("a first check always happens", shouldCheck(null, now));
  t.ok("not again minutes later", !shouldCheck(now - 60_000, now));
  t.ok("but yes much later", shouldCheck(now - CHECK_EVERY_MS - 1, now));
  t.eq("the gap", CHECK_EVERY_MS, 6 * 60 * 60 * 1000);
}

t.group("fetching it");
{
  const fetcher = (body, status = 200) => async () => ({
    ok: status < 400, status, json: async () => body,
  });
  t.ok("a newer manifest is reported",
    (await checkForUpdate("https://x/version.json", { current: CURRENT, fetcher: fetcher(manifest({ version: "1.3.0" })) })).available);
  // The cache is the whole reason a check can look like it's working while telling you
  // nothing, so it's explicitly bypassed.
  let seen = null;
  await checkForUpdate("https://x/version.json", {
    current: CURRENT,
    fetcher: async (url, opts) => { seen = opts; return { ok: true, status: 200, json: async () => manifest() }; },
  });
  t.eq("the browser's cache is bypassed", seen.cache, "no-store");

  t.eq("no URL, nothing to do",
    (await checkForUpdate("", { current: CURRENT })).reason, "not-configured");
  t.eq("a missing manifest is not an update",
    (await checkForUpdate("https://x", { current: CURRENT, fetcher: fetcher(null, 404) })).reason, "status-404");
  t.eq("being offline is not an update",
    (await checkForUpdate("https://x", { current: CURRENT, fetcher: async () => { throw new TypeError("offline"); } })).reason,
    "unreachable");
  t.eq("html where JSON should be is not an update",
    (await checkForUpdate("https://x", {
      current: CURRENT,
      fetcher: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }),
    })).reason, "unreachable");
}

t.group("what applying it means here");
{
  // Saying "update available" on a platform that can't take one would be a lie with a
  // button on it.
  const native = applyPlan({ isNative: true });
  t.ok("the installed Android app can't replace itself", !native.can);
  t.ok("...and says why rather than offering a dead button", /inside the APK/.test(native.text));
  t.ok("a browser can", applyPlan({ hasServiceWorker: true }).can);
  t.ok("...and says the download already happened", /already downloaded/.test(applyPlan({ hasServiceWorker: true }).text));
  t.ok("so can one without a service worker", applyPlan({}).can);
  t.ok("nothing on the device is touched, and it says so", /nothing on this device/i.test(applyPlan({}).text));
}

t.group("applying it");
{
  // navigator is getter-only under node, so it has to be redefined rather than assigned.
  const realSw = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const setNavigator = (value) =>
    Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
  let reloaded = false;
  let skipped = false;
  let updated = false;
  setNavigator({
    serviceWorker: {
      getRegistration: async () => ({
        update: async () => { updated = true; },
        waiting: { postMessage: (m) => { skipped = m.type === "SKIP_WAITING"; } },
      }),
    },
  });
  await applyUpdate({ reload: () => { reloaded = true; } });
  t.ok("the worker is asked to fetch the new build", updated);
  t.ok("...and to stop waiting", skipped);
  t.ok("...and then the page reloads", reloaded);

  // No service worker, or one that throws: a reload still gets the new files.
  setNavigator({});
  reloaded = false;
  await applyUpdate({ reload: () => { reloaded = true; } });
  t.ok("without a worker it still reloads", reloaded);
  if (realSw) Object.defineProperty(globalThis, "navigator", realSw);
}

t.group("naming a build");
{
  t.eq("version and commit", describeBuild(CURRENT), "v1.2.0 · abc1234");
  t.eq("version alone", describeBuild({ version: "1.2.0" }), "v1.2.0");
  t.eq("nothing known", describeBuild(null), "Unknown build");
}

// ---- The deploy script's rules about caching, which decide whether updates ever arrive ----
const deploy = await import("../scripts/deploy-supabase.mjs").catch(() => null);

t.group("what the deploy script sends");
if (!deploy) {
  t.ok("the deploy script could be loaded", false, "import failed — it likely ran its main body");
} else {
  // A hashed filename can never change contents, so it can be cached forever.
  t.eq("hashed assets are immutable",
    deploy.cacheControl("assets/index-DU_mhLXy.js"), "public, max-age=31536000, immutable");
  // These three are the ones that must not be cached, or the browser serves last week's app
  // for ever and the update never arrives however often it checks.
  t.eq("the page itself is never cached", deploy.cacheControl("index.html"), "no-cache");
  t.eq("nor the service worker", deploy.cacheControl("sw.js"), "no-cache");
  t.eq("nor the manifest that announces updates", deploy.cacheControl("version.json"), "no-cache");
  t.eq("anything else gets an hour", deploy.cacheControl("icons/icon-192.png"), "public, max-age=3600");

  t.eq("javascript is served as javascript", deploy.contentType("assets/x.js"), "text/javascript; charset=utf-8");
  t.eq("...and the web manifest as its own type", deploy.contentType("manifest.webmanifest"), "application/manifest+json");
  t.eq("an unknown extension falls back to bytes", deploy.contentType("x.bin"), "application/octet-stream");
}
