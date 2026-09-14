import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Compass, ListTodo, Plus, TrendingUp, Wallet } from "lucide-react";
import { C, MOTION_CSS, styles } from "./theme.js";
import { MANTRAS, PILLARS } from "./data/constants.js";
import { addDays, dstr, hashIdx, todayStr } from "./lib/date.js";
import {
  computeStreak, heatmapDays, newTask, reorderTasks, toggleDoneReducer, voteTally,
} from "./lib/tasks.js";
import { emptyState, loadState, serializeState } from "./lib/migrate.js";
import { postDueRecurring } from "./lib/money.js";
import { AmbientOrbs, SparkleField, Toast, useToast } from "./components/ui.jsx";
import TaskSheet from "./components/TaskSheet.jsx";
import TodayView from "./views/TodayView.jsx";
import TasksView from "./views/TasksView.jsx";
import HabitsView from "./views/HabitsView.jsx";
import IdentityView from "./views/IdentityView.jsx";
import CheckinView from "./views/CheckinView.jsx";
import JournalView from "./views/JournalView.jsx";
import MoneyView from "./views/MoneyView.jsx";
import InsightsView from "./views/InsightsView.jsx";

const NAV = [
  { id: "today", label: "Today", Icon: Compass },
  { id: "tasks", label: "Tasks", Icon: ListTodo },
  { id: "journal", label: "Journal", Icon: BookOpen },
  { id: "money", label: "Money", Icon: Wallet },
  { id: "insights", label: "Insights", Icon: TrendingUp },
];
const FAB_VIEWS = ["today", "tasks"];

