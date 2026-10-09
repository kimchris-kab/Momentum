import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { suite } from "./harness.mjs";
import {
  MAX_FILES, buildId, buildManifest, isSafePath, sha256, signManifest, signingPayload, verifyManifest,
} from "../scripts/ota.mjs";
import { OTA_KEEP, publishOta } from "../scripts/deploy-supabase.mjs";

const t = suite("ota-publish");

// What goes up to Supabase for an installed app to pick up: the manifest of files and hashes, the
// order things are uploaded in (the manifest last, so it never points at files that aren't there),
// and the optional signature that stops anyone but you from changing the app.
const make = (files = { "index.html": "<html>", "assets/app-AbCdEf12.js": "console.log(1)", "build.json": "{}" }) => {
  const dir = mkdtempSync(join(tmpdir(), "ota-"));
  Object.entries(files).forEach(([p, body]) => {
    const full = join(dir, p);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  });
  return dir;
};
const INFO = { version: "1.0.0", build: "2026-10-08T05:31:46.351Z", commit: "4240a31", requiresNativeApi: 1 };

t.group("paths");
{
  t.ok("ordinary build paths are safe", ["index.html", "assets/app-AbCd1234.js", "icons/icon-192.png", "manifest.webmanifest"].every(isSafePath));
  t.ok("climbing out of the folder is not", ["../x", "a/../b", "/etc/passwd", "a//b", "./a", "a/.", ".."].every((p) => !isSafePath(p)));
  t.ok("nor are odd characters", ["a b", "a;b", "a\\b", "é.js", "a\u0000b", ""].every((p) => !isSafePath(p)));
  t.ok("nor anything absurdly long", !isSafePath("a".repeat(300)));
  t.ok("nor something that isn't a string", !isSafePath(null) && !isSafePath(5) && !isSafePath(undefined));
}

t.group("the build's id");
{
  t.eq("a timestamp and a commit, which sort in the order they were made", buildId(INFO), "20261008-053146Z-4240a31");
  t.eq("with no commit it says dev", buildId({ ...INFO, commit: "" }), "20261008-053146Z-dev");
  t.ok("a later build sorts after an earlier one", buildId({ ...INFO, build: "2026-10-09T00:00:00.000Z" }) > buildId(INFO));
}

t.group("the manifest");
{
  const dir = make();
  const m = buildManifest({ dir, info: INFO, notes: "What changed" });
  t.eq("it names the app, the build, and what the build needs underneath it", [m.app, m.id, m.version, m.commit, m.requiresNativeApi], ["momentum", "20261008-053146Z-4240a31", "1.0.0", "4240a31", 1]);
  t.eq("every file, in order, with its real size", m.files.map((f) => [f.path, f.size]), [["assets/app-AbCdEf12.js", 14], ["build.json", 2], ["index.html", 6]]);
  t.eq("and its real SHA-256", m.files.find((f) => f.path === "index.html").sha256, sha256(Buffer.from("<html>")));
  t.ok("the same content hashes the same, different content differently", sha256(Buffer.from("a")) === sha256(Buffer.from("a")) && sha256(Buffer.from("a")) !== sha256(Buffer.from("b")));
  const rev = make({ "z.js": "1", "m.js": "2", "a.js": "3", "index.html": "x" });
  t.eq("files are listed in a fixed order whatever order the disk gives them", buildManifest({ dir: rev, info: INFO }).files.map((f) => f.path), ["a.js", "index.html", "m.js", "z.js"]);
  rmSync(rev, { recursive: true, force: true });
  t.eq("notes are carried", m.notes, "What changed");
  t.eq("long notes are cut", buildManifest({ dir, info: INFO, notes: "x".repeat(900) }).notes.length, 400);
  t.ok("unsigned unless asked to sign", !("signature" in m));
  t.eq("a build that doesn't say what it needs is taken to need the first version", buildManifest({ dir, info: { ...INFO, requiresNativeApi: undefined } }).requiresNativeApi, 1);

  const withMaps = make({ "index.html": "<html>", "assets/a-AbCdEf12.js": "x", "assets/a-AbCdEf12.js.map": "{}" });
  t.ok("source maps are left out", !buildManifest({ dir: withMaps, info: INFO }).files.some((f) => f.path.endsWith(".map")));
  const noIndex = make({ "assets/a.js": "x" });
  let msg = ""; try { buildManifest({ dir: noIndex, info: INFO }); } catch (e) { msg = e.message; }
  t.ok("a build with no index.html is refused", /no index\.html/.test(msg), msg);
  const odd = make({ "index.html": "x", "a b.js": "x" });
  msg = ""; try { buildManifest({ dir: odd, info: INFO }); } catch (e) { msg = e.message; }
  t.ok("a file name that can't be shipped safely is refused, by name", /a b\.js/.test(msg), msg);
  const many = make(Object.fromEntries([["index.html", "x"], ...Array.from({ length: MAX_FILES + 1 }, (_, i) => [`f${i}.js`, "x"])]));
  msg = ""; try { buildManifest({ dir: many, info: INFO }); } catch (e) { msg = e.message; }
  t.ok("too many files is refused", /more than the/.test(msg), msg);
  const big = make({ "index.html": "x", "big.bin": Buffer.alloc(31 * 1024 * 1024) });
  msg = ""; try { buildManifest({ dir: big, info: INFO }); } catch (e) { msg = e.message; }
  t.ok("too large a build is refused", /MB/.test(msg), msg);
  [dir, withMaps, noIndex, odd, many, big].forEach((d) => rmSync(d, { recursive: true, force: true }));
}

