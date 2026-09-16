// Momentum.jsx persists through window.storage.get/set (the shape provided by the
// artifact host it was originally authored in). Outside that host — plain web,
// PWA, or the Capacitor/Android shell — this polyfills the same API on top of
// localStorage so no app code has to change.
//
// Every access is guarded: localStorage throws outright in a private window, with site
// data blocked, or inside some sandboxed frames. A storage failure should cost you
// persistence for that session, not the whole app.
if (typeof window !== "undefined" && !window.storage) {
  let memory = {};
  let warned = false;

  const warnOnce = (e) => {
    if (warned) return;
    warned = true;
    console.warn("Storage unavailable — this session won't be saved.", e);
  };

  window.storage = {
    async get(key) {
      try {
        return { value: window.localStorage.getItem(key) };
      } catch (e) {
        warnOnce(e);
        return { value: memory[key] ?? null };
      }
    },
    async set(key, value) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        warnOnce(e);
        memory[key] = value;
        return false;
      }
    },
  };
}
