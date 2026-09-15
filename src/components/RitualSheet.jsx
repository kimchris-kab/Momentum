import React, { useEffect, useRef, useState } from "react";
import { Check, Flame, Pause, Pencil, Play, RotateCcw, Sparkles, Timer, Zap } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { P_BY_ID } from "../data/constants.js";
import { formatTime12 } from "../lib/date.js";
import { nextMilestone, rewardProgress } from "../lib/habits.js";
import { Sheet } from "./ui.jsx";

const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function RitualSheet({ open, task, streak, identity, onClose, onComplete, onEdit }) {
  const defaultSecs = Math.max(1, task?.timerMinutes || 2) * 60;
  const [secs, setSecs] = useState(defaultSecs);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState("full");
  const tick = useRef(null);

  useEffect(() => {
    if (!open) return;
    setSecs(Math.max(1, task?.timerMinutes || 2) * 60);
    setRunning(false);
    setMode("full");
  }, [open, task?.id, task?.timerMinutes]);

  useEffect(() => {
    if (!running) return undefined;
    tick.current = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) { clearInterval(tick.current); setRunning(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(tick.current);
  }, [running]);

  if (!open || !task) return null;

  const pillar = task.pillarId ? P_BY_ID[task.pillarId] : null;
  const identityLine = pillar && identity?.[pillar.id];
  const upcoming = nextMilestone(streak);
  const reward = rewardProgress(task, streak);
  const total = Math.max(1, task.timerMinutes || 2) * 60;
  const pct = ((total - secs) / total) * 100;

  const intention = task.stackAfter
    ? `After ${task.stackAfter}, I will ${task.text}${task.location ? ` in ${task.location}` : ""}`
    : task.time
      ? `I will ${task.text} at ${formatTime12(task.time)}${task.location ? ` in ${task.location}` : ""}`
      : task.location ? `I will ${task.text} in ${task.location}` : null;

  return (
    <Sheet open={open} onClose={onClose} title={null}>
      <div style={{ textAlign: "center", marginBottom: 6 }}>
        {pillar && (
          <span style={{
            ...styles.tag, color: pillar.color, background: alpha(pillar.color, 0.14), marginBottom: 10,
          }}>
            <pillar.Icon size={10} /> {pillar.name}
          </span>
        )}
        <h2 style={{ ...styles.h2, fontSize: 23, margin: "8px 0 0" }}>{task.text}</h2>
        {streak > 0 && (
          <p style={{ color: C.gold, fontSize: 12.5, margin: "8px 0 0", display: "flex",
            alignItems: "center", justifyContent: "center", gap: 5 }}>
            <Flame size={13} className="mtm-glow-pulse" /> {streak} in a row
            {upcoming && <span style={{ color: C.faint }}>· {upcoming - streak} to {upcoming}</span>}
          </p>
        )}
      </div>

      {identityLine && (
        <div style={{
          background: `linear-gradient(135deg, ${alpha(C.gold, 0.1)}, ${C.surface})`,
          border: `1px solid ${alpha(C.gold, 0.22)}`, borderRadius: R.md, padding: "14px 15px", margin: "16px 0",
        }}>
          <div style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
            <Sparkles size={15} color={C.gold} style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ color: C.text, fontSize: 13.5, lineHeight: 1.55, margin: 0, fontFamily: F.display, fontStyle: "italic" }}>
              “{identityLine}”
            </p>
          </div>
          <p style={{ color: C.faint, fontSize: 10.5, margin: "8px 0 0" }}>
            This is one more vote for that person.
          </p>
        </div>
      )}

      {intention && (
        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.6, textAlign: "center", margin: "0 0 16px" }}>
          {intention}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div style={{ position: "relative", width: 150, height: 150 }}>
          <svg width={150} height={150} style={{ transform: "rotate(-90deg)" }}>
            <circle cx={75} cy={75} r={68} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} />
            <circle
              cx={75} cy={75} r={68} fill="none" stroke={secs === 0 ? C.green : C.gold} strokeWidth={8}
              strokeLinecap="round" strokeDasharray={2 * Math.PI * 68}
              strokeDashoffset={2 * Math.PI * 68 - (pct / 100) * 2 * Math.PI * 68}
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
          }}>
            <span style={{ color: C.text, fontFamily: F.display, fontSize: 32, fontWeight: 600 }}>{mmss(secs)}</span>
            <span style={{ color: C.faint, fontSize: 10, letterSpacing: 0.5 }}>
              {secs === 0 ? "TIME'S UP" : running ? "IN PROGRESS" : "READY"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setRunning((r) => !r)} style={{
            ...styles.ghostCta, width: "auto", padding: "0 18px", height: 40, fontSize: 13,
            borderColor: alpha(C.gold, 0.4), color: C.gold,
          }}>
            {running ? <Pause size={14} /> : <Play size={14} />} {running ? "Pause" : secs === total ? "Start" : "Resume"}
          </button>
          <button onClick={() => { setRunning(false); setSecs(total); }} style={{
            ...styles.ghostCta, width: "auto", padding: "0 14px", height: 40, fontSize: 13,
          }}>
            <RotateCcw size={14} />
          </button>
        </div>
      </div>

      {task.twoMin && (
        <button onClick={() => setMode(mode === "min" ? "full" : "min")} style={{
          width: "100%", textAlign: "left", cursor: "pointer", marginBottom: 14,
          background: mode === "min" ? C.goldSoft : C.surface,
          border: `1px solid ${mode === "min" ? alpha(C.gold, 0.4) : C.border}`,
          borderRadius: R.md, padding: "13px 14px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Zap size={15} color={C.gold} />
            <div style={{ flex: 1 }}>
              <p style={{ color: mode === "min" ? C.gold : C.text, fontSize: 13, fontWeight: 600, margin: 0 }}>
                Too hard today? Do the two-minute version
              </p>
              <p style={{ color: C.muted, fontSize: 12, margin: "3px 0 0", lineHeight: 1.45 }}>{task.twoMin}</p>
            </div>
          </div>
        </button>
      )}

      {reward && (
        <p style={{ color: C.muted, fontSize: 12, textAlign: "center", margin: "0 0 14px", lineHeight: 1.5 }}>
          {reward.ready
            ? <><b style={{ color: C.gold }}>Reward unlocked:</b> {reward.text}</>
            : <>{reward.remaining} more to unlock: <b style={{ color: C.text }}>{reward.text}</b></>}
        </p>
      )}

      <button onClick={() => onComplete(task, mode === "min")} className="mtm-shimmer" style={{
        ...styles.cta, background: `linear-gradient(135deg, ${C.gold}, ${C.orange})`,
      }}>
        <Check size={19} /> {mode === "min" ? "Did the two-minute version" : "Done — mark it"}
      </button>

      <button onClick={() => { onEdit(task); onClose(); }} style={{ ...styles.linkBtn, margin: "14px auto 0" }}>
        <Pencil size={12} /> Edit this habit
      </button>
    </Sheet>
  );
}
