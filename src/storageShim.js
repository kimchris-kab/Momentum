// Momentum.jsx persists through window.storage.get/set (the shape provided by the
// artifact host it was originally authored in). Outside that host — plain web,
// PWA, or the Capacitor/Android shell — this polyfills the same API on top of
// localStorage so no app code has to change.
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const value = window.localStorage.getItem(key);
      return { value };
    },
    async set(key, value) {
      window.localStorage.setItem(key, value);
      return true;
    },
  };
}
