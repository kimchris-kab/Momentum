import React, { useMemo, useState } from "react";
import {
  ArrowRight, CalendarCheck, Check, ChevronLeft, Pause, Scissors, TrendingUp, Trash2, Zap,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { WEEKDAYS } from "../data/constants.js";
import { longDate, todayStr } from "../lib/date.js";
import { describeRecurrence } from "../lib/tasks.js";
import { VERDICTS, reviewHabits } from "../lib/habits.js";
import { Card, EmptyState, ProgressBar, SectionLabel } from "../components/ui.jsx";

const VERDICT_COLOR = {
  thriving: C.green, holding: C.teal, slipping: C.gold, stalled: C.red, new: C.muted,
};

export default function ReviewView({ state, onUpdateTask, onFinish, onBack }) {
  const { tasks, dayLog } = state;
  const rows = useMemo(() => reviewHabits(tasks, dayLog, 28), [tasks, dayLog]);
  const [actions, setActions] = useState({});
  const [twoMinDrafts, setTwoMinDrafts] = useState({});
  const [note, setNote] = useState("");

  const struggling = rows.filter((r) => r.verdict === "slipping" || r.verdict === "stalled");
  const thriving = rows.filter((r) => r.verdict === "thriving");

  const act = (id, kind) => setActions((a) => ({ ...a, [id]: a[id] === kind ? null : kind }));

  const applyAll = () => {
    const applied = [];
    rows.forEach(({ task }) => {
      const kind = actions[task.id];
      if (!kind) return;
      if (kind === "shrink") {
        const text = (twoMinDrafts[task.id] || "").trim();
        onUpdateTask(task.id, { twoMin: text || task.twoMin || `Just start ${task.text.toLowerCase()}` });
        applied.push({ taskId: task.id, text: task.text, action: "shrink" });
      }
      if (kind === "fewer") {
        const days = task.recurrence?.weekdays || [];
        const trimmed = days.length > 2 ? days.slice(0, Math.max(2, Math.ceil(days.length / 2))) : days;
        onUpdateTask(task.id, { recurrence: { ...task.recurrence, weekdays: trimmed } });
        applied.push({ taskId: task.id, text: task.text, action: "fewer days" });
      }
      if (kind === "pause") {
        onUpdateTask(task.id, { archivedAt: Date.now() });
        applied.push({ taskId: task.id, text: task.text, action: "paused" });
      }
      if (kind === "levelup") {
        const days = task.recurrence?.weekdays || [];
        const missing = WEEKDAYS.map((d) => d.key).filter((k) => !days.includes(k));
        if (missing.length) {
          onUpdateTask(task.id, { recurrence: { ...task.recurrence, weekdays: [...days, missing[0]] } });
        }
        applied.push({ taskId: task.id, text: task.text, action: "levelled up" });
      }
    });
    onFinish({ date: todayStr(), note: note.trim(), applied, reviewed: rows.length });
  };

  const actionCount = Object.values(actions).filter(Boolean).length;

  return (
    <div style={styles.page}>
      <button onClick={onBack} style={styles.back}><ChevronLeft size={18} /> Back</button>
      <p style={styles.eyebrow}>Weekly review</p>
      <h1 style={styles.h1}>Keep it honest</h1>
      <p style={styles.lede}>
        Habits don't fail because you're lazy — they fail because they were too big, on the wrong
        days, or at the wrong time. Here's the last four weeks. Fix what's slipping, then commit.
      </p>

      {rows.length === 0 ? (
        <EmptyState Icon={CalendarCheck} title="No habits to review yet"
          hint="Add a habit or two, give it a week, then come back here." />
      ) : (
        <>
          <Card flip style={{ display: "flex", gap: 10 }}>
            <Tile value={thriving.length} label="Thriving" color={C.green} />
            <Tile value={rows.filter((r) => r.verdict === "holding").length} label="Holding" color={C.teal} />
            <Tile value={struggling.length} label="Need a fix" color={struggling.length ? C.red : C.muted} />
          </Card>

          {struggling.length > 0 && <SectionLabel color={C.red}>Fix these · {struggling.length}</SectionLabel>}
          {struggling.map(({ task, pct, done, scheduled, verdict }) => (
            <Card key={task.id}>
              <HabitHeader task={task} pct={pct} done={done} scheduled={scheduled} verdict={verdict} />
              <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "10px 0 12px" }}>
                {VERDICTS[verdict].hint}
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Choice on={actions[task.id] === "shrink"} Icon={Zap} label="Make it 2 minutes"
                  onClick={() => act(task.id, "shrink")} />
                <Choice on={actions[task.id] === "fewer"} Icon={Scissors} label="Fewer days"
                  onClick={() => act(task.id, "fewer")} />
                <Choice on={actions[task.id] === "pause"} Icon={Pause} label="Pause it" danger
                  onClick={() => act(task.id, "pause")} />
              </div>
              {actions[task.id] === "shrink" && (
                <input
                  value={twoMinDrafts[task.id] ?? task.twoMin ?? ""}
                  onChange={(e) => setTwoMinDrafts((d) => ({ ...d, [task.id]: e.target.value }))}
                  placeholder={`The two-minute version of "${task.text}"`}
                  style={{ ...styles.input, marginTop: 10, fontSize: 13 }}
                />
              )}
              {actions[task.id] === "fewer" && (
                <p style={{ color: C.faint, fontSize: 11.5, margin: "10px 0 0", lineHeight: 1.5 }}>
                  Cuts {describeRecurrence(task.recurrence)} down to the first half of those days.
                  Easier to keep, and a kept habit beats an ambitious one.
                </p>
              )}
              {actions[task.id] === "pause" && (
                <p style={{ color: C.faint, fontSize: 11.5, margin: "10px 0 0", lineHeight: 1.5 }}>
                  Archives it — your history stays, it just stops showing up in your plan.
                </p>
              )}
            </Card>
          ))}

          {thriving.length > 0 && <SectionLabel color={C.green}>Working · {thriving.length}</SectionLabel>}
          {thriving.map(({ task, pct, done, scheduled, verdict }) => (
            <Card key={task.id}>
              <HabitHeader task={task} pct={pct} done={done} scheduled={scheduled} verdict={verdict} />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
                <Choice on={actions[task.id] === "levelup"} Icon={TrendingUp} label="Add another day"
                  onClick={() => act(task.id, "levelup")} />
              </div>
            </Card>
          ))}

          {rows.filter((r) => r.verdict === "holding" || r.verdict === "new").length > 0 && (
            <>
              <SectionLabel>Leave alone</SectionLabel>
              <Card style={{ padding: "10px 14px" }}>
                {rows.filter((r) => r.verdict === "holding" || r.verdict === "new").map(({ task, pct, verdict }) => (
                  <div key={task.id} style={styles.row}>
                    <span style={{
                      width: 7, height: 7, borderRadius: 4, background: VERDICT_COLOR[verdict], flexShrink: 0,
                    }} />
                    <span style={{ flex: 1, color: C.text, fontSize: 13 }}>{task.text}</span>
                    <span style={{ color: C.muted, fontSize: 11.5 }}>
                      {pct === null ? "new" : `${pct}%`}
                    </span>
                  </div>
                ))}
              </Card>
            </>
          )}

          <SectionLabel>One note to your next-week self</SectionLabel>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="What got in the way? What will you do differently?"
            style={{ ...styles.input, resize: "none", lineHeight: 1.6 }} />

          <button onClick={applyAll} style={{ ...styles.cta, marginTop: 16 }}>
            <Check size={18} />
            {actionCount > 0 ? `Apply ${actionCount} change${actionCount === 1 ? "" : "s"} & finish` : "Finish review"}
          </button>
          <p style={{ color: C.faint, fontSize: 11, textAlign: "center", margin: "10px 0 0" }}>
            Reviewed {longDate(todayStr())}
          </p>
        </>
      )}
    </div>
  );
}

