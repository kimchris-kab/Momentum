import React, { useState } from "react";
import { Check, Gauge } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { SRBAI_ITEMS, SRBAI_MAX, SRBAI_MIN } from "../lib/automaticity.js";
import { Sheet } from "./ui.jsx";

const SCALE = [1, 2, 3, 4, 5, 6, 7];

// The Self-Report Behavioural Automaticity Index, asked as it is validated: the same four
// items, the same 1-7 agreement scale, unreworded. The temptation is to soften it into
// something friendlier, but a rewritten instrument is a different instrument, and the whole
// value here is that this one has been checked against behaviour.
export default function SrbaiSheet({ open, task, onClose, onSubmit }) {
  if (!open || !task) return null;
  return <SrbaiBody key={task.id} task={task} onClose={onClose} onSubmit={onSubmit} />;
}

function SrbaiBody({ task, onClose, onSubmit }) {
  const [scores, setScores] = useState([null, null, null, null]);
  const answered = scores.filter((s) => s !== null).length;
  const complete = answered === SRBAI_ITEMS.length;

  const set = (i, v) => setScores((cur) => cur.map((s, j) => (j === i ? v : s)));

  return (
    <Sheet open onClose={onClose} title="How automatic is it?">
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16 }}>
        <Gauge size={16} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
        <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
          Doing a thing reliably and doing it <i>without deciding to</i> are different, and only
          the second one is a habit. Four questions, once a fortnight.
        </p>
      </div>

      <p style={{
        color: C.text, fontSize: 15, fontFamily: F.display, margin: "0 0 4px", lineHeight: 1.45,
      }}>
        “{task.text}” is something I…
      </p>
      <p style={{ color: C.faint, fontSize: 11, margin: "0 0 18px" }}>
        1 = strongly disagree · 7 = strongly agree
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {SRBAI_ITEMS.map((item, i) => (
          <div key={item}>
            <p style={{ color: C.text, fontSize: 13.5, margin: "0 0 9px", lineHeight: 1.45 }}>
              …{item}
            </p>
            <div style={{ display: "flex", gap: 4 }}>
              {SCALE.map((v) => {
                const on = scores[i] === v;
                return (
                  <button
                    key={v} onClick={() => set(i, v)}
                    aria-label={`${item}: ${v} of ${SRBAI_MAX}`}
                    aria-pressed={on}
                    style={{
                      flex: 1, height: 38, borderRadius: 10, cursor: "pointer",
                      fontSize: 13, fontWeight: 600, fontFamily: F.body,
                      border: `1px solid ${on ? C.gold : C.border}`,
                      background: on ? C.goldSoft : "transparent",
                      color: on ? C.gold : C.muted,
                    }}
                  >
                    {v}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => complete && onSubmit(task, scores)}
        disabled={!complete}
        style={{
          ...styles.cta, marginTop: 22,
          opacity: complete ? 1 : 0.45,
          cursor: complete ? "pointer" : "default",
        }}
      >
        <Check size={18} /> {complete ? "Save this reading" : `${answered} of ${SRBAI_ITEMS.length} answered`}
      </button>

      <p style={{ color: C.faint, fontSize: 10.5, lineHeight: 1.5, margin: "12px 0 0" }}>
        SRBAI (Gardner, Abraham, Lally &amp; de Bruijn, 2012). It's a self-report proxy, not a lab
        test — useful for tracking a habit's direction over time, not for settling whether
        something is "truly" automatic.
      </p>
    </Sheet>
  );
}

// Compact prompt used wherever a reading is due.
export function SrbaiPrompt({ tasks, onRate }) {
  if (!tasks?.length) return null;
  const first = tasks[0];
  return (
    <div style={{
      ...styles.card, marginBottom: 12,
      borderColor: alpha(C.gold, 0.28),
      background: `linear-gradient(135deg, ${alpha(C.gold, 0.07)}, ${C.surface})`,
    }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Gauge size={16} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
            Is “{first.text}” running itself yet?
          </p>
          <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "5px 0 0" }}>
            Four questions. It's how the app knows when to take the prompts away
            {tasks.length > 1 ? ` — ${tasks.length - 1} other${tasks.length > 2 ? "s" : ""} waiting too` : ""}.
          </p>
        </div>
      </div>
      <button onClick={() => onRate(first)} style={{ ...styles.linkBtn, color: C.gold, marginTop: 10 }}>
        <Gauge size={12} /> Rate it
      </button>
    </div>
  );
}
