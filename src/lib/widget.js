import { todayStr } from "./date.js";
import { agendaForDate, isDone, occursOn } from "./tasks.js";
import { dayState, lapsesOn, lastSlipAt, lastUrgeAt, limitOf, slipsOf } from "./urges.js";

// The home-screen widget reads a small snapshot rather than the app's state, so a schema
// change here can never break the launcher. Written through Capacitor Preferences, which on
// Android lands in the SharedPreferences file the widget provider reads.
//
// A few numbers and a list. The list scrolls inside the widget, so it carries everything today
// holds — an earlier version stopped at four rows, and a day with seven things on it looked like
// a day with four. The cap is a safety net for the size of the stored string, not a design limit.
export const WIDGET_KEY = "momentum:widget";
// Where the widget leaves the id of a habit whose Urge button was tapped, for the app to pick
// up when it comes to the front. The Java side writes this exact string; tests/android
// checks the two haven't drifted apart, since nothing else could until it failed on a phone.
export const PENDING_URGE_KEY = "momentum:pendingUrge";
// The same, for the I-slipped button on the notification-shade counter. Must match PENDING_LAPSE_KEY in
// MainActivity.java.
export const PENDING_LAPSE_KEY = "momentum:pendingLapse";
const MAX_ITEMS = 50;
// Two, not four: the rows carry a button each, and the widget is already a 3×2.
const MAX_QUITTING = 2;

export function widgetSnapshot(state, date = todayStr(), { usualWindow } = {}) {
  const { tasks = [], dayLog = {} } = state;
  const agenda = [
    ...agendaForDate(tasks, date, dayLog, "build"),
    ...agendaForDate(tasks, date, dayLog, "todo"),
  ];
  const done = agenda.filter((t) => isDone(t, date, dayLog)).length;
  // What's still to do comes first. On a long day the list scrolls, and the finished ones are
  // the ones that can afford to be below the fold.
  const ordered = [
    ...agenda.filter((t) => !isDone(t, date, dayLog)),
    ...agenda.filter((t) => isDone(t, date, dayLog)),
  ];

  return {
    date,
    done,
    total: agenda.length,
    streak: state.streak || 0,
    items: ordered.slice(0, MAX_ITEMS).map((t) => ({
      id: t.id,
      text: t.text.length > 40 ? `${t.text.slice(0, 39)}…` : t.text,
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
        text: t.text.length > 24 ? `${t.text.slice(0, 23)}…` : t.text,
        state: dayState(t, date, dayLog),
        lastSlipAt: lastSlipAt(t, state.urgeLog) || null,
        lastUrgeAt: lastUrgeAt(t, state.urgeLog) || null,
        // lastSlipAt falls back to the day the habit began; the widget needs to know which it is
        // to say "since the last slip" rather than claim a slip that never happened.
        everSlipped: slipsOf(t, state.urgeLog).length > 0,
        // When it usually pulls at you, as a time of day, for the widget to count down to itself. Absent
        // until the log says; supplied by the caller because working it out needs the radar module,
        // which the app only loads when it's wanted.
        risk: usualWindow ? usualWindow(t, state) : null,
        limit: limitOf(t),
        count: limitOf(t) ? lapsesOn(state.urgeLog, t.id, date).length : 0,
      })),
    updatedAt: Date.now(),
  };
}

const prefs = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.Preferences : null);

async function takeKey(key) {
  const p = prefs();
  if (!p?.get) return null;
  try {
    const { value } = await p.get({ key });
    if (!value) return null;
    await p.remove({ key });
    return value;
  } catch {
    return null;
  }
}

/**
 * Picks up an Urge tapped on the widget or the shade counter, and clears it so it opens once.
 * Returns the habit id, or null. Safe to call as often as the app likes — on start and every time
 * it comes back to the front — because the key is removed the moment it's read.
 */
export const takePendingUrge = () => takeKey(PENDING_URGE_KEY);

/** The same for an I-slipped tapped on the shade counter: the habit whose slip form should open. */
export const takePendingLapse = () => takeKey(PENDING_LAPSE_KEY);

/**
 * Writes the snapshot and asks the widget to redraw. A no-op on the web, where there is no
 * home screen to draw on — so callers don't need to know which platform they're on.
 */
export async function publishWidget(state, date = todayStr()) {
  const p = prefs();
  if (!p?.set) return { published: false, reason: "not-native" };
  // The radar is loaded now, when there's something to write, rather than with the app.
  let usualWindow;
  try { usualWindow = (await import("./radar.js")).usualWindow; } catch { /* the widget just goes without a risk line */ }
  const snapshot = widgetSnapshot(state, date, { usualWindow });
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
