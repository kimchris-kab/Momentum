// The service worker is for the website and the home-screen install, where it is what lets the app open
// offline. In the Android app every file already sits on the phone, so a worker would only stand between
// the app and its files: it would keep serving the build it had cached after a newer one was installed, and
// that is exactly what an over-the-air update has to get past. So there, none is registered, and any left
// by an earlier version is removed.

/* global __PWA__ */
const inBuild = () => (typeof __PWA__ !== "undefined" ? __PWA__ : false);

export async function setupServiceWorker({
  nav = typeof navigator !== "undefined" ? navigator : null,
  win = typeof window !== "undefined" ? window : null,
  pwa = inBuild(),
  prod = typeof import.meta !== "undefined" ? !!import.meta.env?.PROD : false,
} = {}) {
  if (!nav || !("serviceWorker" in nav) || !win) return "unsupported";
  const native = !!win.Capacitor?.isNativePlatform?.();
  if (native) {
    const sweep = async () => {
      try {
        const regs = await nav.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        if (win.caches?.keys) await Promise.all((await win.caches.keys()).map((k) => win.caches.delete(k)));
      } catch { /* nothing to remove */ }
    };
    await sweep();
    // A worker that has been told to go carries on controlling this page until the page closes, and while it
    // does it fills its cache again as the page loads more of itself. Once the page has settled, clear that too.
    if (typeof win.setTimeout === "function") win.setTimeout(sweep, 5000);
    return "removed";
  }
  if (!pwa || !prod) return "off";
  // Once the page has loaded, so the worker's first download doesn't compete with the app's own.
  const register = () => nav.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  if (win.document?.readyState === "complete") register();
  else win.addEventListener("load", register);
  return "registered";
}
