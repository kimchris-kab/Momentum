import { todayStr } from "./date.js";
import { agendaForDate, isDone, occursOn } from "./tasks.js";
import { dayState, lapsesOn, lastSlipAt, limitOf } from "./urges.js";

// The home-screen widget reads a small snapshot rather than the app's state, so a schema
// change here can never break the launcher. Written through Capacitor Preferences, which on
// Android lands in the SharedPreferences file the widget provider reads.
//
// Kept deliberately tiny: four rows, three numbers. A widget that needs scrolling is a app.
export const WIDGET_KEY = "momentum:widget";
// Where the widget leaves the id of a habit whose Urge button was tapped, for the app to pick
// up when it comes to the front. The Java side writes this exact string; tests/android
// checks the two haven't drifted apart, since nothing else could until it failed on a phone.
export const PENDING_URGE_KEY = "momentum:pendingUrge";
const MAX_ITEMS = 4;
// Two, not four: the rows carry a button each, and the widget is already a 3×2.
const MAX_QUITTING = 2;

export function widgetSnapshot(state, date = todayStr()) {
  const { tasks = [], dayLog = {} } = state;
  const agenda = [
    ...agendaForDate(tasks, date, dayLog, "build"),
    ...agendaForDate(tasks, date, dayLog, "todo"),
  ];
  const done = agenda.filter((t) => isDone(t, date, dayLog)).length;

  return {
    date,
    done,
    total: agenda.length,
    streak: state.streak || 0,
    items: agenda.slice(0, MAX_ITEMS).map((t) => ({
      id: t.id,
      text: t.text.length > 28 ? `${t.text.slice(0, 27)}…` : t.text,
      done: isDone(t, date, dayLog),
    })),
    // The break side, with an Urge button each. An urge button only helps if it can be reached
    // in the moment — unlock, open the app, scroll past Today is exactly the friction that
    // loses one. The last slip goes as a timestamp, not "4d 6h": the widget works the gap out
    // when it draws, so it doesn't sit frozen at whatever it was when the app last wrote.
    quitting: tasks
      .filter((t) => t.kind === "break" && !t.archivedAt && occursOn(t, date))
      .slice(0, MAX_QUITTING)
      .map((t) => ({
        id: t.id,
        text: t.text.length > 22 ? `${t.text.slice(0, 21)}…` : t.text,
        state: dayState(t, date, dayLog),
        lastSlipAt: lastSlipAt(t, state.urgeLog) || null,
        limit: limitOf(t),
        count: limitOf(t) ? lapsesOn(state.urgeLog, t.id, date).length : 0,
      })),
    updatedAt: Date.now(),
  };
}

const prefs = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.Preferences : null);

/**
 * Picks up an Urge tapped on the widget, and clears it so it opens once. Returns the habit id,
 * or null. Safe to call as often as the app likes — on start and every time it comes back to
 * the front — because the key is removed the moment it's read.
 */
export async function takePendingUrge() {
  const p = prefs();
  if (!p?.get) return null;
  try {
    const { value } = await p.get({ key: PENDING_URGE_KEY });
    if (!value) return null;
    await p.remove({ key: PENDING_URGE_KEY });
    return value;
  } catch {
    return null;
  }
}

/**
 * Writes the snapshot and asks the widget to redraw. A no-op on the web, where there is no
 * home screen to draw on — so callers don't need to know which platform they're on.
 */
export async function publishWidget(state, date = todayStr()) {
  const p = prefs();
  if (!p?.set) return { published: false, reason: "not-native" };
  const snapshot = widgetSnapshot(state, date);
  try {
    await p.set({ key: WIDGET_KEY, value: JSON.stringify(snapshot) });
    // Optional bridge: if the native side exposes a refresh, use it so the widget updates
    // the moment something is ticked rather than on its half-hour cycle.
    await window.Capacitor?.Plugins?.MomentumWidget?.refresh?.().catch?.(() => {});
    return { published: true, snapshot };
  } catch (e) {
    return { published: false, reason: String(e) };
  }
}
