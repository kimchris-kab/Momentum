import React, { useEffect, useMemo, useState } from "react";
import {
  Bell, BellOff, CalendarClock, ChevronDown, ChevronUp, Clock, Gift, Link2, MapPin, Plus,
  Repeat, Shuffle, Target, Timer, Trash2, X, Zap,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PILLARS, PRIORITY, WEEKDAYS } from "../data/constants.js";
import { addDays, formatTime12, todayStr } from "../lib/date.js";
import { dailyRule, describeRecurrence, monthlyRule, weeklyCountRule, weeklyRule } from "../lib/tasks.js";
import {
  CUE_BY_ID, CUE_TYPES, COMPETING_RESPONSE_HELP, DEFAULT_CUE, cueOf, frictionPrompt,
  implementationIntention,
} from "../lib/cues.js";
import {
  notificationPermission, reminderCapability, requestNotificationPermission,
} from "../lib/notify.js";
import { Checkbox, IconButton, Pill, SegmentedControl, Sheet } from "./ui.jsx";

const REPEAT_MODES = [
  { id: "none", label: "Never" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
];

// weeklyCount sits under "Weekly" rather than taking a fifth slot in the control: both are
// weekly patterns, and the real choice is whether the week names the days or just a count.
const repeatModeOf = (rec) => (!rec ? "none" : rec.freq === "weeklyCount" ? "weekly" : rec.freq);
const WEEKLY_SHAPES = [
  { id: "days", label: "On set days" },
  { id: "count", label: "Any days" },
];

function Field({ label, children }) {
  return (
    <div>
      <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </p>
      {children}
    </div>
  );
}

export default function TaskSheet({ open, task, lists, goals = [], onClose, onChange, onDelete, onStartFocus }) {
  const [subText, setSubText] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [perm, setPerm] = useState("default");
  const capability = useMemo(() => reminderCapability(), []);

  useEffect(() => { if (open) notificationPermission().then(setPerm); }, [open]);

  if (!open || !task) return null;

  const set = (patch) => onChange(task.id, patch);
  const repeatMode = repeatModeOf(task.recurrence);
  const cue = cueOf(task);
  const cueType = task.cueType || cue?.type || DEFAULT_CUE;
  const composed = implementationIntention({ ...task, cueType, cueDetail: task.cueDetail ?? cue?.detail });
  // Changing the anchor type shouldn't silently carry the old detail across — "after I brew
  // coffee" is not a place. A time cue also writes through to `time`, which reminders and
  // the day timeline already read.
  const setCueType = (type) => set({ cueType: type, cueDetail: type === cueType ? task.cueDetail : "" });
  const setCueDetail = (detail) => set(
    cueType === "time" ? { cueDetail: detail, time: detail || null } : { cueDetail: detail },
  );
  const weeklyShape = task.recurrence?.freq === "weeklyCount" ? "count" : "days";

  // A reminder needs permission, and the place someone asks for one is right here — not in a
  // settings screen they may never open.
  const askPermission = async () => {
    const result = await requestNotificationPermission();
    setPerm(result);
    if (result === "granted") set({ reminder: true });
  };
  const off = task.reminder === false || perm !== "granted";
  const reminderLabel = perm === "denied" ? "Notifications are blocked — enable them in system settings"
    : perm !== "granted" ? "Turn on reminders"
    : task.reminder === false ? "No reminder for this one"
    : task.time ? `Remind me at ${formatTime12(task.time)}` : "Set a time to be reminded";

  const setRepeat = (mode) => {
    // dropping a repeat shouldn't strand the task in "No date" — put it back on today
    if (mode === "none") return set({ recurrence: null, dueDate: task.dueDate || todayStr() });
    if (mode === "daily") return set({ recurrence: dailyRule(1), dueDate: null });
    if (mode === "monthly") {
      const day = task.dueDate ? Number(task.dueDate.slice(8, 10)) : new Date().getDate();
      return set({ recurrence: monthlyRule(day), dueDate: null });
    }
    const wk = task.recurrence?.weekdays?.length
      ? task.recurrence.weekdays
      : [WEEKDAYS[(new Date().getDay() + 6) % 7].key];
    set({ recurrence: weeklyRule(wk), dueDate: null });
  };

  const setWeeklyShape = (shape) => {
    if (shape === "count") return set({ recurrence: weeklyCountRule(task.recurrence?.timesPerWeek || 3) });
    const wk = task.recurrence?.weekdays?.length
      ? task.recurrence.weekdays
      : [WEEKDAYS[(new Date().getDay() + 6) % 7].key];
    set({ recurrence: weeklyRule(wk) });
  };

  const toggleWeekday = (key) => {
    const cur = task.recurrence?.weekdays || [];
    const next = cur.includes(key) ? cur.filter((d) => d !== key) : [...cur, key];
    set({ recurrence: { ...weeklyRule(next), ...task.recurrence, freq: "weekly", weekdays: next } });
  };

  const addSub = () => {
    if (!subText.trim()) return;
    set({ subtasks: [...(task.subtasks || []), { id: `s-${Date.now()}`, text: subText.trim(), done: false }] });
    setSubText("");
  };
  const toggleSub = (sid) => set({
    subtasks: (task.subtasks || []).map((s) => s.id === sid ? { ...s, done: !s.done } : s),
  });
  const removeSub = (sid) => set({ subtasks: (task.subtasks || []).filter((s) => s.id !== sid) });

  const quickDates = [
    { label: "Today", value: todayStr() },
    { label: "Tomorrow", value: addDays(todayStr(), 1) },
    { label: "Next week", value: addDays(todayStr(), 7) },
    { label: "None", value: null },
  ];

  return (
    <Sheet open={open} onClose={onClose} title="Edit task">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <input
          value={task.text}
          onChange={(e) => set({ text: e.target.value })}
          placeholder="Task name"
          style={{ ...styles.input, fontSize: 16, fontFamily: F.display, padding: "14px 15px" }}
        />

        <textarea
          value={task.notes || ""}
          onChange={(e) => set({ notes: e.target.value })}
          rows={2}
          placeholder="Add details…"
          style={{ ...styles.input, resize: "none", fontSize: 13, lineHeight: 1.55 }}
        />

        <Field label="Type">
          <SegmentedControl
            value={task.kind}
            onChange={(kind) => set({ kind })}
            options={[
              { id: "todo", label: "Task" },
              { id: "build", label: "Habit to build" },
              { id: "break", label: "Habit to avoid" },
            ]}
          />
        </Field>

        {!task.recurrence && (
          <Field label="Due">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {quickDates.map((q) => (
                <Pill key={q.label} on={task.dueDate === q.value} onClick={() => set({ dueDate: q.value })}>
                  {q.label}
                </Pill>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div style={styles.fieldShell}>
                <CalendarClock size={13} color={C.muted} />
                <input type="date" value={task.dueDate || ""}
                  onChange={(e) => set({ dueDate: e.target.value || null })} style={styles.bareInput} />
              </div>
              <div style={styles.fieldShell}>
                <Clock size={13} color={C.muted} />
                <input type="time" value={task.time || ""}
                  onChange={(e) => set({ time: e.target.value || null })} style={styles.bareInput} />
              </div>
            </div>
          </Field>
        )}

        <Field label="Repeat">
          <SegmentedControl options={REPEAT_MODES} value={repeatMode} onChange={setRepeat} />
          {repeatMode === "weekly" && (
            <>
              <SegmentedControl style={{ marginTop: 10 }} options={WEEKLY_SHAPES}
                value={weeklyShape} onChange={setWeeklyShape} />
              {weeklyShape === "days" ? (
                <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                  {WEEKDAYS.map((d) => {
                    const on = (task.recurrence?.weekdays || []).includes(d.key);
                    return (
                      <button key={d.key} onClick={() => toggleWeekday(d.key)} style={{
                        flex: 1, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                        fontFamily: F.body,
                        border: `1px solid ${on ? C.gold : C.border}`,
                        background: on ? C.goldSoft : "transparent",
                        color: on ? C.gold : C.muted,
                      }}>
                        {d.letter}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 5, marginTop: 10 }}>
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => {
                      const on = (task.recurrence?.timesPerWeek || 3) === n;
                      return (
                        <button key={n} onClick={() => set({ recurrence: weeklyCountRule(n) })} style={{
                          flex: 1, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 12.5, fontWeight: 600,
                          fontFamily: F.body,
                          border: `1px solid ${on ? C.gold : C.border}`,
                          background: on ? C.goldSoft : "transparent",
                          color: on ? C.gold : C.muted,
                        }}>{n}</button>
                      );
                    })}
                  </div>
                  <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.5, margin: "8px 0 0" }}>
                    {describeRecurrence(task.recurrence)} — any days you like. A week counts when you
                    hit the number, so a rest day never breaks the streak.
                  </p>
                </>
              )}
            </>
          )}
          {repeatMode === "daily" && (
            <div style={{ ...styles.fieldShell, marginTop: 10, width: "fit-content" }}>
              <Repeat size={13} color={C.muted} />
              <span style={{ color: C.muted, fontSize: 12.5 }}>Every</span>
              <input type="number" min={1} max={30} value={task.recurrence?.interval || 1}
                onChange={(e) => set({ recurrence: dailyRule(Math.max(1, Number(e.target.value) || 1)) })}
                style={{ ...styles.bareInput, width: 42 }} />
              <span style={{ color: C.muted, fontSize: 12.5 }}>day(s)</span>
            </div>
          )}
          {repeatMode === "monthly" && (
            <div style={{ ...styles.fieldShell, marginTop: 10, width: "fit-content" }}>
              <CalendarClock size={13} color={C.muted} />
              <span style={{ color: C.muted, fontSize: 12.5 }}>Day</span>
              <input type="number" min={1} max={31} value={task.recurrence?.monthDay || 1}
                onChange={(e) => set({ recurrence: monthlyRule(Math.min(31, Math.max(1, Number(e.target.value) || 1))) })}
                style={{ ...styles.bareInput, width: 42 }} />
            </div>
          )}
          {task.recurrence && (
            <div style={{ ...styles.fieldShell, marginTop: 10, width: "fit-content" }}>
              <Clock size={13} color={C.muted} />
              <input type="time" value={task.time || ""}
                onChange={(e) => set({ time: e.target.value || null })} style={styles.bareInput} />
            </div>
          )}
        </Field>

        {task.kind !== "todo" && (
          <Field label="Cue — what will set this off?">
            <SegmentedControl
              options={CUE_TYPES.map((c) => ({ id: c.id, label: c.tab }))}
              value={cueType}
              onChange={setCueType}
            />
            <div style={{ ...styles.fieldShell, marginTop: 10 }}>
              {cueType === "routine" ? <Link2 size={13} color={C.muted} />
                : cueType === "location" ? <MapPin size={13} color={C.muted} />
                : <Clock size={13} color={C.muted} />}
              <span style={{ color: C.muted, fontSize: 12.5, flexShrink: 0 }}>{CUE_BY_ID[cueType].prompt}</span>
              {cueType === "time" ? (
                <input type="time" value={task.cueDetail || task.time || ""}
                  onChange={(e) => setCueDetail(e.target.value)}
                  style={{ ...styles.bareInput, marginLeft: "auto" }} />
              ) : (
                <input value={task.cueDetail ?? (cue?.legacy ? cue.detail : "")}
                  onChange={(e) => setCueDetail(e.target.value)}
                  placeholder={CUE_BY_ID[cueType].placeholder}
                  style={{ ...styles.bareInput, flex: 1 }} />
              )}
            </div>
            <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.5, margin: "8px 0 0" }}>
              {CUE_BY_ID[cueType].help}
            </p>

            {composed && (
              <div style={{
                marginTop: 10, padding: "11px 13px", borderRadius: R.md,
                background: C.goldSoft, border: `1px solid ${alpha(C.gold, 0.28)}`,
              }}>
                <p style={{
                  color: C.gold, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 5px",
                }}>
                  Your plan
                </p>
                <input
                  value={task.intention ?? composed}
                  onChange={(e) => set({ intention: e.target.value })}
                  aria-label="Implementation intention"
                  style={{
                    ...styles.bareInput, width: "100%", color: C.text, fontSize: 13,
                    fontFamily: F.display, fontStyle: "italic", padding: 0,
                  }}
                />
              </div>
            )}
          </Field>
        )}

        <Field label="List">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {lists.map((l) => (
              <Pill key={l.id} on={task.listId === l.id} color={l.color} onClick={() => set({ listId: l.id })}>
                {l.name}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Priority">
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <Pill key={k} on={task.priority === k} color={v.color} onClick={() => set({ priority: k })}>
                <span style={{
                  display: "inline-block", width: 6, height: 6, borderRadius: 3,
                  background: v.color, marginRight: 5,
                }} />
                {v.label}
              </Pill>
            ))}
          </div>
        </Field>

        {task.kind === "build" && (
          <>
            <Field label="Start ritual">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={styles.fieldShell}>
                  <Zap size={13} color={C.muted} />
                  <input value={task.twoMin || ""} onChange={(e) => set({ twoMin: e.target.value || null })}
                    placeholder="Two-minute version" style={{ ...styles.bareInput, flex: 1, minWidth: 150 }} />
                </div>
                <div style={styles.fieldShell}>
                  <Timer size={13} color={C.muted} />
                  <input type="number" min={1} max={120} value={task.timerMinutes || ""}
                    onChange={(e) => set({ timerMinutes: Number(e.target.value) || null })}
                    placeholder="0" style={{ ...styles.bareInput, width: 40 }} />
                  <span style={{ color: C.muted, fontSize: 12.5 }}>min timer</span>
                </div>
              </div>
              <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0", lineHeight: 1.5 }}>
                Set either one and tapping this habit opens the start ritual instead of just ticking it off.
              </p>
            </Field>

            <Field label="Reward">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div style={styles.fieldShell}>
                  <Gift size={13} color={C.muted} />
                  <input value={task.reward?.text || ""}
                    onChange={(e) => set({ reward: { ...(task.reward || { atDays: 30 }), text: e.target.value } })}
                    placeholder="What you'll give yourself" style={{ ...styles.bareInput, flex: 1, minWidth: 150 }} />
                </div>
                <div style={styles.fieldShell}>
                  <span style={{ color: C.muted, fontSize: 12.5 }}>at</span>
                  <input type="number" min={1} max={365} value={task.reward?.atDays || 30}
                    onChange={(e) => set({
                      reward: { ...(task.reward || { text: "" }), atDays: Number(e.target.value) || 30 },
                    })}
                    style={{ ...styles.bareInput, width: 44 }} />
                  <span style={{ color: C.muted, fontSize: 12.5 }}>days</span>
                </div>
              </div>
            </Field>
          </>
        )}

        <Field label="Reminder">
          <button onClick={() => (perm === "granted" ? set({ reminder: task.reminder === false }) : askPermission())}
            style={{
              display: "flex", alignItems: "center", gap: 9, width: "100%", cursor: "pointer",
              background: off ? C.surface : C.goldSoft,
              border: `1px solid ${off ? C.border : alpha(C.gold, 0.35)}`,
              borderRadius: R.md, padding: "12px 13px", textAlign: "left",
            }}>
            {off ? <BellOff size={15} color={C.faint} /> : <Bell size={15} color={C.gold} />}
            <span style={{ flex: 1, color: off ? C.muted : C.text, fontSize: 13 }}>{reminderLabel}</span>
          </button>
          {!task.time && task.reminder !== false && (
            <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0", lineHeight: 1.5 }}>
              Give it a time above and you'll be nudged when it comes round.
            </p>
          )}
          {perm === "granted" && task.time && capability.level === "foreground" && (
            <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0", lineHeight: 1.5 }}>
              {capability.label}
            </p>
          )}
        </Field>

        {goals.filter((g) => !g.done).length > 0 && (
          <Field label="Works toward">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {goals.filter((g) => !g.done).map((g) => (
                <Pill key={g.id} on={task.goalId === g.id} color={C.gold}
                  onClick={() => set({ goalId: task.goalId === g.id ? null : g.id })}>
                  <Target size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{g.text}
                </Pill>
              ))}
            </div>
            <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0", lineHeight: 1.5 }}>
              Linking it means this goal's progress comes from work you actually finished.
            </p>
          </Field>
        )}

        <Field label="Identity this builds">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PILLARS.map((p) => (
              <Pill key={p.id} on={task.pillarId === p.id} color={p.color}
                onClick={() => set({ pillarId: task.pillarId === p.id ? null : p.id })}>
                <p.Icon size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{p.name}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label={`Subtasks${(task.subtasks || []).length ? ` · ${task.subtasks.filter((s) => s.done).length}/${task.subtasks.length}` : ""}`}>
          <div>
            {(task.subtasks || []).map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
                <Checkbox checked={s.done} onClick={() => toggleSub(s.id)} size={17} />
                <span style={{
                  flex: 1, color: s.done ? C.faint : C.text, fontSize: 13,
                  textDecoration: s.done ? "line-through" : "none",
                }}>{s.text}</span>
                <button onClick={() => removeSub(s.id)} style={{
                  background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2,
                }}><X size={12} /></button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <input value={subText} onChange={(e) => setSubText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSub()}
                placeholder="Add a subtask…"
                style={{ ...styles.input, flex: 1, fontSize: 12.5, padding: "9px 12px" }} />
              <IconButton onClick={addSub} title="Add subtask"><Plus size={15} /></IconButton>
            </div>
          </div>
        </Field>

        <button onClick={() => setAdvanced((a) => !a)} style={styles.linkBtn}>
          {advanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          Advanced — friction, bundling, the tiny version
        </button>

        {advanced && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* Friction is the master lever (Wood): take steps out of what you want, put
                steps into what you don't. */}
            <div style={styles.fieldShell}>
              <Shuffle size={13} color={task.kind === "break" ? C.red : C.muted} />
              <input value={task.friction || ""} onChange={(e) => set({ friction: e.target.value || null })}
                placeholder={frictionPrompt(task.kind).placeholder}
                style={{ ...styles.bareInput, flex: 1 }} />
            </div>
            <div style={styles.fieldShell}>
              <Gift size={13} color={C.muted} />
              <input value={task.bundle || ""} onChange={(e) => set({ bundle: e.target.value || null })}
                placeholder="Bundle with something you enjoy" style={{ ...styles.bareInput, flex: 1 }} />
            </div>
            <div style={styles.fieldShell}>
              <Zap size={13} color={C.muted} />
              <input value={task.twoMin || ""} onChange={(e) => set({ twoMin: e.target.value || null })}
                placeholder="2-minute version for hard days" style={{ ...styles.bareInput, flex: 1 }} />
            </div>
            {task.kind === "break" && (
              <>
                <div style={styles.fieldShell}>
                  <Zap size={13} color={C.red} />
                  <input value={task.trigger || ""} onChange={(e) => set({ trigger: e.target.value || null })}
                    placeholder="What usually triggers it?" style={{ ...styles.bareInput, flex: 1 }} />
                </div>
                <div style={styles.fieldShell}>
                  <Repeat size={13} color={C.green} />
                  <input value={task.competingResponse || ""}
                    onChange={(e) => set({ competingResponse: e.target.value || null })}
                    placeholder="Instead, I will…" style={{ ...styles.bareInput, flex: 1 }} />
                </div>
                <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.5, margin: "2px 0 0" }}>
                  {COMPETING_RESPONSE_HELP}
                </p>
              </>
            )}
          </div>
        )}

        {onStartFocus && task.kind !== "break" && (
          <button onClick={() => { onClose(); onStartFocus(task); }} style={{
            ...styles.ghostCta, height: 44, marginTop: 4, color: C.gold, borderColor: alpha(C.gold, 0.35),
          }}>
            <Timer size={14} /> Start a focus session
          </button>
        )}

        <button onClick={() => { onDelete(task.id); onClose(); }} style={{
          ...styles.ghostCta, height: 44, color: C.red, borderColor: alpha(C.red, 0.35), marginTop: 4,
        }}>
          <Trash2 size={14} /> Delete task
        </button>
      </div>
    </Sheet>
  );
}
