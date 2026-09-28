// Startup, made observable. Imported before anything else, so it sees errors thrown while
// the rest of the app is still loading.
//
// Written after the first install on a real phone sat on "Loading your map…" and said
// nothing else — the same build started fine in every browser, and there was no way to see
// what the phone's WebView was objecting to. Every step now leaves a mark in the console
// (which Capacitor forwards to the Android system log) and on the loading screen itself, so
// a stuck start explains itself to whoever is looking at it.
const boot = {
  startedAt: Date.now(),
  step: "scripts loaded",
  errors: [],
};

if (typeof window !== "undefined") {
  window.__momentumBoot = boot;

  const remember = (message) => {
    const text = String(message || "unknown error").slice(0, 300);
    if (boot.errors.length < 8 && !boot.errors.includes(text)) boot.errors.push(text);
    // One prefix for everything, so the system log can be filtered down to just this app.
    console.error(`[momentum] ${text}`);
  };

  window.addEventListener("error", (e) => {
    // A script, stylesheet or image that failed to load arrives here too, with no message —
    // and a <link> reports its address as href, not src. Name the file rather than log "error".
    const file = e?.target?.src || e?.target?.href;
    remember(e?.error?.stack?.split("\n").slice(0, 2).join(" ") || e?.message
      || (file ? `failed to load ${file}` : "error"));
  }, true);
  window.addEventListener("unhandledrejection", (e) => {
    remember(`unhandled: ${e?.reason?.stack?.split("\n").slice(0, 2).join(" ") || e?.reason}`);
  });
}

/** Records how far startup got. Cheap enough to call at every step. */
export function bootStep(step) {
  boot.step = step;
  console.info(`[momentum] boot: ${step}`);
}

export const bootState = () => boot;
