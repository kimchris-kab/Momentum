import { todayStr } from "./date.js";
import { agendaForDate, isDone } from "./tasks.js";

// The home-screen widget reads a small snapshot rather than the app's state, so a schema
// change here can never break the launcher. Written through Capacitor Preferences, which on
// Android lands in the SharedPreferences file the widget provider reads.
//
// Kept deliberately tiny: four rows, three numbers. A widget that needs scrolling is a app.
export const WIDGET_KEY = "momentum:widget";
const MAX_ITEMS = 4;

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
    updatedAt: Date.now(),
  };
}

const prefs = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.Preferences : null);

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
