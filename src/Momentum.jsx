import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Compass, ListTodo, Plus, TrendingUp, Wallet } from "lucide-react";
import { C, MOTION_CSS, styles } from "./theme.js";
import { MANTRAS, PILLARS } from "./data/constants.js";
import { addDays, dstr, formatTime12, hashIdx, todayStr } from "./lib/date.js";
import {
  heatmapDays, isDone, isFlexible, newTask, reorderTasks, tasksForDate, toggleDoneReducer, voteTally,
} from "./lib/tasks.js";
import {
  MILESTONES, freezesLeft, habitStreakProtected, isMilestoneFor, protectedStreak,
} from "./lib/habits.js";
import { emptyState, loadState, serializeState } from "./lib/migrate.js";
import { newSession } from "./lib/focus.js";
import { dueForSrbai, graduationStatus, newSrbaiEntry } from "./lib/automaticity.js";
import { drainActions } from "./lib/actionQueue.js";
import { publishWidget } from "./lib/widget.js";
import { comebacksToday, freshStart } from "./lib/rewards.js";
import { goalsNeedingWoop, onboardingState, startSmallCheck } from "./lib/woop.js";
import { postDueRecurring } from "./lib/money.js";
import { MAX_FOCUS, overdueTasks } from "./lib/planning.js";
import { notificationPermission, scheduleNudges } from "./lib/notify.js";
import { AmbientOrbs, SparkleField, Toast, useToast } from "./components/ui.jsx";
import TaskSheet from "./components/TaskSheet.jsx";
import RitualSheet from "./components/RitualSheet.jsx";
import FocusSheet from "./components/FocusSheet.jsx";
import SrbaiSheet from "./components/SrbaiSheet.jsx";
import WoopSheet from "./components/WoopSheet.jsx";
import EntrySheet from "./components/EntrySheet.jsx";
import Celebration from "./components/Celebration.jsx";
import CaptureSheet from "./components/CaptureSheet.jsx";
import ReviewView from "./views/ReviewView.jsx";
import PlanView from "./views/PlanView.jsx";
import TodayView from "./views/TodayView.jsx";
import TasksView from "./views/TasksView.jsx";
import HabitsView from "./views/HabitsView.jsx";
import IdentityView from "./views/IdentityView.jsx";
import CheckinView from "./views/CheckinView.jsx";
import JournalView from "./views/JournalView.jsx";
import SettingsView from "./views/SettingsView.jsx";
import OnboardingView from "./views/OnboardingView.jsx";
import SearchView from "./views/SearchView.jsx";

// Money and Insights are the two chart-heavy views, and between them they account for most
// of what recharts costs. Neither is where the app opens, so they load when they're first
// opened instead of before anything is on screen.
const MoneyView = lazy(() => import("./views/MoneyView.jsx"));
const InsightsView = lazy(() => import("./views/InsightsView.jsx"));

