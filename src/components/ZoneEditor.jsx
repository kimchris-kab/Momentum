import React, { useState } from "react";
import { Plus, ShieldAlert, X } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { WEEKDAYS } from "../data/constants.js";
import { ZONE_PRESETS, describeZone, newZone, zoneFromPreset, zoneProblem } from "../lib/redzone.js";
import { Pill } from "./ui.jsx";

const RED = C.red;

/**
 * Where someone says when a habit gets them: pick a ready-made stretch, or set days and a start and end.
 * More than one is fine (weeknights and Saturday afternoons are different problems). Used when a habit
 * is added and again when it's edited, so it takes the list and hands back a changed one and keeps
 * nothing of its own beyond the form being typed into.
 */
export default function ZoneEditor({ zones, onChange, compact = false }) {
  const [custom, setCustom] = useState(false);
  const [days, setDays] = useState(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  const [from, setFrom] = useState("22:00");
  const [to, setTo] = useState("00:00");
  const draft = { days, from, to };
  const problem = custom ? zoneProblem(draft) : null;

  const addPreset = (id) => {
    const z = zoneFromPreset(id);
    if (!z) return;
    // The same stretch twice is one stretch.
    if (zones.some((x) => x.from === z.from && x.to === z.to && x.days.join() === z.days.join())) return;
    onChange([...zones, z]);
  };

  return (
    <div role="group" aria-label="Red zones" style={{
      padding: compact ? "10px 11px" : "12px 12px 11px", borderRadius: R.md,
      background: alpha(RED, 0.05), border: `1px solid ${alpha(RED, 0.22)}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <ShieldAlert size={13} color={RED} />
        <p style={{ color: RED, fontSize: 10.5, fontWeight: 650, letterSpacing: 0.5, margin: 0, textTransform: "uppercase" }}>
          Red zone
        </p>
      </div>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "6px 0 9px" }}>
        When does it hit hardest? The app will be there for those hours: a plan before, a nudge during, and a check after.
      </p>

      {zones.length > 0 && (
        <ul style={{ listStyle: "none", margin: "0 0 9px", padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
          {zones.map((z) => (
            <li key={z.id} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: R.md,
              background: C.surface, border: `1px solid ${alpha(RED, 0.3)}`,
            }}>
              <span style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 13 }}>{describeZone(z)}</span>
              <button onClick={() => onChange(zones.filter((x) => x.id !== z.id))} aria-label={`Remove red zone: ${describeZone(z)}`}
                style={{ ...styles.iconBtn, width: 26, height: 26 }}>
                <X size={13} color={C.faint} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ZONE_PRESETS.map((p) => (
          <Pill key={p.id} on={false} color={RED} onClick={() => addPreset(p.id)} style={{ textAlign: "left" }}>
            <Plus size={11} style={{ verticalAlign: "-1px", marginRight: 4 }} />{p.label}
          </Pill>
        ))}
        <Pill on={custom} color={RED} onClick={() => setCustom((c) => !c)}>Set my own</Pill>
      </div>
      {zones.length === 0 && !custom && (
        <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0" }}>
          {ZONE_PRESETS[0].label}: {ZONE_PRESETS[0].sub.toLowerCase()}. Tap one to add it.
        </p>
      )}

      {custom && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${alpha(RED, 0.2)}` }}>
          <div style={{ display: "flex", gap: 5 }}>
            {WEEKDAYS.map((d) => {
              const on = days.includes(d.key);
              return (
                <button key={d.key} aria-pressed={on} aria-label={d.label || d.key}
                  onClick={() => setDays((cur) => (cur.includes(d.key) ? cur.filter((x) => x !== d.key) : [...cur, d.key]))}
                  style={{
                    flex: 1, height: 34, borderRadius: 10, cursor: "pointer", fontSize: 11.5, fontWeight: 600, fontFamily: F.body,
                    border: `1px solid ${on ? RED : C.border}`, background: on ? alpha(RED, 0.14) : "transparent", color: on ? RED : C.muted,
                  }}>{d.letter}</button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 9, alignItems: "center" }}>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ color: C.muted, fontSize: 11 }}>From</span>
              <input type="time" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Red zone starts"
                style={{ ...styles.input, padding: "8px 10px", fontSize: 13 }} />
            </label>
            <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ color: C.muted, fontSize: 11 }}>Until</span>
              <input type="time" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Red zone ends"
                style={{ ...styles.input, padding: "8px 10px", fontSize: 13 }} />
            </label>
          </div>
          <p style={{ color: C.faint, fontSize: 11, margin: "6px 0 0" }}>
            An end at or before the start runs into the next day, so 10 pm to 2 am works.
          </p>
          {problem && <p role="alert" style={{ color: C.red, fontSize: 11.5, margin: "6px 0 0" }}>{problem}</p>}
          <button disabled={!!problem} aria-label="Add this red zone"
            onClick={() => { onChange([...zones, newZone(draft)]); setCustom(false); }}
            style={{ ...styles.ghostCta, height: 38, marginTop: 10, fontSize: 12.5, opacity: problem ? 0.45 : 1 }}>
            <Plus size={14} /> Add this red zone
          </button>
        </div>
      )}
    </div>
  );
}
