import { hapticCycle, vibratePattern } from "./pacer.js";

// Getting the breath to the phone's motor, by the best route there is:
//   1. The app's own native plugin, which can vary the strength of each pulse.
//   2. The browser's vibrate(), which can only switch it on and off. Still enough to follow.
//   3. Nothing, on a device with no motor, and the screen carries it alone.
const plugin = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.MomentumHaptics : null);
const webVibrate = () => (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" ? navigator.vibrate.bind(navigator) : null);

/** "native", "web" or "none": how the vibration will be delivered, so the screen can say so honestly. */
export function hapticsRoute() {
  if (plugin()?.play) return "native";
  if (webVibrate()) return "web";
  return "none";
}

/** Plays one breath. Never throws: a failed buzz must not take down the screen someone is using mid-urge. */
export async function playBreath(pattern) {
  const wave = hapticCycle(pattern);
  try {
    const p = plugin();
    if (p?.play) {
      await p.play({ timings: wave.timings, amplitudes: wave.amplitudes });
      return "native";
    }
    const v = webVibrate();
    if (v) { v(vibratePattern(wave)); return "web"; }
  } catch { /* fall through */ }
  return "none";
}

/** Stops whatever is buzzing now. */
export async function stopBreath() {
  try {
    const p = plugin();
    if (p?.cancel) { await p.cancel(); return; }
    webVibrate()?.(0);
  } catch { /* nothing to stop */ }
}

/**
 * What this phone can do, so the screen can say so rather than promise a buzz it can't give.
 * { route, motor, strength }: motor is false on a device with none (a tablet, an emulator),
 * strength is whether each pulse can be made stronger or softer.
 */
export async function hapticsInfo() {
  const route = hapticsRoute();
  if (route === "native") {
    try {
      const c = await plugin().capabilities();
      return { route, motor: c.motor !== false, strength: !!c.amplitude };
    } catch { /* ask nothing more of it */ }
  }
  return { route, motor: route !== "none", strength: false };
}