const ViewLoading = () => (
  <div style={{ ...styles.page, color: C.faint, fontSize: 12.5 }}>Loading…</div>
);

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
  const [ritual, setRitual] = useState(null);
  const [focusId, setFocusId] = useState(null);
  const [rating, setRating] = useState(null);
  const [woopGoal, setWoopGoal] = useState(null);
  const [comebackSeen, setComebackSeen] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const [capturing, setCapturing] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  // Set when Money is opened from a search result, so the ledger lands on the entry rather
  // than on this month's summary with the search forgotten.
  const [moneyJump, setMoneyJump] = useState(null);
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

  // Re-scheduled whenever the habits or the setting change, so edits to a habit's time take
  // effect without the user thinking about it. Debounced because every keystroke in the task
  // editor writes state, and rescheduling OS alarms on each one would be wasteful on device.
  useEffect(() => {
    if (!loaded) return undefined;
    const t = setTimeout(() => {
      scheduleNudges(state);
      // Keep the home-screen widget in step with what the app knows. No-op off Android.
      publishWidget({
        ...state,
        streak: protectedStreak(state.tasks, state.dayLog, state.freezes, "build"),
      });
    }, 800);
    return () => clearTimeout(t);
  }, [loaded, state.tasks, state.dayLog, state.srbai, state.checkins, state.freezes, state.settings]);

  // A "Done" tapped on a notification while the app was closed is waiting in IndexedDB;
  // one tapped while a tab is open arrives by postMessage. Both land here.
  const applyNotificationAction = useCallback((payload) => setState((s) => {
    if (!payload?.taskId || (payload.action !== "done" && payload.action !== "twoMin")) return s;
    const task = s.tasks.find((t) => t.id === payload.taskId);
    const date = payload.date || todayStr();
    if (!task || isDone(task, date, s.dayLog)) return s;
    const next = toggleDoneReducer(task, date, s.tasks, s.dayLog);
    let dayLog = next.dayLog;
    if (payload.action === "twoMin" && task.recurrence && dayLog[date]?.[task.id]?.done) {
      dayLog = { ...dayLog, [date]: { ...dayLog[date], [task.id]: { ...dayLog[date][task.id], minimal: true } } };
    }
    return { ...s, tasks: next.tasks, dayLog };
  }), []);

  useEffect(() => {
    if (!loaded) return undefined;
    let cancelled = false;
    drainActions().then((rows) => {
      if (cancelled || !rows.length) return;
      rows.forEach(applyNotificationAction);
      show(`${rows.length} ticked off from ${rows.length === 1 ? "a notification" : "notifications"}`);
    });
    const onMessage = (e) => {
      if (e.data?.type === "momentum:action") applyNotificationAction(e.data.payload);
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      cancelled = true;
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [loaded, applyNotificationAction, show]);

  // Native taps come back through the Capacitor plugin instead of a service worker.
  useEffect(() => {
    const plugin = window.Capacitor?.Plugins?.LocalNotifications;
    if (!loaded || !plugin?.addListener) return undefined;
    let handle;
    plugin.addListener("localNotificationActionPerformed", (e) => {
      const extra = e?.notification?.extra || {};
      applyNotificationAction({ action: e.actionId, taskId: extra.taskId, date: extra.date });
    }).then((h) => { handle = h; }).catch(() => {});
    return () => { handle?.remove?.(); };
  }, [loaded, applyNotificationAction]);

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

  // A restore replaces the whole state rather than merging into it: a backup is a complete
  // picture, and merging would leave the app holding half of each.
  const restoreState = useCallback((next) => {
    setState(next);
    show("Backup restored");
  }, [show]);

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

  // Completing a build habit can cross a milestone; that has to be detected after the write,
  // against the new log, so the celebration reflects the streak you just earned.
  const toggleTask = useCallback((task, date = todayStr(), opts = {}) => setState((s) => {
    const next = toggleDoneReducer(task, date, s.tasks, s.dayLog);
    let dayLog = next.dayLog;
    if (opts.minimal && task.recurrence && dayLog[date]?.[task.id]?.done) {
      dayLog = { ...dayLog, [date]: { ...dayLog[date], [task.id]: { ...dayLog[date][task.id], minimal: true } } };
    }
    const after = { ...s, tasks: next.tasks, dayLog };

    if (task.kind === "build" && isDone(task, date, dayLog)) {
      const streak = habitStreakProtected(task, dayLog, s.freezes);
      const already = s.milestones.some((m) => m.taskId === task.id && m.days === streak);
      // A quota habit's streak counts weeks, so it gets week-scale marks and week-scale copy.
      if (isMilestoneFor(task, streak) && !already) {
        const reward = task.reward?.atDays && streak >= task.reward.atDays && !task.reward.claimedAt
          ? task.reward : null;
        after.milestones = [...s.milestones, { id: `${task.id}-${streak}`, taskId: task.id, days: streak, date }];
        setTimeout(() => setCelebration({
          id: `${task.id}-${streak}`, taskId: task.id, days: streak, title: task.text,
          unit: isFlexible(task) ? "week" : "day",
          message: (isFlexible(task) ? WEEK_MILESTONE_COPY : MILESTONE_COPY)[streak]
            || "Another mark on the board. Keep the chain alive.",
          reward,
        }), 260);
      }
    }
    return after;
  }), []);

  const toggleStar = useCallback((task) =>
    updateTask(task.id, { starred: !task.starred }), [updateTask]);

  const moveTask = useCallback((id, siblings, dir) => setState((s) => ({
    ...s, tasks: reorderTasks(s.tasks, id, siblings, dir),
  })), []);

  // Copies the setup, not the history: a duplicate starts its own streak from zero and
  // doesn't inherit a reward that was already claimed.
  const duplicateTask = useCallback((id) => setState((s) => {
    const source = s.tasks.find((t) => t.id === id);
    if (!source) return s;
    // drop the id rather than blanking it — newTask spreads the patch over its own defaults
    const { id: _sourceId, ...rest } = source;
    const copy = newTask({
      ...rest,
      text: `${source.text} (copy)`,
      done: false,
      doneAt: null,
      archivedAt: null,
      startDate: todayStr(),
      reward: source.reward ? { ...source.reward, claimedAt: null } : null,
      subtasks: (source.subtasks || []).map((x) => ({ ...x, done: false })),
      order: (source.order || 0) + 0.5,
      createdAt: Date.now(),
    });
    show(`Duplicated "${source.text}"`);
    return { ...s, tasks: [...s.tasks, copy] };
  }), [show]);

  const setArchived = useCallback((id, archived) => setState((s) => {
    const task = s.tasks.find((t) => t.id === id);
    show(archived ? `Paused "${task?.text}"` : `Resumed "${task?.text}"`, archived ? "Undo" : null,
      archived ? () => setState((cur) => ({
        ...cur, tasks: cur.tasks.map((t) => (t.id === id ? { ...t, archivedAt: null } : t)),
      })) : null);
    return {
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, archivedAt: archived ? Date.now() : null } : t)),
    };
  }), [show]);

  // ---- Habit formation ----
  const freezeYesterday = useCallback(() => setState((s) => {
    const y = addDays(todayStr(), -1);
    if (s.freezes?.[y]) return s;
    if (freezesLeft(s.freezes) === 0) {
      show("No freezes left this month");
      return s;
    }
    show("Yesterday frozen — chain protected", "Undo", () =>
      setState((cur) => {
        const { [y]: _dropped, ...rest } = cur.freezes;
        return { ...cur, freezes: rest };
      }));
    return { ...s, freezes: { ...s.freezes, [y]: { usedAt: Date.now() } } };
  }), [show]);

  // Logging a missed day late, marked as such, so the record stays honest
  const repairDay = useCallback((date) => setState((s) => {
    const scheduled = tasksForDate(s.tasks, date, "build");
    const day = { ...(s.dayLog[date] || {}) };
    scheduled.forEach((t) => {
      if (!day[t.id]?.done) day[t.id] = { done: true, doneAt: Date.now(), repaired: true };
    });
    show(`Logged ${scheduled.length} habit${scheduled.length === 1 ? "" : "s"} for yesterday`);
    return { ...s, dayLog: { ...s.dayLog, [date]: day } };
  }), [show]);

  const claimReward = useCallback((taskId) => setState((s) => ({
    ...s,
    tasks: s.tasks.map((t) => (t.id === taskId && t.reward
      ? { ...t, reward: { ...t.reward, claimedAt: Date.now() } } : t)),
  })), []);

  const finishReview = useCallback((entry) => {
    setState((s) => ({ ...s, reviews: [...s.reviews, entry] }));
    setView("today");
    show(entry.applied?.length
      ? `Review saved · ${entry.applied.length} change${entry.applied.length === 1 ? "" : "s"} applied`
      : "Review saved");
  }, [show]);

  // ---- Planning ----
  const savePlan = useCallback((weekKey, plan) => setState((s) => ({
    ...s, weekPlans: { ...s.weekPlans, [weekKey]: plan },
  })), []);

  // Overdue work stays owed: pulling it forward re-dates it to today rather than quietly
  // marking it done or dropping it.
  const rescheduleOverdue = useCallback(() => setState((s) => {
    const today = todayStr();
    const late = overdueTasks(s.tasks, today);
    if (!late.length) return s;
    const ids = new Set(late.map((t) => t.id));
    const before = late.map((t) => ({ id: t.id, dueDate: t.dueDate }));
    show(`Moved ${late.length} task${late.length === 1 ? "" : "s"} to today`, "Undo", () =>
      setState((cur) => ({
        ...cur,
        tasks: cur.tasks.map((t) => {
          const prev = before.find((b) => b.id === t.id);
          return prev ? { ...t, dueDate: prev.dueDate } : t;
        }),
      })));
    return { ...s, tasks: s.tasks.map((t) => (ids.has(t.id) ? { ...t, dueDate: today } : t)) };
  }), [show]);

  const toggleFocus = useCallback((taskId) => setState((s) => {
    const today = todayStr();
    const cur = s.dayFocus?.[today] || [];
    if (cur.includes(taskId)) {
      return { ...s, dayFocus: { ...s.dayFocus, [today]: cur.filter((id) => id !== taskId) } };
    }
    if (cur.length >= MAX_FOCUS) {
      show(`Three is the limit — that's the point`);
      return s;
    }
    return { ...s, dayFocus: { ...s.dayFocus, [today]: [...cur, taskId] } };
  }), [show]);

  // ---- Journal ----
  const addEntry = useCallback((entry) => setState((s) => ({
    ...s, journalEntries: [...s.journalEntries, entry], journalDraft: null,
  })), []);

  const updateEntry = useCallback((id, patchObj) => setState((s) => ({
    ...s,
    journalEntries: s.journalEntries.map((e) => (e.id === id ? { ...e, ...patchObj, updatedAt: Date.now() } : e)),
  })), []);

  const removeEntry = useCallback((id) => setState((s) => {
    const victim = s.journalEntries.find((e) => e.id === id);
    if (victim) {
      show("Entry deleted", "Undo", () =>
        setState((cur) => ({ ...cur, journalEntries: [...cur.journalEntries, victim] })));
    }
    return { ...s, journalEntries: s.journalEntries.filter((e) => e.id !== id) };
  }), [show]);

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
      // A check-in carried over from an older save may have no scores object at all; the
      // rest of the app already guards this, and an unguarded read here takes down the
      // whole shell rather than losing one average.
      const vals = recent.map((c) => c.scores?.[p.id]).filter((v) => typeof v === "number");
      out[p.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return out;
  }, [state.checkins]);

  const overall = useMemo(() => {
    const vals = PILLARS.map((p) => averages[p.id]).filter((v) => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [averages]);

  const streak = useMemo(
    () => protectedStreak(state.tasks, state.dayLog, state.freezes, "build"),
    [state.tasks, state.dayLog, state.freezes]);
  const breakStreak = useMemo(
    () => protectedStreak(state.tasks, state.dayLog, state.freezes, "break"),
    [state.tasks, state.dayLog, state.freezes]);
  const tally = useMemo(() => voteTally(state.tasks, state.dayLog), [state.tasks, state.dayLog]);
  const heatmap = useMemo(() => heatmapDays(state.tasks, state.dayLog), [state.tasks, state.dayLog]);

  const needsRest = useMemo(() => {
    const last3 = [...state.checkins].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    return last3.length === 3 && last3.every((c) => (c.recharge ?? 3) <= 2);
  }, [state.checkins]);

  const editingTask = editing ? state.tasks.find((t) => t.id === editing) : null;
  const ritualTask = ritual ? state.tasks.find((t) => t.id === ritual) : null;
  const focusTask = focusId ? state.tasks.find((t) => t.id === focusId) : null;
  const ratingTask = rating ? state.tasks.find((t) => t.id === rating) : null;
  const fresh = useMemo(() => (loaded ? freshStart(state) : null), [loaded, state]);
  const comebacks = useMemo(
    () => (loaded && !comebackSeen
      ? comebacksToday(state.tasks, state.dayLog, state.freezes)
        .filter((c) => !(state.comebacksSeen || []).includes(`${c.task.id}:${c.date}`))
      : []),
    [loaded, comebackSeen, state.tasks, state.dayLog, state.freezes, state.comebacksSeen]);
  const smallCheck = useMemo(() => (loaded ? startSmallCheck(state) : null), [loaded, state]);
  const woopNeeded = useMemo(
    () => (loaded ? goalsNeedingWoop(state.goals) : []), [loaded, state.goals]);
  const onboarding = useMemo(() => (loaded ? onboardingState(state) : null), [loaded, state]);

  const srbaiDueTasks = useMemo(
    () => (loaded ? dueForSrbai(state.tasks, state.srbai, state.dayLog) : []),
    [loaded, state.tasks, state.srbai, state.dayLog]);

  const saveCheckin = (entry) => {
    setState((s) => ({ ...s, checkins: [...s.checkins.filter((c) => c.date !== entry.date), entry] }));
    setView("today");
  };

  const rerollMantra = () => setState((s) => ({
    ...s,
    mantraIdxByDate: { ...s.mantraIdxByDate, [todayStr()]: hashIdx(todayStr() + Date.now(), MANTRAS.length) },
  }));

  // Focus sessions record time actually spent, so they are appended wherever a timer stops —
  // the general focus sheet and the habit ritual both land here.
  const logFocus = useCallback((entry) => setState((s) => ({
    ...s, focusSessions: [...(s.focusSessions || []), newSession(entry)],
  })), []);

  const logSrbai = useCallback((task, scores) => setState((s) => {
    const next = { ...s, srbai: [...(s.srbai || []), newSrbaiEntry({ taskId: task.id, scores })] };
    const before = graduationStatus(task, s.srbai || []);
    const after = graduationStatus(task, next.srbai);
    if (before.id !== "graduated" && after.id === "graduated") {
      // Graduation is the point of measuring: the scaffolding comes off and the cue takes
      // over. Said out loud, because otherwise a prompt just quietly stops arriving.
      setTimeout(() => show(`"${task.text}" has graduated — prompts off`, "Keep them", () =>
        setState((cur) => ({
          ...cur, tasks: cur.tasks.map((t) => (t.id === task.id ? { ...t, keepReminder: true } : t)),
        }))), 240);
    }
    return next;
  }), [show]);

  const saveWoop = useCallback((goalId, woop) => setState((s) => ({
    ...s, goals: s.goals.map((g) => (g.id === goalId ? { ...g, woop } : g)),
  })), []);

  // A dismissed fresh start is recorded so the same landmark never asks twice.
  const dismissFreshStart = useCallback((prompt) => setState((s) => ({
    ...s, freshStarts: [...(s.freshStarts || []), { id: prompt.id, date: prompt.date, at: Date.now() }],
  })), []);

  const ackComebacks = useCallback((list) => {
    setComebackSeen(true);
    setState((s) => ({
      ...s,
      comebacksSeen: [...(s.comebacksSeen || []), ...list.map((c) => `${c.task.id}:${c.date}`)],
    }));
  }, []);

  const saveView = useCallback((view) => setState((s) => ({
    ...s, savedViews: [...(s.savedViews || []), view],
  })), []);
  const deleteView = useCallback((id) => setState((s) => ({
    ...s, savedViews: (s.savedViews || []).filter((v) => v.id !== id),
  })), []);

  const scheduleTask = useCallback((task, time) => {
    updateTask(task.id, { time, dueDate: task.recurrence ? task.dueDate : (task.dueDate || todayStr()) });
    show(`${task.text} at ${formatTime12(time)}`);
  }, [updateTask, show]);

  // Capture first, edit only if the task actually needs it.
  const captureTask = (patch) => addTask({
    kind: "todo",
    listId: "inbox",
    ...patch,
    dueDate: patch.recurrence ? null : (patch.dueDate ?? todayStr()),
  });
  const captureAndEdit = (patch) => {
    const task = captureTask(patch);
    if (task) setEditing(task.id);
  };

  if (!loaded) {
    return (
      <div style={{ ...styles.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ color: C.muted }}>Loading your map…</span>
      </div>
    );
  }

  const isSubView = ["checkin", "habits", "identity", "review", "plan"].includes(view);

  return (
    <div style={styles.app}>
      <div style={styles.phone}>
        <AmbientOrbs />
        <SparkleField />

        <div style={styles.scroll}>
          <div key={view} className="mtm-view-flip">
            <Suspense fallback={<ViewLoading />}>
            {view === "today" && (
              <TodayView
                state={state} averages={averages} overall={overall} streak={streak} breakStreak={breakStreak}
                tally={tally} heatmap={heatmap} needsRest={needsRest}
                onToggleTask={toggleTask} onOpenTask={(t) => setEditing(t.id)} onToggleStar={toggleStar}
                onCheckin={() => setView("checkin")} onOpenHabits={() => setView("habits")}
                onOpenIdentity={() => setView("identity")} onOpenTasks={() => setView("tasks")}
                onRerollMantra={rerollMantra}
                onFreeze={freezeYesterday} onRepair={repairDay}
                onStartRitual={(t) => setRitual(t.id)} onOpenReview={() => setView("review")}
                onStartFocus={(t) => setFocusId(t.id)} onSchedule={scheduleTask}
                srbaiDue={srbaiDueTasks} onRateHabit={(t) => setRating(t.id)}
                onOpenSettings={() => setView("settings")}
                onOpenSearch={() => setView("search")}
                freshStart={fresh} onAcceptFreshStart={dismissFreshStart} onDismissFreshStart={dismissFreshStart}
                comebacks={comebacks} onAckComebacks={ackComebacks}
                startSmall={smallCheck} woopNeeded={woopNeeded} onStartWoop={setWoopGoal}
                onboarding={onboarding} onStartOnboarding={() => setView("onboarding")}
                onDismissOnboarding={() => patch({ settings: { ...state.settings, onboarded: true } })}
                onOpenPlan={() => setView("plan")}
                onRescheduleOverdue={rescheduleOverdue} onToggleFocus={toggleFocus}
              />
            )}
            {view === "plan" && (
              <PlanView
                state={state} onSavePlan={savePlan}
                onAddGoal={(g) => patch({ goals: [...state.goals, g] })}
                onUpdateGoal={(id, p) => patch({ goals: state.goals.map((x) => (x.id === id ? { ...x, ...p } : x)) })}
                onRemoveGoal={(id) => patch({ goals: state.goals.filter((x) => x.id !== id) })}
                onOpenTask={(t) => setEditing(t.id)}
                onBack={() => setView("today")}
              />
            )}
            {view === "review" && (
              <ReviewView state={state} onUpdateTask={updateTask} onFinish={finishReview}
                onBack={() => setView("today")} />
            )}
            {view === "tasks" && (
              <TasksView
                state={state} onAdd={addTask} onToggleTask={toggleTask}
                onOpenTask={(t) => setEditing(t.id)} onToggleStar={toggleStar} onMove={moveTask}
                onAddList={addList} onRenameList={renameList} onDeleteList={deleteList}
                onSetSetting={(k, v) => patch({ settings: { ...state.settings, [k]: v } })}
                onStartFocus={(t) => setFocusId(t.id)}
                onSaveView={saveView} onDeleteView={deleteView}
              />
            )}
            {view === "habits" && (
              <HabitsView state={state} onAdd={addTask} onOpenTask={(t) => setEditing(t.id)}
                onBack={() => setView("today")}
                onSetSetting={(k, v) => patch({ settings: { ...state.settings, [k]: v } })}
                onDuplicate={duplicateTask} onArchive={setArchived} onDelete={removeTask}
                onMove={moveTask} onRateHabit={(t) => setRating(t.id)} />
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
                onAddEntry={addEntry}
                onUpdateEntry={updateEntry}
                onRemoveEntry={removeEntry}
                onOpenEntry={(e) => setEditingEntry(e)}
                onSaveDraft={(d) => patch({ journalDraft: d })}
                onCheckin={() => setView("checkin")}
              />
            )}
            {view === "money" && (
              <MoneyView
                key={moneyJump ? `jump-${moneyJump.query}-${moneyJump.mKey}` : "money"}
                jumpTo={moneyJump}
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
            {view === "search" && (
              <SearchView
                state={state}
                onBack={() => setView("today")}
                onOpen={(item) => {
                  if (item.kind === "task" || item.kind === "habit") {
                    setView(item.kind === "habit" ? "habits" : "tasks");
                    setEditing(item.id);
                  } else if (item.kind === "journal") {
                    setView("journal");
                    setEditingEntry(item.entry);
                  } else if (item.kind === "money") {
                    // The ledger's own filters do the last step, so the entry is on screen
                    // in its own context rather than ripped out of it.
                    setMoneyJump({
                      query: item.tx.payee || item.tx.note || "",
                      mKey: item.tx.date.slice(0, 7),
                      tab: "records",
                    });
                    setView("money");
                  } else if (item.strategy) {
                    setMoneyJump({ query: "", mKey: null, tab: "goals" });
                    setView("money");
                  } else {
                    setView("insights");
                  }
                }}
              />
            )}
            {view === "onboarding" && (
              <OnboardingView
                state={state} onBack={() => setView("today")}
                onSetIdentity={(pillarId, text) => patch({ identities: { ...state.identities, [pillarId]: text } })}
                onAddHabit={addTask}
                onDone={() => { patch({ settings: { ...state.settings, onboarded: true } }); setView("today"); }}
              />
            )}
            {view === "settings" && (
              <SettingsView
                state={state} onBack={() => setView("today")}
                onSetSetting={(k, v) => patch({ settings: { ...state.settings, [k]: v } })}
                onUpdateTask={updateTask}
                onRestore={restoreState}
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
            </Suspense>
          </div>
        </div>

        {FAB_VIEWS.includes(view) && (
          <button onClick={() => setCapturing(true)} style={styles.fab} title="New task">
            <Plus size={24} strokeWidth={2.6} />
          </button>
        )}

        <CaptureSheet
          open={capturing} lists={state.lists}
          onClose={() => setCapturing(false)}
          onAdd={captureTask} onAddAndEdit={captureAndEdit}
        />

        <Toast toast={toast} onAction={act} onDismiss={dismiss} />

        <nav style={styles.nav}>
          {NAV.map((t) => {
            const active = view === t.id || (isSubView && t.id === "today");
            return (
              <button key={t.id} onClick={() => {
                // Tapping Money in the nav means "take me to Money", not "take me back to
                // whatever a search result pointed at an hour ago".
                setMoneyJump(null);
                setView(t.id);
              }} style={{
                ...styles.navBtn, color: active ? C.gold : C.faint,
              }}>
                <t.Icon size={20} strokeWidth={active ? 2.4 : 1.9} className={active ? "mtm-glow-pulse" : undefined} />
                <span style={{ fontSize: 9.5, fontWeight: active ? 650 : 500 }}>{t.label}</span>
              </button>
            );
          })}
        </nav>

        <TaskSheet
          open={!!editingTask} task={editingTask} lists={state.lists} goals={state.goals}
          onClose={() => setEditing(null)} onChange={updateTask} onDelete={removeTask}
          onStartFocus={(t) => setFocusId(t.id)}
        />

        <RitualSheet
          open={!!ritualTask} task={ritualTask} identity={state.identities}
          streak={ritualTask ? habitStreakProtected(ritualTask, state.dayLog, state.freezes) : 0}
          onClose={() => setRitual(null)}
          onEdit={(t) => setEditing(t.id)}
          onLogFocus={logFocus}
          onComplete={(t, minimal) => {
            if (!isDone(t, todayStr(), state.dayLog)) toggleTask(t, todayStr(), { minimal });
            setRitual(null);
          }}
        />

        <WoopSheet
          open={!!woopGoal} goal={woopGoal}
          onClose={() => setWoopGoal(null)}
          onSave={saveWoop}
        />

        <SrbaiSheet
          open={!!ratingTask} task={ratingTask}
          onClose={() => setRating(null)}
          onSubmit={(t, scores) => { logSrbai(t, scores); setRating(null); }}
        />

        <FocusSheet
          open={!!focusTask} task={focusTask}
          onClose={() => setFocusId(null)}
          onLog={logFocus}
          onComplete={(t) => { if (!isDone(t, todayStr(), state.dayLog)) toggleTask(t, todayStr()); }}
        />

        <EntrySheet
          open={!!editingEntry} entry={editingEntry}
          onChange={setEditingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={() => { updateEntry(editingEntry.id, editingEntry); setEditingEntry(null); }}
          onDelete={() => { removeEntry(editingEntry.id); setEditingEntry(null); }}
        />

        <Celebration
          event={celebration} onClose={() => setCelebration(null)} onClaimReward={claimReward}
        />
      </div>
    </div>
  );
}

const MILESTONE_COPY = {
  7: "One full week. This is the point most people never reach — the habit is real now.",
  21: "Three weeks in. It's starting to feel like something you do, not something you're trying.",
  30: "A month. Look back at the chain — that's evidence, not motivation.",
  66: "Sixty-six days: roughly where behaviour becomes automatic. You built this.",
  100: "One hundred. This isn't a habit any more, it's part of who you are.",
  365: "A full year. Whatever you were before you started, you're not that person now.",
};

// Quota habits are counted in weeks, so their marks land on a different scale.
const WEEK_MILESTONE_COPY = {
  4: "A month of hitting your number. You picked a pace you can actually keep.",
  12: "Twelve weeks. A quarter of consistency beats a fortnight of intensity every time.",
  26: "Half a year. This has survived bad weeks, and that's the whole test.",
  52: "A full year at your own pace. That's not discipline any more, it's just how you live.",
};
