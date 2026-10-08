import { dstr } from "./date.js";
import { dayState } from "./urges.js";
import { pinnedHabit } from "./shade.js";
import { seeded } from "./seeded.js";
import { PEP_MIN_DAYS, cleanDays, pepSettings, quits, toMinutes } from "./pep.js";

// Planning what to send and when. Kept apart from the rest of the notes code because the app only
// needs it when it is about to hand a plan to the phone, not to start up.

const WRITE_LINES = [
  "Write one thing you did well today.",
  "What got you through today? One line.",
  "One line for the you of next week: why you can do this.",
  "Something you handled better than you used to. Write it down.",
  "What would you tell someone starting today? One line.",
];

// The reminder lives in the first 60% of the person's hours and the writing prompt in the last 40%,
// so a note to read arrives while the day is still going and the ask to write one comes near its end.
const SPLIT = 0.6;

const atMinute = (date, minute) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d, Math.floor(minute / 60), minute % 60, 0, 0);
};

/** Notes that could be sent back: those for habits still being broken, newest first. */
const pool = (state) => {
  const ids = new Set(quits(state.tasks).map((t) => t.id));
  return (state.pepNotes || []).filter((n) => ids.has(n.taskId)).sort((a, b) => b.at - a.at);
};

/**
 * What to send over the next week and when, as plain items: { id, at, kind: "write" | "remind", taskId,
 * title, body }. Nothing is planned for a moment already past, and nothing for a switched-off kind.
 */
export function pepPlan(state, now = Date.now(), { days = 7 } = {}) {
  const cfg = pepSettings(state.settings);
  if (!cfg.on) return [];
  const f = toMinutes(cfg.from), tEnd = toMinutes(cfg.to);
  const cut = f + Math.floor((tEnd - f) * SPLIT);
  const habits = quits(state.tasks);
  const notes = pool(state);
  const items = [];
  const pin = pinnedHabit(state.tasks);
  let lastPicked = null;

  for (let i = 0; i < days; i++) {
    const dayStart = new Date(now); dayStart.setDate(dayStart.getDate() + i);
    const date = dstr(dayStart);
    const rand = seeded(`pep:${date}`);

    // Rolled every day whether or not they're used, so writing your first note doesn't move the times
    // of everything after it.
    const pickRoll = rand(), timeRoll = rand();
    if (cfg.remind && notes.length) {
      let pick = notes[Math.floor(pickRoll * notes.length)];
      if (notes.length > 1 && pick.id === lastPicked) pick = notes[(notes.indexOf(pick) + 1) % notes.length];
      lastPicked = pick.id;
      const at = atMinute(date, f + Math.floor(timeRoll * (cut - f)));
      if (at.getTime() > now) {
        items.push({
          id: `pep:${date}:remind`, at: at.getTime(), kind: "remind", taskId: pick.taskId,
          title: pick.day ? `You, on day ${pick.day}` : "A note from you", body: pick.text,
        });
      }
    }

    if (cfg.write) {
      // The line and the minute are rolled every day whether or not there's anyone to ask, so a habit
      // reaching its third day doesn't shift the times of the days after it.
      const line = WRITE_LINES[Math.floor(rand() * WRITE_LINES.length)];
      const at = atMinute(date, cut + Math.floor(rand() * Math.max(1, tEnd - cut)));
      // Judged as of that moment: a run that is two days and 20 hours old at breakfast is three days old at supper.
      const ok = habits
        .filter((t) => !(i === 0 && dayState(t, date, state.dayLog) === "slipped"))
        .map((task) => ({ task, day: cleanDays(task, state.urgeLog, at.getTime()) }))
        .filter((c) => c.day >= PEP_MIN_DAYS);
      const written = i === 0 && (state.pepNotes || []).some((n) => n.date === date);
      if (ok.length && !written && at.getTime() > now) {
        const c = ok.find((x) => x.task.id === pin?.id) || ok.reduce((a2, x) => (x.day > a2.day ? x : a2));
        items.push({
          id: `pep:${date}:write`, at: at.getTime(), kind: "write", taskId: c.task.id,
          title: `Day ${c.day} clean · ${c.task.text}`, body: line,
        });
      }
    }
  }
  return items.sort((a, b) => a.at - b.at);
}

// ---- The widget ----

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The lines the widget turns through: your own notes for the habits it shows, newest few, in an order
 * that is different each day, with the reason you wrote when calm among them. Empty until there is one.
 */
export function widgetNotes(state, now = Date.now(), { habits = 2, max = 6 } = {}) {
  const shown = quits(state.tasks).slice(0, habits);
  const ids = new Set(shown.map((t) => t.id));
  const lines = (state.pepNotes || []).filter((n) => ids.has(n.taskId)).sort((a, b) => b.at - a.at).slice(0, max).map((n) => n.text);
  shown.forEach((t) => { const why = (t.calmNote?.why || "").trim(); if (why) lines.push(why); });
  const rand = seeded(`widget:${dstr(new Date(now))}`);
  const mixed = [...new Set(lines)].map((text) => ({ text, k: rand() })).sort((a, b) => a.k - b.k).slice(0, max);
  return mixed.map((x) => clip(x.text.replace(/\s+/g, " "), 110));
}
