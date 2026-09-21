import { formatTime12, pad, todayStr } from "./date.js";
import { isDone } from "./tasks.js";

// Time-blocking, phone-shaped. A drag-and-drop hour grid is a desktop interaction; at 390px
// it's a fight. What actually carries the value of one is seeing the day's shape — what's
// pinned to a time, in what order, and where the real gaps are — so this builds an ordered
// list of blocks, gaps and a now-marker instead of an absolutely-positioned canvas.

// A task with no timer set still occupies real time. Half an hour is the honest default:
// long enough that a day of them reads as full, short enough not to invent a crisis.
export const DEFAULT_BLOCK_MIN = 30;
// Anything shorter isn't a usable gap, it's just changeover.
export const MIN_GAP_MIN = 20;

export const minutesOf = (time) => {
  if (!time) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export const timeOf = (minutes) => `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`;
export const taskDuration = (task) => Math.max(5, task.timerMinutes || DEFAULT_BLOCK_MIN);

export const nowMinutes = (d = new Date()) => d.getHours() * 60 + d.getMinutes();

export const fmtGap = (mins) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m} min free`;
  return m ? `${h}h ${m}m free` : `${h}h free`;
};

/**
 * Ordered timeline for one day.
 * @returns { items, scheduled, unscheduled, busyMinutes, freeMinutes, firstStart, lastEnd }
 *   items: [{ kind: "task" | "gap" | "now", ... }]
 */
export function buildTimeline(tasks, dateStr, dayLog, now = null) {
  const onDay = tasks.filter((t) => !t.archivedAt);
  const timed = onDay
    .filter((t) => t.time)
    .map((t) => {
      const start = minutesOf(t.time);
      const duration = taskDuration(t);
      return { task: t, start, end: start + duration, duration, done: isDone(t, dateStr, dayLog) };
    })
    .sort((a, b) => a.start - b.start || a.duration - b.duration);

  const unscheduled = onDay.filter((t) => !t.time);

  const items = [];
  let busyMinutes = 0;
  let freeMinutes = 0;

  // Measured against the furthest any earlier block reaches, not against the one immediately
  // before. Sorting by start time doesn't sort by end time: a short block nested inside a long
  // one leaves the long one still running, and comparing against the short one invented free
  // time in the middle of it — "1h free" printed over the top of a three-hour block.
  let reach = null;
  timed.forEach((block) => {
    if (reach !== null) {
      const gap = block.start - reach;
      if (gap >= MIN_GAP_MIN) {
        items.push({ kind: "gap", start: reach, end: block.start, minutes: gap });
        freeMinutes += gap;
      }
    }
    // Two things pinned to overlapping times is a planning error worth showing, not hiding.
    const overlap = reach !== null && block.start < reach;
    items.push({ kind: "task", ...block, overlap });
    busyMinutes += block.duration;
    reach = reach === null ? block.end : Math.max(reach, block.end);
  });

  // The now-marker only belongs on the day you're actually living.
  let freeAhead = 0;
  if (dateStr === todayStr() && timed.length) {
    const nm = now ?? nowMinutes();
    // Insert before the first thing that hasn't finished yet. Two cases need care: if now
    // falls inside a gap, the elapsed part of that gap is not free time any more — show only
    // what's left, or "5h free" sits above a marker saying it's already 4pm. And if now falls
    // inside a task, that task is in progress, so the marker goes after it.
    let at = items.length;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.end <= nm) continue;
      if (it.kind === "gap" && nm > it.start) {
        items[i] = { ...it, start: nm, minutes: it.end - nm };
        at = i;
      } else if (it.kind === "task" && nm >= it.start) {
        at = i + 1;
      } else {
        at = i;
      }
      break;
    }
    items.splice(at, 0, { kind: "now", start: nm, end: nm });
    freeAhead = items
      .filter((it) => it.kind === "gap" && it.start >= nm)
      .reduce((a, it) => a + it.minutes, 0);
  }

  return {
    items,
    scheduled: timed,
    unscheduled,
    busyMinutes,
    freeMinutes,
    freeAhead,
    firstStart: timed.length ? timed[0].start : null,
    lastEnd: timed.length ? Math.max(...timed.map((b) => b.end)) : null,
  };
}

/**
 * Where a task of `duration` could go today without colliding with anything already pinned.
 * Only forward-looking slots on the current day — offering a 9am slot at 4pm is noise.
 */
export function suggestSlots(tasks, dateStr, duration = DEFAULT_BLOCK_MIN, now = null, limit = 3) {
  const { scheduled } = buildTimeline(tasks, dateStr, {}, now);
  const isToday = dateStr === todayStr();
  const nm = now ?? nowMinutes();
  // Round the starting point up to the next quarter hour so suggestions read as times a
  // person would actually pick.
  const earliest = isToday ? Math.ceil(Math.max(nm + 5, 6 * 60) / 15) * 15 : 8 * 60;
  const latest = 22 * 60;

  const out = [];
  let cursor = earliest;
  const blocks = [...scheduled].sort((a, b) => a.start - b.start);

  for (const b of blocks) {
    // The evening ceiling applies to slots found between bookings too, not only to the open
    // end of the day. Without it, one thing pinned late at night was enough to make the same
    // request that is refused on an empty evening come back with a slot finishing at 22:45.
    if (cursor + duration <= Math.min(b.start, latest)) {
      out.push({ start: cursor, time: timeOf(cursor), label: formatTime12(timeOf(cursor)) });
      if (out.length >= limit) return out;
    }
    cursor = Math.max(cursor, b.end);
    cursor = Math.ceil(cursor / 15) * 15;
  }
  while (out.length < limit && cursor + duration <= latest) {
    out.push({ start: cursor, time: timeOf(cursor), label: formatTime12(timeOf(cursor)) });
    cursor += Math.max(60, Math.ceil(duration / 15) * 15);
  }
  return out;
}