t.group("signing");
{
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const priv = privateKey.export({ type: "pkcs8", format: "pem" });
  const pub = publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const dir = make();
  const m = buildManifest({ dir, info: INFO, privateKeyPem: priv });
  t.ok("a signed manifest carries a signature", typeof m.signature === "string" && m.signature.length > 40);
  t.ok("that the matching public key accepts", verifyManifest(m, pub));
  t.ok("and another key does not", !verifyManifest(m, generateKeyPairSync("ec", { namedCurve: "prime256v1" }).publicKey.export({ type: "spki", format: "der" }).toString("base64")));
  t.ok("changing one file's hash breaks it", !verifyManifest({ ...m, files: m.files.map((f, i) => (i ? f : { ...f, sha256: "0".repeat(64) })) }, pub));
  t.ok("changing a size breaks it", !verifyManifest({ ...m, files: m.files.map((f, i) => (i ? f : { ...f, size: f.size + 1 })) }, pub));
  t.ok("adding a file breaks it", !verifyManifest({ ...m, files: [...m.files, { path: "evil.js", sha256: "0".repeat(64), size: 1 }] }, pub));
  t.ok("renaming a file breaks it", !verifyManifest({ ...m, files: m.files.map((f, i) => (i ? f : { ...f, path: "other.js" })) }, pub));
  t.ok("so does the build id", !verifyManifest({ ...m, id: "someone-elses" }, pub));
  t.ok("and the claim about the native API it needs", !verifyManifest({ ...m, requiresNativeApi: 99 }, pub));
  t.ok("a manifest with no signature fails", !verifyManifest({ ...m, signature: undefined }, pub));
  t.ok("garbage fails rather than throwing", !verifyManifest(m, "not a key") && !verifyManifest({ ...m, signature: "###" }, pub));
  t.ok("notes aren't signed, so they can be fixed without re-signing", verifyManifest({ ...m, notes: "edited" }, pub));
  t.eq("the signed text is fixed and spelled out", signingPayload({ id: "i", build: "b", requiresNativeApi: 2, files: [{ sha256: "h", size: 3, path: "p" }] }), "momentum-ota-v1\ni\nb\n2\nh 3 p\n");
  t.eq("signing the same manifest twice verifies the same", verifyManifest({ ...m, signature: signManifest(m, priv) }, pub), true);
  rmSync(dir, { recursive: true, force: true });
}

