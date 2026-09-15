import React, { useMemo, useState } from "react";
import {
  CalendarRange, ChevronLeft, ChevronRight, Flag, Gauge, Link2, Plus, Target, Trash2, X,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PILLARS, P_BY_ID } from "../data/constants.js";
import { addDays, longDate, prettyDate, todayStr } from "../lib/date.js";
import { isDone } from "../lib/tasks.js";
import {
  MAX_FOCUS, capacityOf, capacitySummary, goalHorizon, goalProgress, habitLoad, planFor,
  tasksDueBetween, weekEnd, weekStart, weekTitle,
} from "../lib/planning.js";
import {
  Card, Checkbox, EmptyState, IconButton, Pill, ProgressBar, SectionLabel,
} from "../components/ui.jsx";

export default function PlanView({
  state, onSavePlan, onAddGoal, onUpdateGoal, onRemoveGoal, onOpenTask, onBack,
}) {
  const { tasks, dayLog, goals, weekPlans } = state;
  const [weekKey, setWeekKey] = useState(weekStart(todayStr()));
  const [priority, setPriority] = useState("");
  const [priorityGoal, setPriorityGoal] = useState(null);
  const [goalText, setGoalText] = useState("");
  const [goalPillar, setGoalPillar] = useState(PILLARS[0].id);
  const [goalDate, setGoalDate] = useState("");
  const [goalWhy, setGoalWhy] = useState("");
  const [openGoal, setOpenGoal] = useState(null);

  const plan = planFor(weekPlans, weekKey);
  const load = useMemo(() => habitLoad(tasks, weekKey), [tasks, weekKey]);
  const capacity = useMemo(() => capacitySummary(load), [load]);
  const due = useMemo(
    () => tasksDueBetween(tasks, weekKey, weekEnd(weekKey)), [tasks, weekKey]);
  const openGoals = goals.filter((g) => !g.done);

  const savePriorities = (priorities) => onSavePlan(weekKey, { ...plan, priorities });

  const addPriority = () => {
    if (!priority.trim() || plan.priorities.length >= 3) return;
    savePriorities([...plan.priorities, {
      id: `p-${Date.now()}`, text: priority.trim(), goalId: priorityGoal, done: false,
    }]);
    setPriority("");
    setPriorityGoal(null);
  };

  const addGoal = () => {
    if (!goalText.trim()) return;
    onAddGoal({
      id: Date.now(), text: goalText.trim(), pillar: goalPillar, why: goalWhy.trim(),
      targetDate: goalDate || null, done: false, notes: "", subtasks: [], starred: false,
      createdAt: Date.now(),
    });
    setGoalText(""); setGoalWhy(""); setGoalDate("");
  };

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}><ChevronLeft size={18} /> Back</button>
      <p style={styles.eyebrow}>Decide before the week decides for you</p>
      <h1 style={styles.h1}>Plan</h1>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md,
        padding: "8px 10px", marginBottom: 14,
      }}>
        <IconButton onClick={() => setWeekKey(addDays(weekKey, -7))} title="Previous week">
          <ChevronLeft size={16} />
        </IconButton>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{weekTitle(weekKey)}</p>
          <p style={{ color: C.faint, fontSize: 10.5, margin: "2px 0 0" }}>
            {prettyDate(weekKey)} – {prettyDate(weekEnd(weekKey))}
          </p>
        </div>
        <IconButton onClick={() => setWeekKey(addDays(weekKey, 7))} title="Next week">
          <ChevronRight size={16} />
        </IconButton>
      </div>

      {/* ---- Priorities ---- */}
      <SectionLabel>The three that matter</SectionLabel>
      <Card flip>
        {plan.priorities.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: "0 0 12px" }}>
            Name at most three things that would make this week a win. Everything else is
            traffic — if all of it matters equally, none of it does.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
            {plan.priorities.map((p, i) => {
              const goal = p.goalId ? goals.find((g) => g.id === p.goalId) : null;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "7px 0" }}>
                  <Checkbox checked={p.done} size={21}
                    onClick={() => savePriorities(plan.priorities.map((x) =>
                      x.id === p.id ? { ...x, done: !x.done } : x))} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      color: p.done ? C.faint : C.text, fontSize: 14,
                      textDecoration: p.done ? "line-through" : "none",
                    }}>
                      <b style={{ color: C.gold, marginRight: 6 }}>{i + 1}</b>{p.text}
                    </span>
                    {goal && (
                      <span style={{
                        ...styles.tag, display: "inline-flex", marginTop: 6,
                        color: P_BY_ID[goal.pillar]?.color,
                        background: alpha(P_BY_ID[goal.pillar]?.color || C.gold, 0.13),
                      }}>
                        <Target size={9} /> {goal.text}
                      </span>
                    )}
                  </div>
                  <button onClick={() => savePriorities(plan.priorities.filter((x) => x.id !== p.id))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2 }}>
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {plan.priorities.length < 3 && (
          <>
            <div style={{ display: "flex", gap: 6 }}>
              <input value={priority} onChange={(e) => setPriority(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPriority()}
                placeholder={`Priority ${plan.priorities.length + 1} of 3`}
                style={{ ...styles.input, flex: 1, fontSize: 13.5 }} />
              <button onClick={addPriority} title="Add priority" style={styles.addBtn}><Plus size={18} /></button>
            </div>
            {openGoals.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                <span style={{ color: C.faint, fontSize: 11, alignSelf: "center" }}>Toward:</span>
                {openGoals.slice(0, 4).map((g) => (
                  <Pill key={g.id} on={priorityGoal === g.id} color={P_BY_ID[g.pillar]?.color}
                    onClick={() => setPriorityGoal(priorityGoal === g.id ? null : g.id)}>
                    {g.text}
                  </Pill>
                ))}
              </div>
            )}
          </>
        )}

        <textarea value={plan.note || ""} rows={2} placeholder="What could get in the way this week?"
          onChange={(e) => onSavePlan(weekKey, { ...plan, note: e.target.value })}
          style={{ ...styles.input, marginTop: 12, resize: "none", fontSize: 12.5, lineHeight: 1.55 }} />
      </Card>

      {/* ---- Capacity ---- */}
      <SectionLabel>What you've committed to</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 5 }}>
          {load.map((d) => {
            const cap = capacityOf(d.count);
            const color = !cap ? C.surface2
              : cap.tone === "bad" ? C.red : cap.tone === "warn" ? C.gold : C.green;
            const isToday = d.date === todayStr();
            return (
              <div key={d.date} style={{ flex: 1, textAlign: "center" }}>
                <div title={d.items.map((t) => t.text).join(", ")} style={{
                  height: 54, borderRadius: 9,
                  background: alpha(color, d.count ? 0.18 : 0.3),
                  border: `1px solid ${isToday ? alpha(C.gold, 0.5) : d.count ? alpha(color, 0.4) : C.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <span style={{ color: d.count ? color : C.faint, fontSize: 15, fontFamily: F.display, fontWeight: 600 }}>
                    {d.count}
                  </span>
                </div>
                <span style={{ color: isToday ? C.gold : C.muted, fontSize: 10, display: "block", marginTop: 5 }}>
                  {d.label.slice(0, 1)}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <Gauge size={14} color={capacity.overloaded.length ? C.red : C.muted} />
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: 0 }}>
            {capacity.total === 0
              ? "No habits scheduled this week."
              : capacity.overloaded.length
                ? <>
                    <b style={{ color: C.red }}>
                      {capacity.overloaded.map((d) => d.label).join(", ")}
                    </b>{" "}
                    {capacity.overloaded.length === 1 ? "is" : "are"} carrying more than six habits.
                    That's the shape of a week you abandon by Wednesday — move something.
                  </>
                : <>{capacity.total} habit reps across the week, {capacity.average} a day on average.
                    Busiest is {capacity.busiest.label} with {capacity.busiest.count}.</>}
          </p>
        </div>
      </Card>

      {/* ---- Due this week ---- */}
      <SectionLabel>Due this week · {due.length}</SectionLabel>
      {due.length === 0 ? (
        <Card>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, margin: 0 }}>
            Nothing dated in this week yet. Give your tasks dates and they'll line up here.
          </p>
        </Card>
      ) : (
        <Card style={{ padding: "8px 14px" }}>
          {due.map((t) => (
            <button key={t.id} onClick={() => onOpenTask(t)} style={{
              ...styles.row, width: "100%", background: "none", border: "none",
              cursor: "pointer", textAlign: "left",
            }}>
              <Checkbox checked={isDone(t, t.dueDate, dayLog)} size={19} onClick={(e) => { e?.stopPropagation?.(); }} />
              <span style={{
                flex: 1, minWidth: 0, color: t.done ? C.faint : C.text, fontSize: 13,
                textDecoration: t.done ? "line-through" : "none",
              }}>{t.text}</span>
              <span style={styles.tag}>{prettyDate(t.dueDate)}</span>
            </button>
          ))}
        </Card>
      )}

      {/* ---- Goals ---- */}
      <SectionLabel>Goals</SectionLabel>
      <Card>
        <input value={goalText} onChange={(e) => setGoalText(e.target.value)}
          placeholder="What are you actually working toward?"
          style={{ ...styles.input, fontSize: 13.5 }} />
        <input value={goalWhy} onChange={(e) => setGoalWhy(e.target.value)}
          placeholder="Why does it matter? (the bit you'll need on a bad week)"
          style={{ ...styles.input, marginTop: 8, fontSize: 12.5 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <div style={styles.fieldShell}>
            <CalendarRange size={13} color={C.muted} />
            <input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)}
              style={styles.bareInput} />
          </div>
          <button onClick={addGoal} title="Add goal" style={{ ...styles.addBtn, marginLeft: "auto" }}>
            <Plus size={18} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {PILLARS.map((p) => (
            <Pill key={p.id} on={goalPillar === p.id} color={p.color} onClick={() => setGoalPillar(p.id)}>
              {p.name}
            </Pill>
          ))}
        </div>
      </Card>

      {goals.length === 0 ? (
        <EmptyState Icon={Target} title="No goals yet"
          hint="A goal with a date and a reason beats a wish. Link habits and tasks to it and progress takes care of itself." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {goals.map((g) => {
            const p = P_BY_ID[g.pillar];
            const prog = goalProgress(g, tasks, dayLog);
            const horizon = goalHorizon(g);
            const isOpen = openGoal === g.id;
            const linkedTasks = tasks.filter((t) => t.goalId === g.id && !t.archivedAt);
            return (
              <Card key={g.id} style={{ marginBottom: 0, borderColor: g.done ? alpha(C.green, 0.3) : C.border }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                  <Checkbox checked={g.done} color={p?.color} size={22}
                    onClick={() => onUpdateGoal(g.id, { done: !g.done })} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      color: g.done ? C.faint : C.text, fontSize: 14.5, fontWeight: 550,
                      textDecoration: g.done ? "line-through" : "none",
                    }}>{g.text}</span>
                    <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                      {p && (
                        <span style={{ ...styles.tag, color: p.color, background: alpha(p.color, 0.13) }}>
                          <p.Icon size={9} /> {p.name}
                        </span>
                      )}
                      {horizon && (
                        <span style={{
                          ...styles.tag,
                          color: horizon.tone === "bad" ? C.red : horizon.tone === "warn" ? C.gold : C.muted,
                          background: alpha(horizon.tone === "bad" ? C.red : horizon.tone === "warn" ? C.gold : C.muted, 0.13),
                        }}>
                          <Flag size={9} /> {horizon.label}
                        </span>
                      )}
                      {prog.linked > 0 && (
                        <span style={styles.tag}><Link2 size={9} /> {prog.linked} linked</span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => onRemoveGoal(g.id)} style={{
                    background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 4,
                  }}><Trash2 size={15} /></button>
                </div>

                {g.why && (
                  <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.6, margin: "11px 0 0", fontStyle: "italic" }}>
                    “{g.why}”
                  </p>
                )}

                <div style={{ marginTop: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ color: C.muted, fontSize: 11 }}>
                      {prog.todos > 0
                        ? `${prog.doneTodos}/${prog.todos} tasks done`
                        : prog.habits > 0
                          ? `${prog.habits} habit${prog.habits === 1 ? "" : "s"} feeding it · ${prog.habitPct ?? 0}% kept`
                          : "Nothing linked yet"}
                    </span>
                    <span style={{ color: p?.color, fontSize: 11, fontWeight: 600 }}>{prog.pct}%</span>
                  </div>
                  <ProgressBar pct={prog.pct} color={p?.color || C.gold} height={5} />
                </div>

                {linkedTasks.length > 0 && (
                  <>
                    <button onClick={() => setOpenGoal(isOpen ? null : g.id)} style={{ ...styles.linkBtn, marginTop: 11 }}>
                      {isOpen ? "Hide" : "Show"} linked work
                    </button>
                    {isOpen && (
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                        {linkedTasks.map((t) => (
                          <button key={t.id} onClick={() => onOpenTask(t)} style={{
                            ...styles.row, width: "100%", background: "none", border: "none",
                            cursor: "pointer", textAlign: "left", padding: "6px 0",
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                              background: t.kind === "build" ? C.gold : C.blue,
                            }} />
                            <span style={{ flex: 1, color: C.text, fontSize: 12.5 }}>{t.text}</span>
                            <span style={styles.tag}>{t.kind === "build" ? "Habit" : "Task"}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p style={{ color: C.faint, fontSize: 10.5, marginTop: 20, lineHeight: 1.6 }}>
        Link a task or habit to a goal from its editor, and its progress feeds the bar above —
        so a goal is measured by the work you actually did, not a number you typed.
      </p>
    </div>
  );
}