export default function Momentum() {
  const [view, setView] = useState("today");
  const [state, setState] = useState(emptyState);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(null);
  const { toast, show, dismiss, act } = useToast();

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;650&display=swap";
    document.head.appendChild(l);
  }, []);

  useEffect(() => {
    if (document.getElementById("mtm-motion-style")) return;
    const style = document.createElement("style");
    style.id = "mtm-motion-style";
    style.textContent = MOTION_CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("momentum:data");
        setState(loadState(r?.value));
      } catch { /* first run */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try { await window.storage.set("momentum:data", serializeState(state), false); }
      catch (e) { console.error("Could not save", e); }
    })();
  }, [state, loaded]);

  // Rent, salary and subscriptions post themselves for every occurrence that came due
  // while the app was closed, so the ledger is complete without anyone remembering.
  useEffect(() => {
    if (!loaded) return;
    setState((s) => {
      const posted = postDueRecurring(s.recurring, s.transactions);
      if (!posted) return s;
      return { ...s, recurring: posted.recurring, transactions: posted.transactions };
    });
  }, [loaded]);

  const patch = useCallback((p) => setState((s) => ({ ...s, ...p })), []);

  // ---- Task actions ----
  const addTask = useCallback((patchObj) => {
    const task = newTask({ ...patchObj, order: Date.now() });
    setState((s) => ({ ...s, tasks: [...s.tasks, task] }));
    return task;
  }, []);

  const updateTask = useCallback((id, p) => setState((s) => ({
    ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...p } : t)),
  })), []);

  const removeTask = useCallback((id) => {
    setState((s) => {
      const victim = s.tasks.find((t) => t.id === id);
      if (victim) {
        show("Task deleted", "Undo", () =>
          setState((cur) => ({ ...cur, tasks: [...cur.tasks, victim] })));
      }
      return { ...s, tasks: s.tasks.filter((t) => t.id !== id) };
    });
  }, [show]);

  const toggleTask = useCallback((task, date = todayStr()) => setState((s) => {
    const next = toggleDoneReducer(task, date, s.tasks, s.dayLog);
    return { ...s, tasks: next.tasks, dayLog: next.dayLog };
  }), []);

  const toggleStar = useCallback((task) =>
    updateTask(task.id, { starred: !task.starred }), [updateTask]);

  const moveTask = useCallback((id, siblings, dir) => setState((s) => ({
    ...s, tasks: reorderTasks(s.tasks, id, siblings, dir),
  })), []);

  // ---- Money records ----
  const saveTx = useCallback((tx) => setState((s) => {
    if (!tx.id) return { ...s, transactions: [...s.transactions, { ...tx, id: Date.now(), createdAt: Date.now() }] };
    return { ...s, transactions: s.transactions.map((t) => (t.id === tx.id ? { ...t, ...tx } : t)) };
  }), []);

  const deleteTx = useCallback((id) => setState((s) => {
    const victim = s.transactions.find((t) => t.id === id);
    if (victim) {
      show("Entry deleted", "Undo", () =>
        setState((cur) => ({ ...cur, transactions: [...cur.transactions, victim] })));
    }
    return { ...s, transactions: s.transactions.filter((t) => t.id !== id) };
  }), [show]);

  const saveRule = useCallback((rule) => setState((s) => {
    if (!rule.id) {
      const created = { ...rule, id: Date.now(), createdAt: Date.now() };
      const posted = postDueRecurring([created], s.transactions);
      return posted
        ? { ...s, recurring: [...s.recurring, ...posted.recurring], transactions: posted.transactions }
        : { ...s, recurring: [...s.recurring, created] };
    }
    return { ...s, recurring: s.recurring.map((r) => (r.id === rule.id ? { ...r, ...rule } : r)) };
  }), []);

  const deleteRule = useCallback((id) => setState((s) => ({
    ...s, recurring: s.recurring.filter((r) => r.id !== id),
  })), []);

  // Snapshots are keyed by day, so saving twice in one day corrects rather than duplicates
  const saveNetWorthSnapshot = useCallback(() => setState((s) => {
    const entry = {
      id: Date.now(),
      date: todayStr(),
      assets: parseFloat(s.netWorth.assets) || 0,
      liabilities: parseFloat(s.netWorth.liabilities) || 0,
    };
    const rest = (s.netWorthLog || []).filter((e) => e.date !== entry.date);
    show("Net worth snapshot saved");
    return { ...s, netWorthLog: [...rest, entry] };
  }), [show]);

  // ---- Lists ----
  const addList = useCallback((name, color) => setState((s) => ({
    ...s,
    lists: [...s.lists, { id: `l-${Date.now()}`, name, color, order: s.lists.length, createdAt: Date.now() }],
  })), []);
  const renameList = useCallback((id, name) => setState((s) => ({
    ...s, lists: s.lists.map((l) => (l.id === id ? { ...l, name } : l)),
  })), []);
  const deleteList = useCallback((id) => setState((s) => ({
    ...s,
    lists: s.lists.filter((l) => l.id !== id),
    tasks: s.tasks.map((t) => (t.listId === id ? { ...t, listId: "inbox" } : t)),
  })), []);

  // ---- Derived ----
  const averages = useMemo(() => {
    const recent = [...state.checkins].sort((a, b) => a.date.localeCompare(b.date)).slice(-7);
    const out = {};
    PILLARS.forEach((p) => {
      const vals = recent.map((c) => c.scores[p.id]).filter((v) => typeof v === "number");
      out[p.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return out;
  }, [state.checkins]);

  const overall = useMemo(() => {
    const vals = PILLARS.map((p) => averages[p.id]).filter((v) => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [averages]);

  const streak = useMemo(() => computeStreak(state.tasks, state.dayLog, "build"), [state.tasks, state.dayLog]);
  const breakStreak = useMemo(() => computeStreak(state.tasks, state.dayLog, "break"), [state.tasks, state.dayLog]);
  const tally = useMemo(() => voteTally(state.tasks, state.dayLog), [state.tasks, state.dayLog]);
  const heatmap = useMemo(() => heatmapDays(state.tasks, state.dayLog), [state.tasks, state.dayLog]);

  const yesterdayMissed = useMemo(() => {
    const y = addDays(todayStr(), -1);
    const scheduled = state.tasks.filter((t) => t.kind === "build");
    if (!scheduled.length) return false;
    const stats = heatmap.find((d) => d.date === y);
    return stats && stats.ratio !== null && stats.ratio < 1;
  }, [heatmap, state.tasks]);

  const needsRest = useMemo(() => {
    const last3 = [...state.checkins].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    return last3.length === 3 && last3.every((c) => (c.recharge ?? 3) <= 2);
  }, [state.checkins]);

  const editingTask = editing ? state.tasks.find((t) => t.id === editing) : null;

  const saveCheckin = (entry) => {
    setState((s) => ({ ...s, checkins: [...s.checkins.filter((c) => c.date !== entry.date), entry] }));
    setView("today");
  };

  const rerollMantra = () => setState((s) => ({
    ...s,
    mantraIdxByDate: { ...s.mantraIdxByDate, [todayStr()]: hashIdx(todayStr() + Date.now(), MANTRAS.length) },
  }));

  const quickAdd = () => {
    const task = addTask({ text: "", kind: "todo", dueDate: todayStr(), listId: "inbox" });
    setEditing(task.id);
  };

  if (!loaded) {
    return (
      <div style={{ ...styles.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: C.muted }}>Loading your map…</span>
      </div>
    );
  }

  const isSubView = ["checkin", "habits", "identity"].includes(view);

  return (
    <div style={styles.app}>
      <div style={styles.phone}>
        <AmbientOrbs />
        <SparkleField />

        <div style={styles.scroll}>
          <div key={view} className="mtm-view-flip">
            {view === "today" && (
              <TodayView
                state={state} averages={averages} overall={overall} streak={streak} breakStreak={breakStreak}
                tally={tally} heatmap={heatmap} yesterdayMissed={yesterdayMissed} needsRest={needsRest}
                onToggleTask={toggleTask} onOpenTask={(t) => setEditing(t.id)} onToggleStar={toggleStar}
                onCheckin={() => setView("checkin")} onOpenHabits={() => setView("habits")}
                onOpenIdentity={() => setView("identity")} onOpenTasks={() => setView("tasks")}
                onRerollMantra={rerollMantra}
              />
            )}
            {view === "tasks" && (
              <TasksView
                state={state} onAdd={addTask} onToggleTask={toggleTask}
                onOpenTask={(t) => setEditing(t.id)} onToggleStar={toggleStar} onMove={moveTask}
                onAddList={addList} onRenameList={renameList} onDeleteList={deleteList}
                onSetSetting={(k, v) => patch({ settings: { ...state.settings, [k]: v } })}
              />
            )}
            {view === "habits" && (
              <HabitsView state={state} onAdd={addTask} onOpenTask={(t) => setEditing(t.id)}
                onBack={() => setView("today")} />
            )}
            {view === "identity" && (
              <IdentityView state={state} tally={tally} onPatch={patch} onBack={() => setView("today")} />
            )}
            {view === "checkin" && (
              <CheckinView existing={state.checkins.find((c) => c.date === todayStr())}
                onSave={saveCheckin} onBack={() => setView("today")} />
            )}
            {view === "journal" && (
              <JournalView
                state={state}
                onAddEntry={(e) => patch({ journalEntries: [...state.journalEntries, e] })}
                onRemoveEntry={(id) => patch({ journalEntries: state.journalEntries.filter((x) => x.id !== id) })}
                onCheckin={() => setView("checkin")}
              />
            )}
            {view === "money" && (
              <MoneyView
                state={state} onPatch={patch}
                onAddStrategy={(s) => patch({ strategies: [...state.strategies, s] })}
                onUpdateStrategy={(id, p) => patch({
                  strategies: state.strategies.map((x) => (x.id === id ? { ...x, ...p } : x)),
                })}
                onRemoveStrategy={(id) => patch({ strategies: state.strategies.filter((x) => x.id !== id) })}
                onSaveTx={saveTx} onDeleteTx={deleteTx}
                onSaveRule={saveRule} onDeleteRule={deleteRule}
                onSaveNetWorth={saveNetWorthSnapshot}
              />
            )}
            {view === "insights" && (
              <InsightsView
                state={state} streak={streak}
                onAddGoal={(g) => patch({ goals: [...state.goals, g] })}
                onUpdateGoal={(id, p) => patch({ goals: state.goals.map((x) => (x.id === id ? { ...x, ...p } : x)) })}
                onRemoveGoal={(id) => patch({ goals: state.goals.filter((x) => x.id !== id) })}
              />
            )}
          </div>
        </div>

        {FAB_VIEWS.includes(view) && (
          <button onClick={quickAdd} style={styles.fab} title="New task">
            <Plus size={24} strokeWidth={2.6} />
          </button>
        )}

        <Toast toast={toast} onAction={act} onDismiss={dismiss} />

        <nav style={styles.nav}>
          {NAV.map((t) => {
            const active = view === t.id || (isSubView && t.id === "today");
            return (
              <button key={t.id} onClick={() => setView(t.id)} style={{
                ...styles.navBtn, color: active ? C.gold : C.faint,
              }}>
                <t.Icon size={20} strokeWidth={active ? 2.4 : 1.9} className={active ? "mtm-glow-pulse" : undefined} />
                <span style={{ fontSize: 9.5, fontWeight: active ? 650 : 500 }}>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <TaskSheet
          open={!!editingTask} task={editingTask} lists={state.lists}
          onClose={() => setEditing(null)} onChange={updateTask} onDelete={removeTask}
        />
      </div>
    </div>
  );
}
