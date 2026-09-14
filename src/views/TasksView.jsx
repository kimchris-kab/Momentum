import React, { useMemo, useState } from "react";
import {
  ArrowUpDown, ChevronDown, ChevronUp, ListTodo, Plus, Search, Settings2, Star, Trash2, X,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { LIST_COLORS, PRIORITY } from "../data/constants.js";
import { todayStr } from "../lib/date.js";
import {
  SORT_MODES, groupTasks, habitStreak, isDone, searchTasks, sortTasks,
} from "../lib/tasks.js";
import {
  Card, EmptyState, IconButton, Pill, SegmentedControl, SectionLabel, Sheet,
} from "../components/ui.jsx";
import TaskRow from "../components/TaskRow.jsx";

const GROUP_ORDER = [
  { key: "overdue", label: "Overdue", color: C.red },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "noDate", label: "No date" },
];

export default function TasksView({
  state, onAdd, onToggleTask, onOpenTask, onToggleStar, onMove, onAddList, onRenameList, onDeleteList,
  onSetSetting,
}) {
  const { tasks, dayLog, lists, settings } = state;
  const [listId, setListId] = useState("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [newListName, setNewListName] = useState("");

  const sortMode = settings.sortMode || "manual";
  const today = todayStr();

  const scoped = useMemo(() => {
    const todos = tasks.filter((t) => t.kind === "todo" && !t.archivedAt);
    const inList = listId === "all" ? todos : todos.filter((t) => t.listId === listId);
    return searchTasks(inList, query);
  }, [tasks, listId, query]);

  const groups = useMemo(() => {
    const g = groupTasks(scoped);
    Object.keys(g).forEach((k) => { if (k !== "completed") g[k] = sortTasks(g[k], sortMode); });
    return g;
  }, [scoped, sortMode]);

  const openCount = GROUP_ORDER.reduce((n, g) => n + groups[g.key].length, 0);
  const listById = Object.fromEntries(lists.map((l) => [l.id, l]));

  const add = () => {
    if (!draft.trim()) return;
    onAdd({
      text: draft.trim(),
      kind: "todo",
      listId: listId === "all" ? "inbox" : listId,
      dueDate: today,
    });
    setDraft("");
  };

  const renderRow = (t, siblings) => {
    const idx = siblings.indexOf(t.id);
    const canReorder = sortMode === "manual" && !query;
    return (
      <TaskRow
        key={t.id} task={t} date={today} done={isDone(t, today, dayLog)}
        streak={t.recurrence ? habitStreak(t, tasks, dayLog) : 0}
        listChip={listId === "all" && t.listId !== "inbox" ? listById[t.listId] : null}
        onToggle={() => onToggleTask(t)}
        onOpen={() => onOpenTask(t)}
        onToggleStar={() => onToggleStar(t)}
        showReorder={canReorder}
        onMoveUp={canReorder && idx > 0 ? () => onMove(t.id, siblings, -1) : null}
        onMoveDown={canReorder && idx < siblings.length - 1 ? () => onMove(t.id, siblings, 1) : null}
      />
    );
  };

  return (
    <div style={styles.page}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <p style={styles.eyebrow}>{openCount} open</p>
          <h1 style={styles.h1}>Tasks</h1>
        </div>
        <div style={{ display: "flex", gap: 6, paddingBottom: 18 }}>
          <IconButton onClick={() => setSearching((s) => !s)} active={searching} title="Search">
            <Search size={15} />
          </IconButton>
          <IconButton onClick={() => setSortOpen(true)} title="Sort"><ArrowUpDown size={15} /></IconButton>
          <IconButton onClick={() => setListsOpen(true)} title="Lists"><Settings2 size={15} /></IconButton>
        </div>
      </div>

      {searching && (
        <div style={{ ...styles.fieldShell, marginBottom: 12 }}>
          <Search size={14} color={C.muted} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks, notes, subtasks…" style={{ ...styles.bareInput, flex: 1, fontSize: 13.5 }} />
          {query && (
            <button onClick={() => setQuery("")} style={{
              background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 0,
            }}><X size={13} /></button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, margin: "0 -18px", padding: "0 18px 12px" }}>
        <Pill on={listId === "all"} onClick={() => setListId("all")}>All</Pill>
        {lists.map((l) => (
          <Pill key={l.id} on={listId === l.id} color={l.color} onClick={() => setListId(l.id)}>
            {l.name}
          </Pill>
        ))}
      </div>

      <Card>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Add a task…" style={{ ...styles.input, flex: 1, fontSize: 13.5 }} />
          <button onClick={add} style={styles.addBtn}><Plus size={18} /></button>
        </div>
        <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0" }}>
          Lands on today by default — open it to set a date, repeat, subtasks or notes.
        </p>
      </Card>

      {openCount === 0 && groups.completed.length === 0 && (
        <EmptyState
          Icon={ListTodo}
          title={query ? "No matches" : "No tasks yet"}
          hint={query ? "Try a different search." : "Anything you'd put in Google Tasks goes here — due dates, repeats, subtasks, notes and stars."}
        />
      )}

      {GROUP_ORDER.map((g) => {
        const list = groups[g.key];
        if (!list.length) return null;
        const ids = list.map((t) => t.id);
        return (
          <div key={g.key}>
            <SectionLabel color={g.color}>{g.label} · {list.length}</SectionLabel>
            <Card style={{ padding: "8px 14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {list.map((t) => renderRow(t, ids))}
              </div>
            </Card>
          </div>
        );
      })}

      {groups.completed.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button onClick={() => setShowCompleted((s) => !s)} style={styles.linkBtn}>
            {showCompleted ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            Completed ({groups.completed.length})
          </button>
          {showCompleted && (
            <Card style={{ padding: "8px 14px", marginTop: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {groups.completed.map((t) => renderRow(t, []))}
              </div>
            </Card>
          )}
        </div>
      )}

      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort by">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {SORT_MODES.map((m) => (
            <button key={m.id} onClick={() => { onSetSetting("sortMode", m.id); setSortOpen(false); }} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              background: sortMode === m.id ? C.goldSoft : C.surface,
              border: `1px solid ${sortMode === m.id ? alpha(C.gold, 0.4) : C.border}`,
              borderRadius: R.md, padding: "13px 14px", cursor: "pointer",
              color: sortMode === m.id ? C.gold : C.text, fontSize: 14, fontFamily: F.body,
            }}>
              {m.label}
              {m.id === "starred" && <Star size={14} fill={sortMode === m.id ? C.gold : "none"} />}
            </button>
          ))}
        </div>
        <p style={{ color: C.faint, fontSize: 11.5, marginTop: 14, lineHeight: 1.5 }}>
          "My order" lets you move tasks up and down by hand with the arrows on each row.
        </p>
      </Sheet>

      <Sheet open={listsOpen} onClose={() => setListsOpen(false)} title="Your lists">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lists.map((l) => (
            <div key={l.id} style={{
              display: "flex", alignItems: "center", gap: 10, background: C.surface,
              border: `1px solid ${C.border}`, borderRadius: R.md, padding: "10px 12px",
            }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: l.color, flexShrink: 0 }} />
              <input value={l.name} onChange={(e) => onRenameList(l.id, e.target.value)}
                style={{ ...styles.bareInput, flex: 1, fontSize: 14 }} />
              <span style={{ ...styles.tag }}>
                {tasks.filter((t) => t.kind === "todo" && t.listId === l.id && !t.done).length}
              </span>
              {l.id !== "inbox" && (
                <button onClick={() => { onDeleteList(l.id); if (listId === l.id) setListId("all"); }} style={{
                  background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2,
                }}><Trash2 size={14} /></button>
              )}
            </div>
          ))}
          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <input value={newListName} onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter" || !newListName.trim()) return;
                onAddList(newListName.trim(), LIST_COLORS[lists.length % LIST_COLORS.length]);
                setNewListName("");
              }}
              placeholder="New list name…" style={{ ...styles.input, flex: 1, fontSize: 13.5 }} />
            <button onClick={() => {
              if (!newListName.trim()) return;
              onAddList(newListName.trim(), LIST_COLORS[lists.length % LIST_COLORS.length]);
              setNewListName("");
            }} style={styles.addBtn}><Plus size={18} /></button>
          </div>
          <p style={{ color: C.faint, fontSize: 11.5, marginTop: 6, lineHeight: 1.5 }}>
            Deleting a list moves its tasks back to My Tasks — nothing is lost.
          </p>
        </div>
      </Sheet>
    </div>
  );
}
