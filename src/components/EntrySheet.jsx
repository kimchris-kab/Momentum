import React from "react";
import { CalendarClock, Star, Trash2 } from "lucide-react";
import { C, R, alpha, styles } from "../theme.js";
import { JOURNAL_MOODS, PILLARS } from "../data/constants.js";
import { todayStr } from "../lib/date.js";
import { wordCount } from "../lib/journal.js";
import { Pill, Sheet } from "./ui.jsx";

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

export default function EntrySheet({ open, entry, onClose, onChange, onSave, onDelete }) {
  if (!open || !entry) return null;
  const set = (patch) => onChange({ ...entry, ...patch });
  const toggleMood = (id) => set({
    moods: (entry.moods || []).includes(id)
      ? entry.moods.filter((m) => m !== id)
      : [...(entry.moods || []), id],
  });

  const isGratitude = entry.kind === "gratitude";
  const words = wordCount(isGratitude ? (entry.items || []).join(" ") : entry.text);

  return (
    <Sheet open={open} onClose={onClose} title="Edit entry">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {entry.prompt && (
          <p style={{
            color: C.gold, fontSize: 12.5, lineHeight: 1.55, margin: 0, fontStyle: "italic",
            background: C.goldSoft, border: `1px solid ${alpha(C.gold, 0.22)}`,
            borderRadius: R.md, padding: "11px 13px",
          }}>
            {entry.prompt}
          </p>
        )}

        {isGratitude ? (
          <Field label="Three things">
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[0, 1, 2].map((i) => (
                <input key={i} value={(entry.items || [])[i] || ""}
                  onChange={(e) => {
                    const items = [...(entry.items || ["", "", ""])];
                    items[i] = e.target.value;
                    set({ items });
                  }}
                  placeholder={`Thing ${i + 1}`} style={{ ...styles.input, fontSize: 13.5 }} />
              ))}
            </div>
          </Field>
        ) : (
          <textarea value={entry.text || ""} onChange={(e) => set({ text: e.target.value })} rows={7}
            placeholder="Write freely…"
            style={{ ...styles.input, resize: "none", lineHeight: 1.65, fontSize: 14 }} />
        )}
        <p style={{ color: C.faint, fontSize: 10.5, margin: -6 }}>{words} word{words === 1 ? "" : "s"}</p>

        <Field label="How it felt">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {JOURNAL_MOODS.map((m) => (
              <Pill key={m.id} on={(entry.moods || []).includes(m.id)} onClick={() => toggleMood(m.id)}>
                {m.emoji} {m.label}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Area of life">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PILLARS.map((p) => (
              <Pill key={p.id} on={entry.pillarId === p.id} color={p.color}
                onClick={() => set({ pillarId: entry.pillarId === p.id ? null : p.id })}>
                <p.Icon size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{p.name}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Date">
          <div style={styles.fieldShell}>
            <CalendarClock size={13} color={C.muted} />
            <input type="date" value={entry.date || todayStr()}
              onChange={(e) => set({ date: e.target.value || todayStr() })} style={styles.bareInput} />
          </div>
        </Field>

        <button onClick={() => set({ favorite: !entry.favorite })} style={{
          display: "flex", alignItems: "center", gap: 9, width: "100%", cursor: "pointer",
          background: entry.favorite ? C.goldSoft : C.surface,
          border: `1px solid ${entry.favorite ? alpha(C.gold, 0.35) : C.border}`,
          borderRadius: R.md, padding: "12px 13px", textAlign: "left",
        }}>
          <Star size={15} color={entry.favorite ? C.gold : C.faint} fill={entry.favorite ? C.gold : "none"} />
          <span style={{ flex: 1, color: entry.favorite ? C.text : C.muted, fontSize: 13 }}>
            {entry.favorite ? "Starred — kept for re-reading" : "Star this entry"}
          </span>
        </button>

        <button onClick={onSave} style={styles.cta}>Save changes</button>
        <button onClick={onDelete} style={{
          ...styles.ghostCta, height: 44, color: C.red, borderColor: alpha(C.red, 0.35),
        }}>
          <Trash2 size={14} /> Delete entry
        </button>
      </div>
    </Sheet>
  );
}
