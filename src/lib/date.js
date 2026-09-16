import { WK_ORDER } from "../data/constants.js";

export const pad = (n) => String(n).padStart(2, "0");
export const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => dstr(new Date());
export const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); };
export const daysBetween = (a, b) => Math.round((parseD(b) - parseD(a)) / 86400000);

export const prettyDate = (s) => parseD(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const longDate = (s) => parseD(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
export const weekdayKey = (s) => WK_ORDER[parseD(s).getDay()];
export const monthKeyOf = (s) => s.slice(0, 7);
export const monthLabel = (mKey) => {
  const [y, m] = mKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" });
};

export const money = (n) => (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
// Keeps cents when there are any — for entry fields and running totals, where rounding
// a 12.40 down to 12 while the person is still typing reads as a bug.
export const moneyPrecise = (n) => (n || 0).toLocaleString(undefined, {
  minimumFractionDigits: Number.isInteger(n || 0) ? 0 : 2,
  maximumFractionDigits: 2,
});
export const hashIdx = (s, len) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % len;
};

export const formatTime12 = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)} ${period}`;
};

export const relativeDateLabel = (dateStr) => {
  if (!dateStr) return null;
  const today = todayStr();
  if (dateStr === today) return "Today";
  if (dateStr === addDays(today, 1)) return "Tomorrow";
  if (dateStr === addDays(today, -1)) return "Yesterday";
  const diff = daysBetween(today, dateStr);
  if (diff > 1 && diff < 7) return parseD(dateStr).toLocaleDateString(undefined, { weekday: "long" });
  return prettyDate(dateStr);
};

// Past a task's time-of-day, on the day it was due
export const isPastTime = (time, dateStr) => {
  if (!time || dateStr !== todayStr()) return false;
  const [h, m] = time.split(":").map(Number);
  const deadline = new Date();
  deadline.setHours(h, m, 0, 0);
  return new Date() > deadline;
};
