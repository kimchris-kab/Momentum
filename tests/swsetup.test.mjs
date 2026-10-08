import { suite } from "./harness.mjs";
import { setupServiceWorker } from "../src/swSetup.js";

const t = suite("swsetup");

// Where the service worker lives. The website and the home-screen install need it to work offline.
// The Android app must not have one, or it keeps serving the build it cached after a newer one is
// installed — which is what an over-the-air update has to get past — and any left by an older version
// has to go.
const fakes = ({ native = false, existing = 0, cacheKeys = [] } = {}) => {
  const log = { registered: [], unregistered: 0, deleted: [], loadListeners: [] };
  const nav = {
    serviceWorker: {
      register: async (url, opts) => { log.registered.push([url, opts]); },
      getRegistrations: async () => Array.from({ length: existing }, () => ({ unregister: async () => { log.unregistered++; } })),
    },
  };
  const win = {
    Capacitor: native ? { isNativePlatform: () => true } : undefined,
    caches: { keys: async () => cacheKeys, delete: async (k) => { log.deleted.push(k); } },
    document: { readyState: "complete" },
    addEventListener: (ev, fn) => { log.loadListeners.push([ev, fn]); },
  };
  return { nav, win, log };
};

t.group("on the web");
{
  const f = fakes();
  t.eq("a production build registers the worker", await setupServiceWorker({ ...f, pwa: true, prod: true }), "registered");
  t.eq("at the root, with the scope the app was built for", f.log.registered, [["/sw.js", { scope: "/" }]]);
  t.eq("and removes nothing", [f.log.unregistered, f.log.deleted], [0, []]);

  const early = fakes(); early.win.document.readyState = "loading";
  await setupServiceWorker({ ...early, pwa: true, prod: true });
  t.eq("before the page has loaded it waits, so the worker's download doesn't compete with the app's", [early.log.registered.length, early.log.loadListeners.map((l) => l[0])], [0, ["load"]]);
  await early.log.loadListeners[0][1]();
  t.eq("and registers when it has", early.log.registered.length, 1);

  const dev = fakes();
  t.eq("a development server has none", await setupServiceWorker({ ...dev, pwa: true, prod: false }), "off");
  t.eq("a preview build, which can't serve one, has none", await setupServiceWorker({ ...fakes(), pwa: false, prod: true }), "off");
  t.eq("neither registered anything", [dev.log.registered.length], [0]);

  t.eq("a browser with no support is left alone", await setupServiceWorker({ nav: {}, win: {}, pwa: true, prod: true }), "unsupported");
  t.eq("no browser at all, as in tests", await setupServiceWorker({ nav: null, win: null }), "unsupported");

  const failing = fakes(); failing.nav.serviceWorker.register = async () => { throw new Error("nope"); };
  t.eq("a refusal to register can't break the app", await setupServiceWorker({ ...failing, pwa: true, prod: true }), "registered");
}

t.group("in the Android app");
{
  const f = fakes({ native: true, existing: 2, cacheKeys: ["workbox-precache-v2-https://localhost/", "other"] });
  t.eq("none is registered, even in a production build", await setupServiceWorker({ ...f, pwa: true, prod: true }), "removed");
  t.eq("nothing registered", f.log.registered, []);
  t.eq("every worker an earlier version left is removed", f.log.unregistered, 2);
  t.eq("and every cache it filled", f.log.deleted, ["workbox-precache-v2-https://localhost/", "other"]);

  const later = fakes({ native: true, existing: 1, cacheKeys: ["a"] });
  const timers = []; later.win.setTimeout = (fn, ms) => { timers.push([fn, ms]); };
  await setupServiceWorker({ ...later, pwa: true, prod: true });
  t.eq("it looks again once the page has settled, since the old worker refills its cache while it still controls the page", timers.map((x) => x[1]), [5000]);
  await timers[0][0]();
  t.eq("and clears that too", [later.log.unregistered, later.log.deleted], [2, ["a", "a"]]);

  const clean = fakes({ native: true });
  t.eq("with none there, nothing to do", [await setupServiceWorker({ ...clean, pwa: true, prod: true }), clean.log.unregistered, clean.log.deleted], ["removed", 0, []]);

  const broken = fakes({ native: true, existing: 1 });
  broken.nav.serviceWorker.getRegistrations = async () => { throw new Error("no"); };
  t.eq("a failure while tidying can't stop the app starting", await setupServiceWorker({ ...broken, pwa: true, prod: true }), "removed");

  const noCaches = fakes({ native: true, existing: 1 }); noCaches.win.caches = undefined;
  t.eq("no cache storage is fine too", await setupServiceWorker({ ...noCaches, pwa: true, prod: true }), "removed");
}
