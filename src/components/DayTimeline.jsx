import React, { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, Clock, Plus, Timer } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { pillarOf } from "../data/constants.js";
import { formatTime12 } from "../lib/date.js";
import {
  buildTimeline, fmtGap, suggestSlots, taskDuration, timeOf,
} from "../lib/timeline.js";
import { Card, SectionLabel } from "./ui.jsx";

const hourLabel = (mins) => formatTime12(timeOf(mins)).replace(":00", "");

// The shape of the day: what's pinned to a time, in what order, where the real gaps are, and
// where you currently are in it. Anything without a time sits in a tray underneath with
// one-tap slots, because the useful half of time-blocking is deciding when — not dragging.
export default function DayTimeline({ tasks, date, dayLog, onSchedule, onOpenTask, onFocus }) {
  const [open, setOpen] = useState(true);
  const [assigning, setAssigning] = useState(null);

  const tl = useMemo(() => buildTimeline(tasks, date, dayLog), [tasks, date, dayLog]);
  const slots = useMemo(
    () => (assigning ? suggestSlots(tasks, date, taskDuration(assigning)) : []),
    [assigning, tasks, date]);

  if (!tl.scheduled.length && !tl.unscheduled.length) return null;

  const summary = tl.scheduled.length
    ? `${tl.scheduled.length} timed · ${tl.freeAhead > 0 ? fmtGap(tl.freeAhead).replace(" free", " free ahead") : "nothing free left"}`
    : "Nothing pinned to a time yet";

  return (
    <>
      <SectionLabel>Your day</SectionLabel>
      <Card style={{ padding: "12px 14px" }}>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "Collapse your day" : "Expand your day"}
          style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", background: "none",
          border: "none", padding: 0, cursor: "pointer", textAlign: "left",
        }}>
          <CalendarClock size={14} color={C.muted} />
          <span style={{ flex: 1, color: C.muted, fontSize: 12 }}>{summary}</span>
          {open ? <ChevronUp size={14} color={C.faint} /> : <ChevronDown size={14} color={C.faint} />}
        </button>

        {open && tl.items.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {tl.items.map((item, i) => {
              if (item.kind === "now") {
                return (
                  <div key={`now-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "4px 0" }}>
                    <span style={{ width: 48, textAlign: "right", color: C.red, fontSize: 10, fontWeight: 600 }}>
                      now
                    </span>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: C.red, flexShrink: 0 }} />
                    <span style={{ flex: 1, height: 1, background: alpha(C.red, 0.45) }} />
                  </div>
                );
              }
              if (item.kind === "gap") {
                return (
                  <div key={`gap-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, margin: "5px 0" }}>
                    <span style={{ width: 48 }} />
                    <span style={{
                      width: 1, alignSelf: "stretch", minHeight: 16, marginLeft: 3,
                      borderLeft: `1px dashed ${C.faint}`,
                    }} />
                    <span style={{ color: C.faint, fontSize: 10.5, paddingLeft: 4 }}>{fmtGap(item.minutes)}</span>
                  </div>
                );
              }
              const t = item.task;
              const pillar = pillarOf(t.pillarId);
              const color = item.done ? C.green : pillar?.color || C.gold;
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "stretch", gap: 8, margin: "5px 0" }}>
                  <span style={{
                    width: 48, textAlign: "right", color: C.faint, fontSize: 10.5, paddingTop: 9,
                  }}>
                    {hourLabel(item.start)}
                  </span>
                  <span style={{ width: 3, borderRadius: 2, background: alpha(color, 0.65), flexShrink: 0 }} />
                  <button onClick={() => onOpenTask(t)} style={{
                    flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
                    background: item.overlap ? alpha(C.red, 0.07) : C.surface2,
                    border: `1px solid ${item.overlap ? alpha(C.red, 0.25) : C.border}`,
                    borderRadius: R.sm, padding: "7px 10px",
                  }}>
                    <span style={{
                      display: "block", color: item.done ? C.faint : C.text, fontSize: 12.5,
                      textDecoration: item.done ? "line-through" : "none",
                    }}>
                      {t.text}
                    </span>
                    <span style={{ display: "flex", gap: 6, marginTop: 3, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ color: C.faint, fontSize: 10 }}>{item.duration} min</span>
                      {item.overlap && (
                        <span style={{ color: C.red, fontSize: 10 }}>overlaps the one before</span>
                      )}
                    </span>
                  </button>
                  {!item.done && onFocus && (
                    <button onClick={() => onFocus(t)} title={`Focus on ${t.text}`} style={{
                      background: "none", border: "none", cursor: "pointer", color: C.faint,
                      padding: "0 2px", flexShrink: 0,
                    }}>
                      <Timer size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {open && tl.unscheduled.length > 0 && (
          <div style={{ marginTop: tl.items.length ? 14 : 10 }}>
            <p style={{
              color: C.muted, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase",
              margin: "0 0 7px",
            }}>
              No time yet · {tl.unscheduled.length}
            </p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {tl.unscheduled.map((t) => (
                <button key={t.id} onClick={() => setAssigning(assigning?.id === t.id ? null : t)} style={{
                  display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 10px",
                  borderRadius: R.pill, cursor: "pointer", fontSize: 11.5, fontFamily: F.body,
                  border: `1px solid ${assigning?.id === t.id ? C.gold : C.border}`,
                  background: assigning?.id === t.id ? C.goldSoft : "transparent",
                  color: assigning?.id === t.id ? C.gold : C.muted,
                  maxWidth: "100%",
                }}>
                  <Clock size={10} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.text}
                  </span>
                </button>
              ))}
            </div>

            {assigning && (
              <div style={{ marginTop: 10 }}>
                <p style={{ color: C.faint, fontSize: 11, margin: "0 0 7px" }}>
                  Give “{assigning.text}” a time — {taskDuration(assigning)} min:
                </p>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {slots.map((s) => (
                    <button key={s.time} onClick={() => { onSchedule(assigning, s.time); setAssigning(null); }}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 12px",
                        borderRadius: R.pill, cursor: "pointer", fontSize: 12, fontFamily: F.body,
                        border: `1px solid ${alpha(C.gold, 0.4)}`, background: C.goldSoft, color: C.gold,
                      }}>
                      <Plus size={11} /> {s.label}
                    </button>
                  ))}
                  {slots.length === 0 && (
                    <span style={{ color: C.faint, fontSize: 11.5 }}>
                      No room left today — try tomorrow, or shorten something.
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
