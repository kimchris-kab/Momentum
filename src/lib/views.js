import { addDays, todayStr } from "./date.js";
import { occursOn, searchTasks } from "./tasks.js";

// Retrieval, phone-shaped. Todoist's answer is a query language — "today & @deep_work" —
// which is excellent on a keyboard and unusable with a thumb. The same expressiveness that
// actually gets used lives in a handful of chips, and a chip set is already serialisable, so
// saving a view is just storing the chips rather than parsing anything.

export const EMPTY_FILTERS = {
  listId: "all",
  query: "",
  starred: false,
  overdue: false,
  priority: null,   // "high" | "med" | "low"
  pillarId: null,
  due: null,        // "today" | "week" | "none"
};

export const normalizeFilters = (f) => ({ ...EMPTY_FILTERS, ...(f || {}) });

// The list scope and the search box are always-on controls, not filters someone switched on,
// so they don't count toward "you have filters active".
export function activeCount(filters) {
  const f = normalizeFilters(filters);
  let n = 0;
  if (f.starred) n++;
  if (f.overdue) n++;
  if (f.priority) n++;
  if (f.pillarId) n++;
  if (f.due) n++;
  return n;
}
export const isFiltered = (filters) => activeCount(filters) > 0;

export function applyFilters(tasks, filters, today = todayStr()) {
  const f = normalizeFilters(filters);
  const weekEnd = addDays(today, 7);

  let out = tasks;
  if (f.listId && f.listId !== "all") out = out.filter((t) => t.listId === f.listId);
  if (f.starred) out = out.filter((t) => t.starred);
  if (f.priority) out = out.filter((t) => (t.priority || "med") === f.priority);
  if (f.pillarId) out = out.filter((t) => t.pillarId === f.pillarId);

  if (f.overdue) {
    out = out.filter((t) => !t.done && !t.recurrence && t.dueDate && t.dueDate < today);
  }

  if (f.due === "today") {
    // A repeating task has no due date, so "today" has to mean "lands on today" for it.
    out = out.filter((t) => (t.recurrence ? occursOn(t, today) : t.dueDate === today));
  } else if (f.due === "week") {
    out = out.filter((t) => (t.recurrence
      ? true
      : t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd));
  } else if (f.due === "none") {
    out = out.filter((t) => !t.recurrence && !t.dueDate);
  }

  return searchTasks(out, f.query || "");
}

// A short human label for the chip row and for the default name when saving a view.
export function describeFilters(filters, { lists = [], pillars = [] } = {}) {
  const f = normalizeFilters(filters);
  const bits = [];
  if (f.listId && f.listId !== "all") {
    bits.push(lists.find((l) => l.id === f.listId)?.name || "List");
  }
  if (f.starred) bits.push("Starred");
  if (f.overdue) bits.push("Overdue");
  if (f.priority) bits.push(`${f.priority === "med" ? "Medium" : f.priority[0].toUpperCase() + f.priority.slice(1)} priority`);
  if (f.pillarId) bits.push(pillars.find((p) => p.id === f.pillarId)?.name || "Pillar");
  if (f.due === "today") bits.push("Today");
  if (f.due === "week") bits.push("This week");
  if (f.due === "none") bits.push("No date");
  if (f.query) bits.push(`“${f.query}”`);
  return bits.join(" · ") || "All tasks";
}

export const newView = (filters, name) => ({
  id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: (name || "").trim(),
  filters: normalizeFilters(filters),
  createdAt: Date.now(),
});

// Two views holding the same chips are the same view, whatever they're called.
export function sameFilters(a, b) {
  const x = normalizeFilters(a);
  const y = normalizeFilters(b);
  return ["listId", "query", "starred", "overdue", "priority", "pillarId", "due"]
    .every((k) => (x[k] ?? null) === (y[k] ?? null));
}