function HabitHeader({ task, pct, done, scheduled, verdict }) {
  const color = VERDICT_COLOR[verdict];
  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 14.5, fontWeight: 600, margin: 0 }}>{task.text}</p>
          <p style={{ color: C.faint, fontSize: 11, margin: "3px 0 0" }}>
            {describeRecurrence(task.recurrence)}
          </p>
        </div>
        <span style={{ ...styles.tag, color, background: alpha(color, 0.14) }}>{VERDICTS[verdict].label}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", margin: "12px 0 6px" }}>
        <span style={{ color: C.muted, fontSize: 11.5 }}>Last 4 weeks</span>
        <span style={{ color, fontSize: 11.5, fontWeight: 600 }}>
          {pct === null ? "no data" : `${pct}% · ${done}/${scheduled}`}
        </span>
      </div>
      <ProgressBar pct={pct || 0} color={color} height={5} />
    </>
  );
}

function Choice({ on, Icon, label, onClick, danger }) {
  const color = danger ? C.red : C.gold;
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: R.pill,
      cursor: "pointer", fontSize: 12, fontFamily: F.body, fontWeight: 500,
      border: `1px solid ${on ? color : C.border}`,
      background: on ? alpha(color, 0.14) : "transparent",
      color: on ? color : C.muted,
    }}>
      <Icon size={13} /> {label}
    </button>
  );
}

function Tile({ value, label, color }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <p style={{ color, fontSize: 22, fontFamily: F.display, fontWeight: 600, margin: 0 }}>{value}</p>
      <p style={{ color: C.muted, fontSize: 9.5, margin: "3px 0 0", letterSpacing: 0.3, textTransform: "uppercase" }}>
        {label}
      </p>
    </div>
  );
}
