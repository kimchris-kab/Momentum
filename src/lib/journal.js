import { JOURNAL_MOODS, PILLARS, P_BY_ID } from "../data/constants.js";
import { addDays, longDate, monthKeyOf, monthLabel, parseD, todayStr } from "./date.js";

export const wordCount = (text) => (text || "").trim().split(/\s+/).filter(Boolean).length;

export const entryText = (e) =>
  e.kind === "gratitude" ? (e.items || []).filter(Boolean).join("\n") : (e.text || "");

// A day counts as written if you journalled OR left a reflection in your check-in — both
// are writing, and penalising one for using the other would be pointless bookkeeping.
export function writingStreak(entries, checkins) {
  const written = new Set([
    ...entries.map((e) => e.date),
    ...checkins.filter((c) => (c.note || "").trim()).map((c) => c.date),
  ]);
  let cursor = todayStr();
  if (!written.has(cursor)) cursor = addDays(cursor, -1);
  let n = 0;
  for (let i = 0; i < 400 && written.has(cursor); i++) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

export function journalStats(entries, checkins) {
  const words = entries.reduce((a, e) => a + wordCount(entryText(e)), 0);
  const thisMonth = entries.filter((e) => monthKeyOf(e.date) === monthKeyOf(todayStr())).length;
  const longest = entries.reduce(
    (best, e) => (wordCount(entryText(e)) > wordCount(entryText(best || { text: "" })) ? e : best), null);
  const daysWritten = new Set(entries.map((e) => e.date)).size;
  return {
    total: entries.length,
    words,
    thisMonth,
    daysWritten,
    avgWords: entries.length ? Math.round(words / entries.length) : 0,
    longest,
    streak: writingStreak(entries, checkins),
    favourites: entries.filter((e) => e.favorite).length,
  };
}

export function filterEntries(entries, { query = "", mood = null, pillarId = null, favouritesOnly = false }) {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (favouritesOnly && !e.favorite) return false;
    if (mood && !(e.moods || []).includes(mood)) return false;
    if (pillarId && e.pillarId !== pillarId) return false;
    if (!q) return true;
    return entryText(e).toLowerCase().includes(q) || (e.prompt || "").toLowerCase().includes(q);
  });
}

export function groupByMonth(days) {
  const map = {};
  days.forEach((d) => { (map[monthKeyOf(d.date)] = map[monthKeyOf(d.date)] || []).push(d); });
  return Object.entries(map)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([mKey, items]) => {
      const [y, m] = mKey.split("-").map(Number);
      return {
        mKey,
        label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        items,
        entryCount: items.reduce((a, d) => a + d.entries.length, 0),
      };
    });
}

// Entries written on this exact date in the past — the cheapest reflection feature there is,
// and the main reason keeping a journal pays off later rather than at the time.
export function onThisDay(entries, today = todayStr()) {
  const marks = [
    { label: "A month ago", date: shiftMonths(today, -1) },
    { label: "Three months ago", date: shiftMonths(today, -3) },
    { label: "Six months ago", date: shiftMonths(today, -6) },
    { label: "A year ago", date: shiftMonths(today, -12) },
  ];
  return marks
    .map((m) => ({ ...m, entry: entries.find((e) => e.date === m.date) }))
    .filter((m) => m.entry);
}

function shiftMonths(dateStr, months) {
  const d = parseD(dateStr);
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;
}

export function toMarkdown(entries, checkins) {
  const byDate = {};
  entries.forEach((e) => { (byDate[e.date] = byDate[e.date] || { entries: [] }).entries.push(e); });
  checkins.forEach((c) => {
    byDate[c.date] = byDate[c.date] || { entries: [] };
    byDate[c.date].checkin = c;
  });

  const lines = ["# Journal", ""];
  Object.keys(byDate).sort((a, b) => b.localeCompare(a)).forEach((date) => {
    const day = byDate[date];
    lines.push(`## ${longDate(date)}`, "");
    if (day.checkin?.note) lines.push(`> From check-in: ${day.checkin.note}`, "");
    if (day.checkin?.deed) lines.push(`> Good deed: ${day.checkin.deed}`, "");
    day.entries
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
      .forEach((e) => {
        const meta = [];
        if (e.favorite) meta.push("starred");
        if (e.pillarId) meta.push(P_BY_ID[e.pillarId]?.name);
        (e.moods || []).forEach((m) => meta.push(JOURNAL_MOODS.find((x) => x.id === m)?.label));
        if (e.prompt) lines.push(`**${e.prompt}**`, "");
        if (e.kind === "gratitude") {
          lines.push("Grateful for:", "");
          (e.items || []).filter(Boolean).forEach((i) => lines.push(`- ${i}`));
        } else {
          lines.push(e.text || "");
        }
        if (meta.filter(Boolean).length) lines.push("", `*${meta.filter(Boolean).join(" · ")}*`);
        lines.push("");
      });
  });
  return lines.join("\n");
}

export function downloadText(filename, text, mime = "text/markdown;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
