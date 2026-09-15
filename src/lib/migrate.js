import { newTask, weeklyRule, DEFAULT_LISTS } from "./tasks.js";

export const SCHEMA_VERSION = 2;

export const emptyState = () => ({
  version: SCHEMA_VERSION,
  lists: DEFAULT_LISTS,
  tasks: [],
  dayLog: {},
  checkins: [],
  goals: [],
  strategies: [],
  identities: {},
  habitAudit: [],
  journalEntries: [],
  moneyPrinciples: {},
  moneyIdeas: {},
  netWorth: { assets: "", liabilities: "" },
  netWorthLog: [],
  transactions: [],
  recurring: [],
  monthlyIncome: "",
  budgetSplit: { needs: 50, wants: 30, savings: 20 },
  mantraIdxByDate: {},
  journalDraft: null,
  weekPlans: {},
  dayFocus: {},
  freezes: {},
  milestones: [],
  reviews: [],
  settings: { sortMode: "manual", showCompleted: false, reminders: true },
});

// v1 kept habits as per-weekday template rows (routines / breakRoutines) plus a per-day copy of
// them in dayPlans / breakPlans, and ad-hoc tasks either nested in dayPlans or in customTasks.
// v2 has one task list with recurrence rules and a single completion log, so each v1 habit that
// repeated on several weekdays collapses into ONE task repeating on those weekdays.
function migrateV1(d) {
  const state = { ...emptyState() };

  state.checkins = d.checkins || [];
  state.goals = (d.goals || []).map((g) => ({
    notes: "", subtasks: [], starred: false, why: "", targetDate: null, ...g,
  }));
  state.strategies = (d.strategies || []).map((s) => ({ notes: "", subtasks: [], starred: false, targetDate: null, ...s }));
  state.identities = d.identities || {};
  state.habitAudit = d.habitAudit || [];
  state.journalEntries = (d.journalEntries || []).map((e) => ({
    moods: [], kind: "free", items: [], prompt: null, pillarId: null, favorite: false, ...e,
  }));
  state.moneyPrinciples = d.moneyPrinciples || {};
  state.moneyIdeas = d.moneyIdeas || {};
  state.netWorth = d.netWorth || { assets: "", liabilities: "" };
  state.netWorthLog = d.netWorthLog || [];
  // v1 transactions carried only a budget bucket in `category`; keep it and let the finer
  // `catId` stay empty until the entry is edited, so old records still total correctly.
  state.transactions = d.transactions || [];
  state.recurring = d.recurring || [];
  state.monthlyIncome = d.monthlyIncome || "";
  state.budgetSplit = d.budgetSplit || { needs: 50, wants: 30, savings: 20 };

  const tasks = [];
  const dayLog = {};
  // old routine-row id -> new task id, so the per-day completion copies can be replayed
  const routineIdToTask = {};
  let orderSeed = 0;

  const collapseTemplate = (template, kind) => {
    const byText = new Map();
    Object.entries(template || {}).forEach(([wk, rows]) => {
      (rows || []).forEach((rt) => {
        const key = (rt.text || "").trim().toLowerCase();
        if (!key) return;
        let task = byText.get(key);
        if (!task) {
          task = newTask({
            id: `t-${kind}-${rt.id}`,
            kind,
            text: rt.text,
            priority: rt.priority || "high",
            time: rt.time || null,
            pillarId: rt.pillarId || null,
            location: rt.location || null,
            stackAfter: rt.stackAfter || null,
            bundle: rt.bundle || null,
            twoMin: rt.twoMin || null,
            trigger: rt.trigger || null,
            recurrence: weeklyRule([]),
            order: orderSeed++,
            createdAt: typeof rt.id === "number" ? rt.id : Date.now(),
            startDate: "1970-01-01",
          });
          byText.set(key, task);
          tasks.push(task);
        }
        if (!task.recurrence.weekdays.includes(wk)) task.recurrence.weekdays.push(wk);
        routineIdToTask[rt.id] = task.id;
      });
    });
  };

  collapseTemplate(d.routines, "build");
  collapseTemplate(d.breakRoutines, "break");

  const replayCompletions = (plans) => {
    Object.entries(plans || {}).forEach(([date, plan]) => {
      (plan.tasks || []).forEach((t) => {
        if (!t.done) return;
        const taskId = routineIdToTask[t.routineId];
        if (!taskId) return;
        dayLog[date] = dayLog[date] || {};
        dayLog[date][taskId] = { done: true, doneAt: null };
      });
    });
  };
  replayCompletions(d.dayPlans);
  replayCompletions(d.breakPlans);

  // Ad-hoc tasks: the newer top-level list, plus anything still nested in old day plans
  const seen = new Set();
  (d.customTasks || []).forEach((t) => {
    seen.add(t.id);
    tasks.push(newTask({
      ...t,
      kind: "todo",
      listId: "inbox",
      notes: t.notes || "",
      subtasks: t.subtasks || [],
      starred: !!t.starred,
      recurrence: null,
      order: orderSeed++,
      createdAt: t.createdAt || Date.now(),
    }));
  });
  Object.entries(d.dayPlans || {}).forEach(([date, plan]) => {
    (plan.tasks || []).forEach((t) => {
      if (t.source !== "custom" || seen.has(t.id)) return;
      seen.add(t.id);
      tasks.push(newTask({
        id: t.id,
        kind: "todo",
        text: t.text,
        done: !!t.done,
        doneAt: t.done ? Date.now() : null,
        dueDate: date,
        priority: t.priority || "med",
        order: orderSeed++,
      }));
    });
  });

  Object.entries(d.dayPlans || {}).forEach(([date, plan]) => {
    if (typeof plan.mantraIdx === "number") state.mantraIdxByDate[date] = plan.mantraIdx;
  });

  state.tasks = tasks;
  state.dayLog = dayLog;
  return state;
}

export function loadState(raw) {
  if (!raw) return emptyState();
  let d;
  try { d = JSON.parse(raw); } catch { return emptyState(); }
  if (!d || typeof d !== "object") return emptyState();
  if (d.version === SCHEMA_VERSION) {
    const base = emptyState();
    return {
      ...base,
      ...d,
      lists: d.lists?.length ? d.lists : base.lists,
      settings: { ...base.settings, ...(d.settings || {}) },
      netWorth: { ...base.netWorth, ...(d.netWorth || {}) },
      budgetSplit: { ...base.budgetSplit, ...(d.budgetSplit || {}) },
    };
  }
  return migrateV1(d);
}

export const serializeState = (state) => JSON.stringify({ ...state, version: SCHEMA_VERSION });
