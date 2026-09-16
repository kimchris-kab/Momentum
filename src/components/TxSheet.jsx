import React, { useMemo, useState } from "react";
import {
  CalendarClock, Check, ChevronDown, ChevronUp, Delete, Keyboard, Repeat, Sparkles, Store, Trash2,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { BUDGET_CATS, RECUR_FREQ, TX_CAT_BY_ID } from "../data/constants.js";
import { txIcon } from "../data/txIcons.js";
import { moneyPrecise, todayStr } from "../lib/date.js";
import {
  amountSuggestions, evalAmount, isSum, payeeSuggestion, rankedCategories, txBucket,
} from "../lib/money.js";
import { Pill, SegmentedControl, Sheet } from "./ui.jsx";

const QUICK_CATS = 5;

function Field({ label, children, action }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 0 6px" }}>
        <p style={{ color: C.muted, fontSize: 10.5, margin: 0, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {label}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

// Applies one keypad press to the amount expression. Pure so the caller can push the
// result into both local draft state and the transaction in the same tick.
export function applyKey(draft, key) {
  const d = String(draft || "");
  const term = d.split("+").pop();

  if (key === "back") return d.slice(0, -1);
  if (key === "clear") return "";
  if (key === "+") return !d || d.endsWith("+") ? d : `${d}+`;
  if (key === ".") {
    if (term.includes(".")) return d;
    return term === "" ? `${d}0.` : `${d}.`;
  }
  if (key === "00") {
    if (term === "" || term === "0") return d;
    return applyKey(applyKey(d, "0"), "0");
  }
  // A digit. Cents cap at two places, and a lone leading zero is replaced rather than grown.
  const [, cents] = term.split(".");
  if (cents !== undefined && cents.length >= 2) return d;
  if (term === "0") return d.slice(0, -1) + key;
  return d + key;
}

function KeypadKey({ onClick, children, tint }) {
  return (
    <button
      onClick={onClick}
      style={{
        height: 46, borderRadius: R.md, cursor: "pointer", fontFamily: F.body,
        fontSize: 18, fontWeight: 500, color: tint || C.text,
        background: tint ? alpha(tint, 0.12) : C.surface2,
        border: `1px solid ${tint ? alpha(tint, 0.3) : C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

// Used for both a one-off transaction and a recurring rule — `mode` switches the
// date field between "when did this happen" and "when should this repeat".
export default function TxSheet(props) {
  if (!props.open || !props.tx) return null;
  // Remounting per open keeps the amount draft and disclosure state from leaking
  // between entries.
  return <TxSheetBody key={props.tx.id || "new"} {...props} />;
}

function TxSheetBody({ open, tx, mode = "tx", transactions = [], onClose, onChange, onDelete, onSave }) {
  const [draft, setDraft] = useState(tx.amount ? String(tx.amount) : "");
  const [keypad, setKeypad] = useState(!tx.id);
  const [showAllCats, setShowAllCats] = useState(false);

  const set = (patch) => onChange({ ...tx, ...patch });
  const bucket = tx.type === "expense" ? txBucket(tx) : null;
  const total = evalAmount(draft);

  const { ranked, all } = useMemo(
    () => rankedCategories(transactions, tx.type), [transactions, tx.type]);
  const quick = useMemo(() => {
    const ids = new Set();
    const base = [];
    [...ranked, ...all].forEach((c) => {
      if (ids.has(c.id) || base.length >= QUICK_CATS) return;
      ids.add(c.id);
      base.push(c);
    });
    // Whatever is selected stays reachable when the row is collapsed. Pinning it only when
    // it isn't already there keeps the row from reshuffling under the thumb.
    if (ids.has(tx.catId)) return base;
    const picked = all.find((c) => c.id === tx.catId);
    return picked ? [picked, ...base.slice(0, QUICK_CATS - 1)] : base;
  }, [ranked, all, tx.catId]);

  const suggestions = useMemo(
    () => amountSuggestions(transactions, { type: tx.type, catId: tx.catId }),
    [transactions, tx.type, tx.catId]);
  const payeeHint = useMemo(
    () => payeeSuggestion(transactions, tx.payee, tx.type), [transactions, tx.payee, tx.type]);
  const hintUseful = payeeHint && (payeeHint.catId !== tx.catId || payeeHint.amount !== tx.amount);

  const setAmount = (next) => {
    setDraft(next);
    set({ amount: evalAmount(next) });
  };
  const press = (key) => setAmount(applyKey(draft, key));
  const useSuggested = (amount) => setAmount(draft.endsWith("+") ? draft + amount : String(amount));

  const setType = (type) => {
    const fallback = type === "expense" ? "groceries" : "salary";
    set({ type, catId: fallback, category: type === "expense" ? TX_CAT_BY_ID[fallback].bucket : null });
  };
  const setCat = (catId) => set({
    catId,
    category: tx.type === "expense" ? TX_CAT_BY_ID[catId].bucket : null,
  });

  const catTile = (c) => {
    const Icon = txIcon(c.id);
    const on = tx.catId === c.id;
    return (
      <button
        key={c.id} onClick={() => setCat(c.id)} title={c.label}
        style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 5,
          padding: "9px 3px", borderRadius: R.md, cursor: "pointer", minWidth: 0,
          border: `1px solid ${on ? c.color : C.border}`,
          background: on ? alpha(c.color, 0.14) : C.surface,
        }}
      >
        <Icon size={16} color={on ? c.color : C.muted} />
        <span style={{
          fontSize: 9.5, lineHeight: 1.2, textAlign: "center", fontFamily: F.body,
          color: on ? c.color : C.muted, overflow: "hidden", textOverflow: "ellipsis",
          whiteSpace: "nowrap", maxWidth: "100%",
        }}>
          {c.label}
        </span>
      </button>
    );
  };

  const grid = (items) => (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
      {items.map(catTile)}
    </div>
  );

  return (
    <Sheet open={open} onClose={onClose} title={mode === "rule" ? "Recurring entry" : (tx.id ? "Edit entry" : "New entry")}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <SegmentedControl
          value={tx.type} onChange={setType}
          options={[{ id: "expense", label: "Expense" }, { id: "income", label: "Income" }]}
        />

        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8, background: C.surface2,
            border: `1px solid ${keypad ? alpha(C.gold, 0.4) : C.border}`, borderRadius: R.md,
            padding: "12px 14px",
          }}>
            <span style={{ color: tx.type === "income" ? C.gold : C.red, fontSize: 24, fontFamily: F.display }}>
              {tx.type === "income" ? "+" : "−"}
            </span>
            <input
              inputMode="decimal" value={draft} placeholder="0" readOnly={keypad}
              aria-label="Amount"
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.+]/g, ""))}
              style={{
                ...styles.bareInput, flex: 1, minWidth: 0, fontSize: 28, fontFamily: F.display,
                fontWeight: 600, color: C.text, padding: 0,
              }}
            />
            {isSum(draft) && (
              <span style={{ color: C.muted, fontSize: 13, whiteSpace: "nowrap" }}>= {moneyPrecise(total)}</span>
            )}
            <button
              onClick={() => setKeypad((k) => !k)} title={keypad ? "Use my keyboard" : "Use the keypad"}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex",
                color: keypad ? C.gold : C.muted,
              }}
            >
              <Keyboard size={16} />
            </button>
          </div>

          {suggestions.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, overflowX: "auto" }}>
              {suggestions.map((a) => (
                <Pill key={a} onClick={() => useSuggested(a)}>{moneyPrecise(a)}</Pill>
              ))}
            </div>
          )}

          {keypad && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 10,
            }}>
              {["1", "2", "3"].map((k) => <KeypadKey key={k} onClick={() => press(k)}>{k}</KeypadKey>)}
              <KeypadKey onClick={() => press("back")} tint={C.muted}><Delete size={17} /></KeypadKey>

              {["4", "5", "6"].map((k) => <KeypadKey key={k} onClick={() => press(k)}>{k}</KeypadKey>)}
              <KeypadKey onClick={() => press("+")} tint={C.muted}>+</KeypadKey>

              {["7", "8", "9"].map((k) => <KeypadKey key={k} onClick={() => press(k)}>{k}</KeypadKey>)}
              <KeypadKey onClick={() => press("00")} tint={C.muted}>00</KeypadKey>

              <KeypadKey onClick={() => press("clear")} tint={C.muted}>C</KeypadKey>
              <KeypadKey onClick={() => press("0")}>0</KeypadKey>
              <KeypadKey onClick={() => press(".")}>.</KeypadKey>
              <KeypadKey onClick={onSave} tint={C.gold}><Check size={18} /></KeypadKey>
            </div>
          )}
        </div>

        <Field
          label="Category"
          action={(
            <button
              onClick={() => setShowAllCats((s) => !s)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: 0,
                color: C.muted, fontSize: 11, fontFamily: F.body,
                display: "flex", alignItems: "center", gap: 3,
              }}
            >
              {showAllCats ? "Show less" : "All categories"}
              {showAllCats ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        >
          {showAllCats ? (
            tx.type === "expense" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {BUDGET_CATS.map((b) => {
                  const items = all.filter((c) => c.bucket === b.id);
                  if (!items.length) return null;
                  return (
                    <div key={b.id}>
                      <p style={{
                        color: b.color, fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase",
                        margin: "0 0 6px", fontWeight: 600,
                      }}>
                        {b.label}
                      </p>
                      {grid(items)}
                    </div>
                  );
                })}
              </div>
            ) : grid(all)
          ) : grid(quick)}

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
          {hintUseful && (
            <button
              onClick={() => {
                setDraft(String(payeeHint.amount));
                set({
                  payee: payeeHint.payee,
                  catId: payeeHint.catId,
                  amount: payeeHint.amount,
                  category: tx.type === "expense" ? (TX_CAT_BY_ID[payeeHint.catId]?.bucket || "wants") : null,
                });
              }}
              style={{
                display: "flex", alignItems: "center", gap: 6, marginTop: 8, width: "100%",
                background: C.goldSoft, border: `1px solid ${alpha(C.gold, 0.3)}`, borderRadius: R.sm,
                padding: "8px 10px", cursor: "pointer", color: C.gold, fontSize: 11.5,
                fontFamily: F.body, textAlign: "left",
              }}
            >
              <Sparkles size={12} />
              Last time: {TX_CAT_BY_ID[payeeHint.catId]?.label || "—"} · {moneyPrecise(payeeHint.amount)} — use it
            </button>
          )}
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
