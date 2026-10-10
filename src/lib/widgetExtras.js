import { addDays } from "./date.js";
import { dayStats } from "./tasks.js";
import { TX_CAT_BY_ID } from "../data/constants.js";
import { SCORE_WORDS, activeVirtue, entryFor, practiceFor, virtueSettings } from "./virtue.js";
import { shadeZoneEnds } from "./redzone.js";

// What the home-screen widget shows beyond the day's list: how the week went, what you usually spend on, today's virtue.
// Kept apart from widget.js because the app only loads it when there is a snapshot to write, which keeps the first paint light.

/** One dot per day for the seven days ending today: -1 nothing planned, then 0 none done, 1 under half, 2 over half, 3 all. */
export function weekDots(state, today) {
  return Array.from({ length: 7 }, (_, i) => {
    const s = dayStats(state.tasks || [], addDays(today, i - 6), state.dayLog || {});
    if (!s.total) return -1;
    if (s.done === 0) return 0;
    if (s.done === s.total) return 3;
    return s.done / s.total >= 0.5 ? 2 : 1;
  });
}

export const amountLabel = (n) => String(+Number(n).toFixed(2));

const CHIP_DAYS = 60;
const MAX_CHIPS = 3;

/**
 * What was spent today, and up to three payments made again and again (the same payee for the same amount, at least twice in
 * two months) so that one tap on the widget can log the next one.
 */
export function spendGlance(state, today) {
  const tx = (state.transactions || []).filter((t) => t.type === "expense" && Number(t.amount) > 0);
  const spentToday = tx.filter((t) => t.date === today).reduce((a, t) => a + Number(t.amount), 0);
  const since = addDays(today, -CHIP_DAYS);
  const groups = new Map();
  tx.filter((t) => t.date >= since && t.date <= today).forEach((t) => {
    const who = String(t.payee || "").trim();
    const name = who || TX_CAT_BY_ID[t.catId]?.label || "";
    if (!name || !t.catId) return;
    const key = `${name.toLowerCase()}|${amountLabel(t.amount)}`;
    const g = groups.get(key) || { name, amount: Number(t.amount), catId: t.catId, payee: who, count: 0, last: "" };
    g.count += 1;
    if (t.date >= g.last) { g.last = t.date; g.catId = t.catId; }
    groups.set(key, g);
  });
  const chips = [...groups.values()].filter((g) => g.count >= 2)
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .slice(0, MAX_CHIPS)
    .map((g) => ({
      label: `${g.name.length > 14 ? `${g.name.slice(0, 13)}…` : g.name} ${amountLabel(g.amount)}`,
      amount: g.amount, catId: g.catId, payee: g.payee,
    }));
  if (!chips.length && !spentToday) return null;
  return { today: Math.round(spentToday * 100) / 100, chips };
}

const minutesOf = (hhmm) => { const [h, m] = String(hhmm || "").split(":").map(Number); return h * 60 + (m || 0); };

/**
 * Today's virtue as one line, and whether the evening question is open: from two hours before the evening time until it is answered.
 * Null when there is no virtue being worked on, or the person has turned the practice off.
 */
export function virtueGlance(state, today) {
  const cfg = virtueSettings(state.settings);
  const v = activeVirtue(state);
  if (!v || !cfg.on) return null;
  const entry = entryFor(state, v.id, today);
  const practice = practiceFor(v, today) || "";
  const line = entry ? `${v.name} · ${SCORE_WORDS[entry.score]} today` : `${v.name} · ${practice}`;
  return {
    name: v.name,
    line: line.length > 96 ? `${line.slice(0, 95)}…` : line,
    ask: !entry,
    askFromMin: Math.max(0, minutesOf(cfg.evening) - 120),
  };
}

/** Everything the snapshot takes from this file, worked out once per write. */
export function widgetExtras(state, today, now = Date.now()) {
  return {
    week: weekDots(state, today),
    spend: spendGlance(state, today),
    virtue: virtueGlance(state, today),
    zoneEndsOf: (task) => shadeZoneEnds(state, task, now),
  };
}
