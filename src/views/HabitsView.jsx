import React, { useMemo, useState } from "react";
import { Ban, Flame, Plus, Repeat, Sprout } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { PRIORITY, WEEKDAYS } from "../data/constants.js";
import { formatTime12, todayStr } from "../lib/date.js";
import { describeRecurrence, habitStreak, isDone, occursOn, weeklyRule } from "../lib/tasks.js";
import { Card, EmptyState, IconButton, Pill, SegmentedControl, SectionLabel } from "../components/ui.jsx";

export default function HabitsView({ state, onAdd, onOpenTask, onBack }) {
  const { tasks, dayLog } = state;
  const [kind, setKind] = useState("build");
  const [text, setText] = useState("");
  const [days, setDays] = useState(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const [time, setTime] = useState("");
  const [prio, setPrio] = useState("high");

  const habits = useMemo(
    () => tasks.filter((t) => t.kind === kind && t.recurrence && !t.archivedAt),
    [tasks, kind]);

  const toggleDay = (k) => setDays((d) => d.includes(k) ? d.filter((x) => x !== k) : [...d, k]);

  const add = () => {
    if (!text.trim() || days.length === 0) return;
    onAdd({
      text: text.trim(),
      kind,
      priority: prio,
      time: time || null,
      recurrence: weeklyRule([...days]),
      startDate: todayStr(),
    });
    setText("");
    setTime("");
  };

  const accent = kind === "break" ? C.red : C.gold;

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}>Back</button>
      <h1 style={styles.h1}>Habits</h1>
      <p style={styles.lede}>
        Habits repeat on the days you pick and show up in your plan automatically. Building one
        feeds your streak; avoiding one keeps your clean days running.
      </p>

      <SegmentedControl
        value={kind}
        onChange={setKind}
        options={[{ id: "build", label: "Building" }, { id: "break", label: "Avoiding" }]}
        style={{ marginBottom: 16 }}
      />

      <Card>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={kind === "build" ? "e.g. Morning prayer, gym, read" : "e.g. Doomscrolling, late-night snacking"}
            style={{ ...styles.input, flex: 1, fontSize: 13.5 }} />
          <button onClick={add} style={{ ...styles.addBtn, background: accent }}><Plus size={18} /></button>
        </div>

        <p style={{ color: C.muted, fontSize: 10.5, margin: "12px 0 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
          Repeats on
        </p>
        <div style={{ display: "flex", gap: 5 }}>
          {WEEKDAYS.map((d) => {
            const on = days.includes(d.key);
            return (
              <button key={d.key} onClick={() => toggleDay(d.key)} style={{
                flex: 1, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
                fontFamily: F.body,
                border: `1px solid ${on ? accent : C.border}`,
                background: on ? alpha(accent, 0.14) : "transparent",
                color: on ? accent : C.muted,
              }}>{d.letter}</button>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
          <div style={styles.fieldShell}>
            <Repeat size={13} color={C.muted} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              style={styles.bareInput} />
          </div>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <Pill key={k} on={prio === k} color={v.color} onClick={() => setPrio(k)}>{v.label}</Pill>
          ))}
        </div>
      </Card>

      <SectionLabel>{kind === "build" ? "Building" : "Avoiding"} · {habits.length}</SectionLabel>

      {habits.length === 0 ? (
        <EmptyState
          Icon={kind === "build" ? Sprout : Ban}
          title={kind === "build" ? "No habits yet" : "Nothing on the avoid list"}
          hint={kind === "build"
            ? "Add one above — it'll appear in your plan on the days you chose."
            : "Name what you're cutting out and check it off each day you stay clean."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {habits.map((t) => {
            const streak = habitStreak(t, tasks, dayLog);
            const dueToday = occursOn(t, todayStr());
            return (
              <button key={t.id} onClick={() => onOpenTask(t)} style={{
                ...styles.card, marginBottom: 0, width: "100%", textAlign: "left", cursor: "pointer",
                borderColor: dueToday ? alpha(accent, 0.28) : C.border,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: PRIORITY[t.priority || "med"].color,
                  }} />
                  <span style={{ flex: 1, color: C.text, fontSize: 14, fontWeight: 550 }}>{t.text}</span>
                  {streak > 0 && (
                    <span style={{ ...styles.tag, color: C.gold, background: C.goldSoft }}>
                      <Flame size={9} /> {streak}
                    </span>
                  )}
                  {dueToday && (
                    <span style={{
                      ...styles.tag, color: isDone(t, todayStr(), dayLog) ? C.green : accent,
                      background: alpha(isDone(t, todayStr(), dayLog) ? C.green : accent, 0.14),
                    }}>
                      {isDone(t, todayStr(), dayLog) ? "Done today" : "Today"}
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 9 }}>
                  <span style={styles.tag}><Repeat size={9} /> {describeRecurrence(t.recurrence)}</span>
                  {t.time && <span style={styles.tag}>{formatTime12(t.time)}</span>}
                  {t.twoMin && <span style={styles.tag}>2-min: {t.twoMin}</span>}
                  {t.trigger && <span style={{ ...styles.tag, color: C.red, background: alpha(C.red, 0.12) }}>
                    Trigger: {t.trigger}
                  </span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
