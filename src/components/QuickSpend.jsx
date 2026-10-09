import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { TX_CAT_BY_ID } from "../data/constants.js";
import { prettyDate, todayStr } from "../lib/date.js";
import { alternatives, readLine } from "../lib/capture.js";

const TONE = C.gold;

/**
 * One line, said the way you would say it: "lunch 12", "taxi 8.5 uber", "+5000 salary". What it understood is shown before
 * anything is saved, with the category as a tap to change, so a wrong guess costs one tap and never a visit to a form.
 */
export default function QuickSpend({ state, onAdd, compact = false }) {
  const [line, setLine] = useState("");
  const [cat, setCat] = useState(null);
  const read = useMemo(() => readLine(line, state), [line, state.transactions]); // eslint-disable-line react-hooks/exhaustive-deps
  const catId = cat || read?.catId;
  const alts = useMemo(() => (read ? alternatives(state, read.type, catId, 3) : []), [read?.type, catId, state.transactions]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    if (!read) return;
    onAdd({ ...read, catId });
    setLine(""); setCat(null);
  };

  return (
    <div style={{ ...styles.card, padding: compact ? 12 : 14, borderColor: alpha(TONE, 0.25) }}>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "flex", gap: 8 }}>
        <input value={line} onChange={(e) => { setLine(e.target.value); setCat(null); }} aria-label="Log a payment"
          placeholder="Spent something? lunch 12" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done"
          style={{ ...styles.input, flex: 1, fontSize: 14.5 }} />
        <button type="submit" disabled={!read} aria-label="Add this" style={{
          ...styles.cta, width: 46, height: 46, padding: 0, opacity: read ? 1 : 0.45, flexShrink: 0,
        }}><Plus size={18} /></button>
      </form>
      {read && (
        <div style={{ marginTop: 10 }}>
          <p style={{ color: C.text, fontSize: 13, fontWeight: 600, margin: 0 }} aria-live="polite">
            {read.type === "income" ? "+" : ""}{Number(read.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            <span style={{ color: C.muted, fontWeight: 500 }}> · {TX_CAT_BY_ID[catId]?.label || "Other"}{read.payee ? ` · ${read.payee}` : ""}{read.date !== todayStr() ? ` · ${prettyDate(read.date)}` : ""}</span>
          </p>
          {alts.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {alts.map((c) => (
                <button key={c.id} type="button" onClick={() => setCat(c.id)} style={{
                  padding: "5px 10px", borderRadius: R.pill, fontSize: 11.5, cursor: "pointer", fontFamily: F.body,
                  border: `1px solid ${C.border}`, background: "transparent", color: C.muted,
                }}>{c.label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