t.group("publishing");
{
  const dir = make({ "index.html": "<html>", "assets/app-AbCdEf12.js": "x", "build.json": JSON.stringify(INFO), "sw.js": "y" });
  const calls = [];
  const folders = ["20260101-000000Z-aaaa", "20260201-000000Z-bbbb", "20260301-000000Z-cccc", "20260401-000000Z-dddd"];
  const fetcher = async (url, init = {}) => {
    calls.push({ url, method: init.method, headers: init.headers, body: init.body });
    if (/\/object\/list\/app$/.test(url)) {
      const { prefix } = JSON.parse(init.body);
      if (prefix === "ota") return { ok: true, json: async () => [...folders.map((name) => ({ name, id: null })), { name: "20261008-053146Z-4240a31", id: null }, { name: "latest.json", id: "x" }] };
      return { ok: true, json: async () => [{ name: "index.html", id: "1" }, { name: "assets", id: null }] };
    }
    return { ok: true, text: async () => "" };
  };
  const logs = [];
  const r = await publishOta({ base: "https://p.supabase.co", key: "SERVICE", dir, fetcher, log: (m) => logs.push(m) });
  const posts = calls.filter((c) => c.method === "POST" && /\/object\/app\//.test(c.url));
  t.eq("every file goes under the build's own folder", posts.slice(0, -1).map((c) => c.url.replace("https://p.supabase.co/storage/v1/object/app/", "")).sort(),
    ["ota/20261008-053146Z-4240a31/assets/app-AbCdEf12.js", "ota/20261008-053146Z-4240a31/build.json", "ota/20261008-053146Z-4240a31/index.html", "ota/20261008-053146Z-4240a31/sw.js"]);
  t.eq("and the manifest goes last, so it never announces files that haven't arrived", posts[posts.length - 1].url.endsWith("ota/latest.json"), true);
  t.eq("the manifest is sent as JSON", posts[posts.length - 1].headers["Content-Type"], "application/json");
  t.eq("the manifest uploaded is the one built", JSON.parse(posts[posts.length - 1].body).id, "20261008-053146Z-4240a31");
  t.ok("uploads carry the service key, as a bearer token", posts.every((c) => c.headers.Authorization === "Bearer SERVICE"));
  t.ok("and replace what's there", posts.every((c) => c.headers["x-upsert"] === "true"));
  t.ok("nothing is cached, since the folder is named for the build and the manifest must always be fresh", posts.every((c) => c.headers["Cache-Control"] === "no-cache"));
  t.ok("each file goes up with its own type", posts.find((c) => c.url.endsWith("index.html")).headers["Content-Type"].startsWith("text/html") && posts.find((c) => c.url.endsWith(".js") && c.url.includes("assets")).headers["Content-Type"].startsWith("text/javascript"));
  t.eq("it says how many it uploaded", r.uploaded, 5);
  t.ok("it says whether the build is signed", logs[0].includes("NOT signed"));
  t.eq("the newest few builds are kept, and the oldest folders removed", r.pruned, ["20260101-000000Z-aaaa", "20260201-000000Z-bbbb", "20260301-000000Z-cccc"].slice(0, folders.length + 1 - OTA_KEEP));
  const deletes = calls.filter((c) => c.method === "DELETE");
  t.eq("each removal names the files in that folder", JSON.parse(deletes[0].body).prefixes, ["ota/20260101-000000Z-aaaa/index.html"]);
  t.ok("the build just published is never removed", !deletes.some((c) => c.body.includes("4240a31")));
  t.ok("nor the manifest", !deletes.some((c) => c.body.includes("latest.json")));

  const dry = []; const dryCalls = [];
  const rd = await publishOta({ base: "https://p.supabase.co", key: "K", dir, dry: true, fetcher: async (...a) => { dryCalls.push(a); return { ok: true }; }, log: (m) => dry.push(m) });
  t.eq("a dry run touches nothing", [dryCalls.length, rd.uploaded], [0, 0]);
  t.ok("but says what it would do", dry.length > 3);

  let msg = "";
  try { await publishOta({ base: "https://p.supabase.co", key: "K", dir, fetcher: async () => ({ ok: false, status: 403, text: async () => "denied" }) }); } catch (e) { msg = e.message; }
  t.ok("a refused upload stops everything and says which file", /403 denied/.test(msg) && /ota\//.test(msg), msg);
  const order = [];
  const noWait = async () => {};
  try { await publishOta({ base: "https://p.supabase.co", key: "K", dir, sleep: noWait, fetcher: async (u, i) => { order.push(u); return /sw\.js$/.test(u) ? { ok: false, status: 500, text: async () => "" } : { ok: true, text: async () => "", json: async () => [] }; } }); } catch { /* expected */ }
  t.ok("so a failure part way never reaches the manifest", !order.some((u) => u.endsWith("latest.json")), order);

  // A hiccup at the storage edge (a 520 from the CDN, a rate limit, a dropped connection) is retried; a refusal is not.
  const attempts = {};
  const waits = [];
  const flaky = async (u) => {
    attempts[u] = (attempts[u] || 0) + 1;
    if (/index\.html$/.test(u) && attempts[u] === 1) return { ok: false, status: 520, text: async () => "<!DOCTYPE html>" };
    if (/index\.html$/.test(u) && attempts[u] === 2) throw new Error("socket hang up");
    if (/build\.json$/.test(u) && attempts[u] === 1) return { ok: false, status: 429, text: async () => "slow down" };
    return { ok: true, text: async () => "", json: async () => [] };
  };
  const rr = await publishOta({ base: "https://p.supabase.co", key: "K", dir, fetcher: flaky, sleep: async (ms) => { waits.push(ms); } });
  t.ok("a 520 and a dropped connection on one file, and a rate limit on another, are retried until they go through", rr.uploaded > 0 && Object.entries(attempts).filter(([u]) => /index\.html$/.test(u))[0][1] === 3);
  t.eq("waiting longer each time it fails again on the same file", waits, [1000, 1000, 2000]);
  const forbidden = {};
  try { await publishOta({ base: "https://p.supabase.co", key: "K", dir, sleep: noWait, fetcher: async (u) => { forbidden[u] = (forbidden[u] || 0) + 1; return { ok: false, status: 403, text: async () => "denied" }; } }); } catch { /* expected */ }
  t.ok("a refusal is not retried", Object.values(forbidden).every((n) => n === 1), forbidden);
  let gaveUp = "";
  try { await publishOta({ base: "https://p.supabase.co", key: "K", dir, tries: 3, sleep: noWait, fetcher: async () => ({ ok: false, status: 503, text: async () => "unavailable" }) }); } catch (e) { gaveUp = e.message; }
  t.ok("persistent failure gives up, and says how often it tried", /503 unavailable/.test(gaveUp) && /gave up after 3 tries/.test(gaveUp), gaveUp);
  rmSync(dir, { recursive: true, force: true });
}
