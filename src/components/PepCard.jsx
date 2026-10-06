import React, { useState } from "react";
import { Feather } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";

const WARM = C.gold;

/**
 * The day's ask: once a habit has gone three days clean, one line about what went well. It is shown
 * only when there's someone to ask — the app decides that, not this card — and it goes away the
 * moment a note is saved, so a day with a note in it is simply a day with no card.
 */
export default function PepCard({ candidate, onSave }) {
  const [text, setText] = useState("");
  const [later, setLater] = useState(false);
  if (later) return null;
  const { task, day } = candidate;
  const ready = text.trim().length > 0;

  return (
    <div role="group" aria-label="Write a note to yourself" style={{
      background: `linear-gradient(135deg, ${alpha(WARM, 0.1)}, ${C.surface})`,
      border: `1px solid ${alpha(WARM, 0.32)}`, borderRadius: R.lg, padding: 16, marginBottom: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Feather size={14} color={WARM} />
        <span style={{ color: WARM, fontSize: 11, fontWeight: 650, letterSpacing: 0.5, textTransform: "uppercase" }}>
          Day {day} clean · {task.text}
        </span>
      </div>
      <p style={{ color: C.text, fontSize: 15, fontWeight: 650, margin: "9px 0 4px", fontFamily: F.display, lineHeight: 1.35 }}>
        Write one thing you did well today.
      </p>
      <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "0 0 10px" }}>
        It comes back to you later, in your own words, on a day you need it.
      </p>
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={280}
        aria-label="A note to yourself" placeholder="e.g. I put the phone in the kitchen and it passed"
        style={{ ...styles.input, width: "100%", resize: "vertical", fontFamily: F.display, fontSize: 14.5, lineHeight: 1.45 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => ready && onSave({ taskId: task.id, text, day })} disabled={!ready}
          style={{ ...styles.cta, height: 42, fontSize: 13, flex: 1, opacity: ready ? 1 : 0.5 }}>
          <Feather size={15} /> Keep it
        </button>
        <button onClick={() => setLater(true)} style={{ ...styles.ghostCta, height: 42, fontSize: 12.5, width: 92 }}>Later</button>
      </div>
    </div>
  );
}
