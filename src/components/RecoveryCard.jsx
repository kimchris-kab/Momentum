import React from "react";
import { AlertTriangle, Snowflake, Undo2, Zap } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { addDays, todayStr } from "../lib/date.js";
import { FREEZES_PER_MONTH, freezesLeft } from "../lib/habits.js";

// Missing once is normal. Missing twice is how habits die — so this is deliberately the
// loudest thing on the screen the morning after, and it offers a way out rather than shame.
export default function RecoveryCard({ missed, freezes, streak, onFreeze, onRepair, onStartMinimal }) {
  if (!missed.length) return null;
  const left = freezesLeft(freezes);
  const yesterday = addDays(todayStr(), -1);
  const names = missed.map((t) => t.text);

  return (
    <div className="mtm-card-flip" style={{
      background: `linear-gradient(135deg, ${alpha(C.red, 0.12)}, ${C.surface})`,
      border: `1px solid ${alpha(C.red, 0.3)}`, borderRadius: R.lg, padding: 16, marginBottom: 12,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <AlertTriangle size={17} color={C.red} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 14.5, fontWeight: 650, margin: 0, fontFamily: F.display }}>
            Never miss twice
          </p>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "5px 0 0" }}>
            You missed {names.length === 1 ? <b style={{ color: C.text }}>{names[0]}</b> : `${names.length} habits`} yesterday
            {streak > 0 && <> — your {streak}-day chain is on the line.</>}
            {streak === 0 && <>. One rep today and you're building again.</>}
          </p>
        </div>
      </div>

      {names.length > 1 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "12px 0 0" }}>
          {names.map((n) => (
            <span key={n} style={{ ...styles.tag, color: C.red, background: alpha(C.red, 0.13) }}>{n}</span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {missed.some((t) => t.twoMin) && (
          <button onClick={() => onStartMinimal(missed.find((t) => t.twoMin))} style={{
            ...styles.cta, height: 46, fontSize: 14,
          }}>
            <Zap size={16} /> Do the two-minute version now
          </button>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onFreeze} disabled={left === 0} style={{
            ...styles.ghostCta, height: 42, fontSize: 12.5, flex: 1,
            opacity: left === 0 ? 0.45 : 1,
            borderColor: left === 0 ? C.border : alpha(C.teal, 0.4),
            color: left === 0 ? C.faint : C.teal,
            cursor: left === 0 ? "not-allowed" : "pointer",
          }}>
            <Snowflake size={14} /> Freeze ({left}/{FREEZES_PER_MONTH})
          </button>
          <button onClick={() => onRepair(yesterday)} style={{
            ...styles.ghostCta, height: 42, fontSize: 12.5, flex: 1,
          }}>
            <Undo2 size={14} /> I did do it
          </button>
        </div>
      </div>

      <p style={{ color: C.faint, fontSize: 10.5, margin: "10px 0 0", lineHeight: 1.5 }}>
        A freeze protects the chain without claiming you did the work. "I did do it" logs it
        honestly as a late entry.
      </p>
    </div>
  );
}
