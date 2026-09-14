import React, { useState } from "react";
import { CalendarClock, Repeat, Store, Trash2 } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { BUDGET_CATS, RECUR_FREQ, TX_CATEGORIES, TX_CAT_BY_ID } from "../data/constants.js";
import { todayStr } from "../lib/date.js";
import { txBucket } from "../lib/money.js";
import { Pill, SegmentedControl, Sheet } from "./ui.jsx";

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

// Used for both a one-off transaction and a recurring rule — `mode` switches the
// date field between "when did this happen" and "when should this repeat".
export default function TxSheet({ open, tx, mode = "tx", onClose, onChange, onDelete, onSave }) {
  if (!open || !tx) return null;

  const set = (patch) => onChange({ ...tx, ...patch });
  const cats = TX_CATEGORIES.filter((c) => c.type === tx.type);
  const bucket = tx.type === "expense" ? txBucket(tx) : null;

  const setType = (type) => {
    const fallback = type === "expense" ? "groceries" : "salary";
    set({ type, catId: fallback, category: type === "expense" ? TX_CAT_BY_ID[fallback].bucket : null });
  };
  const setCat = (catId) => set({
    catId,
    category: tx.type === "expense" ? TX_CAT_BY_ID[catId].bucket : null,
  });

  return (
    <Sheet open={open} onClose={onClose} title={mode === "rule" ? "Recurring entry" : (tx.id ? "Edit entry" : "New entry")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SegmentedControl
          value={tx.type} onChange={setType}
          options={[{ id: "expense", label: "Expense" }, { id: "income", label: "Income" }]}
        />

        <div style={{
          display: "flex", alignItems: "baseline", gap: 8, background: C.surface2,
          border: `1px solid ${C.border}`, borderRadius: R.md, padding: "14px 16px",
        }}>
          <span style={{ color: tx.type === "income" ? C.gold : C.red, fontSize: 24, fontFamily: F.display }}>
            {tx.type === "income" ? "+" : "−"}
          </span>
          <input
            autoFocus inputMode="decimal" value={tx.amount || ""} placeholder="0"
            onChange={(e) => set({ amount: +e.target.value.replace(/[^0-9.]/g, "") || 0 })}
            style={{
              ...styles.bareInput, flex: 1, fontSize: 28, fontFamily: F.display, fontWeight: 600,
              color: C.text, padding: 0,
            }}
          />
        </div>

        <Field label="Category">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {cats.map((c) => (
              <Pill key={c.id} on={tx.catId === c.id} color={c.color} onClick={() => setCat(c.id)}>
                {c.label}
              </Pill>
            ))}
          </div>
          {bucket && (
            <p style={{ color: C.faint, fontSize: 11, margin: "8px 0 0" }}>
              Counts toward{" "}
              <b style={{ color: BUDGET_CATS.find((b) => b.id === bucket)?.color }}>
                {BUDGET_CATS.find((b) => b.id === bucket)?.label}
              </b>{" "}
              in your budget split.
            </p>
          )}
        </Field>

        <Field label="Payee">
          <div style={styles.fieldShell}>
            <Store size={13} color={C.muted} />
            <input value={tx.payee || ""} onChange={(e) => set({ payee: e.target.value })}
              placeholder="Who was it paid to / from?" style={{ ...styles.bareInput, flex: 1 }} />
          </div>
        </Field>

        {mode === "tx" ? (
          <Field label="Date">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {[["Today", todayStr()], ["Yesterday", shift(-1)], ["2 days ago", shift(-2)]].map(([label, value]) => (
                <Pill key={label} on={tx.date === value} onClick={() => set({ date: value })}>{label}</Pill>
              ))}
            </div>
            <div style={styles.fieldShell}>
              <CalendarClock size={13} color={C.muted} />
              <input type="date" value={tx.date || todayStr()}
                onChange={(e) => set({ date: e.target.value || todayStr() })} style={styles.bareInput} />
            </div>
          </Field>
        ) : (
          <Field label="Repeats">
            <SegmentedControl options={RECUR_FREQ} value={tx.freq || "monthly"}
              onChange={(freq) => set({ freq })} />
            {(tx.freq || "monthly") === "monthly" && (
              <div style={{ ...styles.fieldShell, marginTop: 10, width: "fit-content" }}>
                <Repeat size={13} color={C.muted} />
                <span style={{ color: C.muted, fontSize: 12.5 }}>Day of month</span>
                <input type="number" min={1} max={31} value={tx.dayOfMonth || 1}
                  onChange={(e) => set({ dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })}
                  style={{ ...styles.bareInput, width: 44 }} />
              </div>
            )}
            <div style={{ ...styles.fieldShell, marginTop: 10 }}>
              <CalendarClock size={13} color={C.muted} />
              <span style={{ color: C.muted, fontSize: 12.5 }}>Starting</span>
              <input type="date" value={tx.startDate || todayStr()}
                onChange={(e) => set({ startDate: e.target.value || todayStr() })}
                style={{ ...styles.bareInput, marginLeft: "auto" }} />
            </div>
          </Field>
        )}

        <Field label="Note">
          <input value={tx.note || ""} onChange={(e) => set({ note: e.target.value })}
            placeholder="What was it for? (optional)" style={styles.input} />
        </Field>

        <button onClick={onSave} style={{ ...styles.cta, marginTop: 2 }}>
          {mode === "rule" ? "Save recurring entry" : "Save entry"}
        </button>

        {onDelete && (
          <button onClick={onDelete} style={{
            ...styles.ghostCta, height: 44, color: C.red, borderColor: alpha(C.red, 0.35),
          }}>
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
    </Sheet>
  );
}

function shift(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
