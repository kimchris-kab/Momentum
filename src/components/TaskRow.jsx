import React from "react";
import {
  CalendarClock, ChevronDown, ChevronUp, Clock, Flame, ListTodo, Repeat, StickyNote, Star, Target,
  Timer, Zap,
} from "lucide-react";
import { C, R, alpha, styles } from "../theme.js";
import { PRIORITY, pillarOf } from "../data/constants.js";
import { formatTime12, isPastTime, relativeDateLabel, todayStr } from "../lib/date.js";
import { describeRecurrence, isFlexible, subtaskProgress } from "../lib/tasks.js";
import { Checkbox } from "./ui.jsx";

const KIND_COLOR = { todo: C.gold, build: C.gold, break: C.red };

export default function TaskRow({
  task, date = todayStr(), done, streak = 0, listChip, week = null, goal = null, onToggle, onOpen,
  onToggleStar, onFocus, onMoveUp, onMoveDown, showReorder,
}) {
  const overdue = (!task.recurrence && task.dueDate && task.dueDate < todayStr() && !done)
    || (isPastTime(task.time, date) && !done);
  const { done: subDone, total: subTotal } = subtaskProgress(task);
  const repeat = describeRecurrence(task.recurrence);
  const dateLabel = task.recurrence ? null : relativeDateLabel(task.dueDate);
  const pillar = pillarOf(task.pillarId);
  const accent = KIND_COLOR[task.kind] || C.gold;

  const chips = [];
  if (dateLabel) chips.push({
    key: "due", Icon: CalendarClock, text: overdue ? `Overdue · ${dateLabel}` : dateLabel, danger: overdue,
  });
  if (repeat) chips.push({ key: "rep", Icon: Repeat, text: repeat });
  if (task.time) chips.push({
    key: "time", Icon: Clock, text: formatTime12(task.time), danger: isPastTime(task.time, date) && !done,
  });
  if (subTotal > 0) chips.push({ key: "sub", Icon: ListTodo, text: `${subDone}/${subTotal}` });
  if (task.notes) chips.push({ key: "note", Icon: StickyNote, text: "Note" });
  // A quota habit's progress is the week, so show that rather than leaving the row silent
  // on the only number that decides whether it was kept.
  if (week) chips.push({
    key: "week", Icon: Target, text: `${week.done}/${week.target} this week`,
    color: week.met ? C.green : undefined,
  });
  if (streak > 0) chips.push({
    key: "streak", Icon: Flame, text: isFlexible(task) ? `${streak} wk` : String(streak), gold: true,
  });
  if (task.twoMin && !done) chips.push({ key: "2m", Icon: Zap, text: "2-min", gold: true });
  if (listChip) chips.push({ key: "list", dot: listChip.color, text: listChip.name });
  // Linking a task to a goal is only worth doing if you can see it where the work happens.
  if (goal) chips.push({ key: "goal", Icon: Target, text: goal.text, color: C.gold });
  if (pillar) chips.push({ key: "pillar", Icon: pillar.Icon, text: pillar.name, color: pillar.color });

  return (
    <div className="mtm-row-in" style={{
      display: "flex", alignItems: "flex-start", gap: 10,
      background: overdue ? alpha(C.red, 0.07) : "transparent",
      border: `1px solid ${overdue ? alpha(C.red, 0.22) : "transparent"}`,
      borderRadius: R.md, padding: overdue ? "10px 10px" : "8px 2px",
    }}>
      <Checkbox checked={done} onClick={onToggle} color={accent} danger={overdue} style={{ marginTop: 1 }}
        label={`${done ? "Undo" : "Complete"} ${task.text}`} />
      <span style={{
        width: 6, height: 6, borderRadius: 3, marginTop: 9, flexShrink: 0,
        background: PRIORITY[task.priority || "med"].color,
      }} />

      <button onClick={onOpen} style={{
        flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
      }}>
        <span style={{
          display: "block", color: done ? C.faint : C.text, fontSize: 13.5, lineHeight: 1.45,
          textDecoration: done ? "line-through" : "none",
        }}>
          {task.text}
        </span>
        {chips.length > 0 && (
          <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 6 }}>
            {chips.map((c) => (
              <span key={c.key} style={{
                ...styles.tag,
                color: c.danger ? C.red : c.gold ? C.gold : c.color || C.muted,
                background: c.danger ? alpha(C.red, 0.15) : c.gold ? C.goldSoft
                  : c.color ? alpha(c.color, 0.13) : C.surface2,
              }}>
                {c.dot && <span style={{ width: 5, height: 5, borderRadius: 3, background: c.dot }} />}
                {c.Icon && <c.Icon size={9} />} {c.text}
              </span>
            ))}
          </span>
        )}
      </button>

      {showReorder && (
        <span style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
          <button onClick={onMoveUp} disabled={!onMoveUp} style={{
            background: "none", border: "none", padding: 0, cursor: onMoveUp ? "pointer" : "default",
            color: onMoveUp ? C.faint : "transparent", lineHeight: 0,
          }}><ChevronUp size={13} /></button>
          <button onClick={onMoveDown} disabled={!onMoveDown} style={{
            background: "none", border: "none", padding: 0, cursor: onMoveDown ? "pointer" : "default",
            color: onMoveDown ? C.faint : "transparent", lineHeight: 0,
          }}><ChevronDown size={13} /></button>
        </span>
      )}

      {onFocus && !done && (
        <button onClick={onFocus} title={`Focus on ${task.text}`} style={{
          background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 1,
        }}>
          <Timer size={14} color={C.faint} />
        </button>
      )}

      <button onClick={onToggleStar} style={{
        background: "none", border: "none", cursor: "pointer", padding: 2, flexShrink: 0, marginTop: 1,
      }}>
        <Star size={14} color={task.starred ? C.gold : C.faint} fill={task.starred ? C.gold : "none"} />
      </button>
    </div>
  );
}
