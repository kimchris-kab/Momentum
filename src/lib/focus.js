import { addDays, dstr, todayStr } from "./date.js";

// A focus session is a record of time actually spent, not time intended. It is written when
// a timer stops, so the number in Insights is evidence rather than a plan.
//
// Sessions shorter than this are almost always a sheet opened and closed again, and logging
// them would bury real work under noise.
export const MIN_LOGGED_SECONDS = 30;

export const newSession = ({ task, seconds, planned = null, completed = false, at = Date.now() }) => ({
  id: `f-${at}-${Math.random().toString(36).slice(2, 7)}`,
  taskId: task?.id || null,
  taskText: task?.text || "Focus",
  pillarId: task?.pillarId || null,
  kind: task?.kind || "todo",
  date: dstr(new Date(at)),
  seconds: Math.round(seconds),
  planned,
  completed,
  endedAt: at,
});

export const shouldLog = (seconds) => Math.round(seconds) >= MIN_LOGGED_SECONDS;

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s}s`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;

const inRange = (d, from, to) => d >= from && d <= to;

export function focusTotals(sessions, from, to) {
  const rows = (sessions || []).filter((s) => inRange(s.date, from, to));
  const seconds = rows.reduce((a, s) => a + s.seconds, 0);
  const byPillar = {};
  const byTask = {};
  rows.forEach((s) => {
    if (s.pillarId) byPillar[s.pillarId] = (byPillar[s.pillarId] || 0) + s.seconds;
    const key = s.taskId || s.taskText;
    byTask[key] = byTask[key] || { text: s.taskText, pillarId: s.pillarId, seconds: 0, count: 0 };
    byTask[key].seconds += s.seconds;
    byTask[key].count++;
  });
  return {
    seconds,
    count: rows.length,
    byPillar,
    topTasks: Object.values(byTask).sort((a, b) => b.seconds - a.seconds),
  };
}

// Seconds per day across a window, for a small bar strip.
export function focusByDay(sessions, from, to) {
  const out = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to && guard < 400) {
    guard++;
    const seconds = (sessions || [])
      .filter((s) => s.date === cursor)
      .reduce((a, s) => a + s.seconds, 0);
    out.push({ date: cursor, seconds });
    cursor = addDays(cursor, 1);
  }
  return out;
}

export const focusToday = (sessions, date = todayStr()) =>
  (sessions || []).filter((s) => s.date === date).reduce((a, s) => a + s.seconds, 0);
