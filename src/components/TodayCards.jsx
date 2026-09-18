import React, { useMemo } from "react";
import { Gauge, Link2, Timer, TrendingUp } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { fmtDuration, focusToday } from "../lib/focus.js";
import { automaticityReport, GRADUATION_MEAN } from "../lib/automaticity.js";
import { contextStability, cueOf, stabilityBand } from "../lib/cues.js";
import { Card, SectionLabel } from "./ui.jsx";

// Three cards for things the app now knows but Today could not see. Each one returns null
// until it has something worth saying — the screen is already long, and a card that renders
// "nothing yet" is just furniture.

const Stat = ({ value, label, color }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <p style={{
      color: color || C.text, fontFamily: F.display, fontSize: 22, fontWeight: 600, margin: 0,
    }}>
      {value}
    </p>
    <p style={{ color: C.faint, fontSize: 10.5, margin: "2px 0 0", lineHeight: 1.35 }}>{label}</p>
  </div>
);

/** Time actually spent today, from the focus log. */
export function FocusTodayCard({ state, onStartFocus, agenda = [] }) {
  const seconds = useMemo(() => focusToday(state.focusSessions), [state.focusSessions]);
  const sessions = useMemo(
    () => (state.focusSessions || []).filter((s) => s.date === new Date().toISOString().slice(0, 10)),
    [state.focusSessions]);
  if (!seconds) return null;

  const top = [...sessions].sort((a, b) => b.seconds - a.seconds)[0];
  const next = agenda.find((t) => !t.done);

  return (
    <>
      <SectionLabel>Focused today</SectionLabel>
      <Card style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <Stat value={fmtDuration(seconds)} label={`across ${sessions.length} session${sessions.length === 1 ? "" : "s"}`} color={C.gold} />
          {top && (
            <div style={{ flex: 1.4, minWidth: 0 }}>
              <p style={{
                color: C.text, fontSize: 12.5, margin: 0, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {top.taskText}
              </p>
              <p style={{ color: C.faint, fontSize: 10.5, margin: "3px 0 0" }}>
                most of it — {fmtDuration(top.seconds)}
              </p>
            </div>
          )}
        </div>
        {next && onStartFocus && (
          <button onClick={() => onStartFocus(next)} style={{ ...styles.linkBtn, color: C.gold, marginTop: 10 }}>
            <Timer size={12} /> Start another on “{next.text}”
          </button>
        )}
      </Card>
    </>
  );
}

/** Where habits sit between "doing it" and "not deciding to". */
export function AutomaticityCard({ state, onOpenHabits }) {
  const rows = useMemo(
    () => automaticityReport(state.tasks, state.srbai || [], state.dayLog),
    [state.tasks, state.srbai, state.dayLog]);
  const measured = rows.filter((r) => r.mean !== null);
  if (!measured.length) return null;

  const graduated = measured.filter((r) => r.status.id === "graduated");
  const climbing = measured.filter((r) => r.status.id !== "graduated");
  // The nearest one to graduating is the interesting one — it's the next thing to come off
  // the scaffolding.
  const nearest = [...climbing].sort((a, b) => b.mean - a.mean)[0];

  return (
    <>
      <SectionLabel>Becoming automatic</SectionLabel>
      <Card style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 14 }}>
          <Stat value={graduated.length} label={`graduated — no prompts needed`} color={C.green} />
          <Stat value={climbing.length} label="still forming" color={C.gold} />
        </div>
        {nearest && (
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "11px 0 0" }}>
            Closest to graduating: <b style={{ color: C.text }}>{nearest.task.text}</b> at{" "}
            {nearest.mean}/7 — {Math.max(0, Math.round((GRADUATION_MEAN - nearest.mean) * 10) / 10)} to go.
          </p>
        )}
        {onOpenHabits && (
          <button onClick={onOpenHabits} style={{ ...styles.linkBtn, color: C.muted, marginTop: 9 }}>
            <Gauge size={12} /> See all habits
          </button>
        )}
      </Card>
    </>
  );
}

/** Habits that are running on memory rather than on a cue. */
export function CueHealthCard({ state, onOpenTask }) {
  const weak = useMemo(() => {
    const habits = (state.tasks || []).filter((t) => t.kind === "build" && t.recurrence && !t.archivedAt);
    return habits
      .map((t) => {
        const cue = cueOf(t);
        const stability = contextStability(t, state.dayLog);
        const band = stabilityBand(stability.score);
        if (!cue) return { task: t, reason: "no cue at all" };
        if (band?.id === "scattered") return { task: t, reason: "happens at a different time every day" };
        return null;
      })
      .filter(Boolean);
  }, [state.tasks, state.dayLog]);

  if (!weak.length) return null;

  return (
    <>
      <SectionLabel>Running on memory</SectionLabel>
      <Card style={{ borderColor: alpha(C.orange, 0.25), padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Link2 size={15} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: 0 }}>
            {weak.length === 1 ? "This one is" : `These ${weak.length} are`} leaning on you
            remembering rather than on something that already happens. Anchoring a habit to an
            existing routine is the single strongest thing you can do for it.
          </p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 11 }}>
          {weak.slice(0, 3).map(({ task, reason }) => (
            <button key={task.id} onClick={() => onOpenTask(task)} style={{
              display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
              background: C.surface2, border: `1px solid ${C.border}`, borderRadius: R.md,
              padding: "9px 11px", cursor: "pointer",
            }}>
              <span style={{
                flex: 1, minWidth: 0, color: C.text, fontSize: 12.5, overflow: "hidden",
                textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {task.text}
              </span>
              <span style={{ color: C.orange, fontSize: 10.5, flexShrink: 0 }}>{reason}</span>
            </button>
          ))}
        </div>
        {weak.length > 3 && (
          <p style={{ color: C.faint, fontSize: 10.5, margin: "8px 0 0" }}>
            and {weak.length - 3} more
          </p>
        )}
      </Card>
    </>
  );
}

/** A compact "where the week stands" strip. */
export function WeekPulseCard({ state, heatmap }) {
  const last7 = (heatmap || []).slice(-7);
  if (last7.length < 7 || last7.every((d) => d.ratio === null)) return null;
  const kept = last7.filter((d) => d.ratio === 1).length;
  const partial = last7.filter((d) => d.ratio !== null && d.ratio > 0 && d.ratio < 1).length;

  return (
    <>
      <SectionLabel>This week</SectionLabel>
      <Card style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <Stat value={`${kept}/7`} label="clean sweeps" color={kept >= 5 ? C.green : C.gold} />
          <Stat value={partial} label="partial days" />
          <div style={{ flex: 1.2, display: "flex", gap: 3, alignItems: "flex-end", paddingTop: 6 }}>
            {last7.map((d) => (
              <span key={d.date} title={d.date} style={{
                flex: 1, height: 26, borderRadius: 3,
                background: d.ratio === null ? C.surface3
                  : d.ratio === 1 ? C.green
                  : d.ratio > 0 ? alpha(C.gold, 0.55) : alpha(C.red, 0.35),
              }} />
            ))}
          </div>
        </div>
      </Card>
    </>
  );
}

export const TODAY_CARDS = { FocusTodayCard, AutomaticityCard, CueHealthCard, WeekPulseCard };
