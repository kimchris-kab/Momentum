import React, { useMemo, useState } from "react";
import {
  ArrowUpDown, Bookmark, ChevronDown, ChevronUp, ListTodo, Plus, Search, Settings2,
  SlidersHorizontal, Star, Target, Trash2, X,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { LIST_COLORS, PILLARS, PRIORITY } from "../data/constants.js";
import { todayStr } from "../lib/date.js";
import {
  SORT_MODES, groupTasks, habitStreak, isDone, sortTasks,
} from "../lib/tasks.js";
import {
  EMPTY_FILTERS, activeCount, applyFilters, describeFilters, newView, sameFilters,
} from "../lib/views.js";
import {
  Card, EmptyState, IconButton, Pill, SegmentedControl, SectionLabel, Sheet,
} from "../components/ui.jsx";
import TaskRow from "../components/TaskRow.jsx";
import QuickAdd from "../components/QuickAdd.jsx";

const GROUP_ORDER = [
  { key: "overdue", label: "Overdue", color: C.red },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "noDate", label: "No date" },
];

function FilterGroup({ label, children }) {
  return (
    <div>
      <p style={{
        color: C.muted, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 7px",
      }}>
        {label}
      </p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{children}</div>
    </div>
  );
}

export default function TasksView({
  state, onAdd, onToggleTask, onOpenTask, onToggleStar, onMove, onAddList, onRenameList, onDeleteList,
  onSetSetting, onStartFocus, onSaveView, onDeleteView,
}) {
  const { tasks, dayLog, lists, settings, goals = [], savedViews = [] } = state;
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searching, setSearching] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [listsOpen, setListsOpen] = useState(false);
  const [newListName, setNewListName] = useState("");

  const sortMode = settings.sortMode || "manual";
  const today = todayStr();
  const listId = filters.listId;
  const query = filters.query;
  const setFilter = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const setListId = (id) => setFilter({ listId: id });
  const setQuery = (q) => setFilter({ query: q });
  const filterCount = activeCount(filters);
  const goalById = Object.fromEntries(goals.map((g) => [g.id, g]));

  const scoped = useMemo(() => {
    const todos = tasks.filter((t) => t.kind === "todo" && !t.archivedAt);
    return applyFilters(todos, filters, today);
  }, [tasks, filters, today]);

  const groups = useMemo(() => {
    const g = groupTasks(scoped);
    Object.keys(g).forEach((k) => { if (k !== "completed") g[k] = sortTasks(g[k], sortMode); });
    return g;
  }, [scoped, sortMode]);

  const openCount = GROUP_ORDER.reduce((n, g) => n + groups[g.key].length, 0);
  const listById = Object.fromEntries(lists.map((l) => [l.id, l]));

  // The parser hands back everything it understood; anything it didn't still lands on today,
  // which is what the plain field used to do.
  const add = (patch) => onAdd({
    kind: "todo",
    listId: listId === "all" ? "inbox" : listId,
    ...patch,
    dueDate: patch.recurrence ? null : (patch.dueDate ?? today),
  });

  const renderRow = (t, siblings) => {
    const idx = siblings.indexOf(t.id);
    const canReorder = sortMode === "manual" && !query;
    return (
      <TaskRow
        key={t.id} task={t} date={today} done={isDone(t, today, dayLog)}
        streak={t.recurrence ? habitStreak(t, tasks, dayLog) : 0}
        listChip={listId === "all" && t.listId !== "inbox" ? listById[t.listId] : null}
        goal={t.goalId ? goalById[t.goalId] : null}
        onToggle={() => onToggleTask(t)}
        onOpen={() => onOpenTask(t)}
        onToggleStar={() => onToggleStar(t)}
        onFocus={onStartFocus ? () => onStartFocus(t) : null}
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
          <IconButton onClick={() => setFilterOpen(true)} active={filterCount > 0} title="Filter">
            <SlidersHorizontal size={15} />
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

      {savedViews.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", margin: "0 -18px", padding: "0 18px 12px" }}>
          {savedViews.map((v) => (
            <Pill key={v.id} on={sameFilters(v.filters, filters)} color={C.purple}
              onClick={() => setFilters(sameFilters(v.filters, filters) ? EMPTY_FILTERS : v.filters)}>
              <Bookmark size={10} style={{ verticalAlign: -1, marginRight: 4 }} />{v.name}
            </Pill>
          ))}
        </div>
      )}

      {filterCount > 0 && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "9px 12px",
          background: alpha(C.gold, 0.08), border: `1px solid ${alpha(C.gold, 0.25)}`, borderRadius: R.md,
        }}>
          <SlidersHorizontal size={13} color={C.gold} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, color: C.gold, fontSize: 12 }}>
            {describeFilters(filters, { lists, pillars: PILLARS })}
          </span>
          <button onClick={() => setFilters({ ...EMPTY_FILTERS, listId, query })} title="Clear filters" style={{
            background: "none", border: "none", cursor: "pointer", color: C.gold, padding: 0, display: "flex",
          }}>
            <X size={14} />
          </button>
        </div>
      )}

      <Card>
        <QuickAdd
          lists={lists}
          defaultListId={listId === "all" ? "inbox" : listId}
          onAdd={add}
          onMore={(patch) => { const created = onAdd(patch); if (created) onOpenTask(created); }}
        />
        <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0", lineHeight: 1.5 }}>
          Write the date, time and repeat straight into the line — "friday 6pm", "every day",
          "3x a week". Anything it picks up shows as a chip you can take back.
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

      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filter">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <FilterGroup label="Show only">
            <Pill on={filters.starred} onClick={() => setFilter({ starred: !filters.starred })}>
              <Star size={10} style={{ verticalAlign: -1, marginRight: 4 }} />Starred
            </Pill>
            <Pill on={filters.overdue} color={C.red} onClick={() => setFilter({ overdue: !filters.overdue })}>
              Overdue
            </Pill>
          </FilterGroup>

          <FilterGroup label="Due">
            {[["today", "Today"], ["week", "This week"], ["none", "No date"]].map(([k, label]) => (
              <Pill key={k} on={filters.due === k} onClick={() => setFilter({ due: filters.due === k ? null : k })}>
                {label}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="Priority">
            {Object.entries(PRIORITY).map(([k, p]) => (
              <Pill key={k} on={filters.priority === k} color={p.color}
                onClick={() => setFilter({ priority: filters.priority === k ? null : k })}>
                {p.label}
              </Pill>
            ))}
          </FilterGroup>

          <FilterGroup label="Pillar">
            {PILLARS.map((p) => (
              <Pill key={p.id} on={filters.pillarId === p.id} color={p.color}
                onClick={() => setFilter({ pillarId: filters.pillarId === p.id ? null : p.id })}>
                {p.name}
              </Pill>
            ))}
          </FilterGroup>

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            {/* Counts what the list will actually show. scoped includes completed tasks, which
                are hidden unless you ask for them, so quoting that number reads as a bug. */}
            <p style={{ color: C.muted, fontSize: 12.5, margin: "0 0 4px" }}>
              {openCount} open task{openCount === 1 ? "" : "s"} match
            </p>
            <p style={{ color: C.faint, fontSize: 11.5, margin: 0, lineHeight: 1.5 }}>
              {describeFilters(filters, { lists, pillars: PILLARS })}
            </p>
          </div>

          {filterCount > 0 && onSaveView && (
            <div>
              <div style={styles.fieldShell}>
                <Bookmark size={13} color={C.muted} />
                <input
                  value={saveName} onChange={(e) => setSaveName(e.target.value)}
                  placeholder={describeFilters(filters, { lists, pillars: PILLARS })}
                  style={{ ...styles.bareInput, flex: 1, fontSize: 13 }}
                />
              </div>
              <button
                onClick={() => {
                  onSaveView(newView(filters, saveName || describeFilters(filters, { lists, pillars: PILLARS })));
                  setSaveName("");
                  setFilterOpen(false);
                }}
                style={{ ...styles.ghostCta, height: 42, marginTop: 8, fontSize: 13 }}
              >
                <Bookmark size={14} /> Save as a view
              </button>
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setFilters({ ...EMPTY_FILTERS, listId, query })}
              style={{ ...styles.ghostCta, height: 44, flex: 1, fontSize: 13 }}>
              Clear
            </button>
            <button onClick={() => setFilterOpen(false)} style={{ ...styles.cta, flex: 1, marginTop: 0 }}>
              Done
            </button>
          </div>
        </div>
      </Sheet>

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
        {savedViews.length > 0 && onDeleteView && (
          <div style={{ marginBottom: 18 }}>
            <p style={{ color: C.muted, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 8px" }}>
              Saved views
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {savedViews.map((v) => (
                <div key={v.id} style={{
                  display: "flex", alignItems: "center", gap: 9, background: C.surface,
                  border: `1px solid ${C.border}`, borderRadius: R.md, padding: "10px 12px",
                }}>
                  <Bookmark size={13} color={C.purple} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", color: C.text, fontSize: 13 }}>{v.name}</span>
                    <span style={{ display: "block", color: C.faint, fontSize: 10.5, marginTop: 2 }}>
                      {describeFilters(v.filters, { lists, pillars: PILLARS })}
                    </span>
                  </div>
                  <button onClick={() => onDeleteView(v.id)} title={`Delete ${v.name}`} style={{
                    background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2,
                  }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
