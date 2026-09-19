import React, { useMemo, useState } from "react";
import {
  CalendarClock, Check, Radar, Repeat, Target, Trash2, TrendingDown, TrendingUp, Wallet, X,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { money, moneyPrecise, prettyDate } from "../lib/date.js";
import {
  STATUS_COPY, budgetCandidates, categoryBudgetStatus, safeToSpend, suggestBudget,
} from "../lib/budget.js";
import { findSubscriptions, subscriptionTotals } from "../lib/subscriptions.js";
import { Card, Pill, ProgressBar, SectionLabel } from "./ui.jsx";
import { txIcon } from "../data/txIcons.js";

const STATUS_COLOR = { over: C.red, fast: C.orange, onPace: C.green, slow: C.teal };

/**
 * What's left after what's already promised.
 *
 * The month card next to this one answers "what happened". This one answers the question
 * people actually ask a money app, which is whether they can spend something today.
 */
export function SafeToSpendCard({ state, mKey, today }) {
  const s = useMemo(() => safeToSpend(state, mKey, today), [state, mKey, today]);
  if (!s.hasBasis) {
    return (
      <Card style={{ borderColor: alpha(C.gold, 0.25) }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Wallet size={16} color={C.gold} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
              Safe to spend needs an income figure
            </p>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "5px 0 0" }}>
              Log some income this month, or put your monthly estimate in below — then this shows
              what's left after the bills that haven't come out yet.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const short = s.free < 0;
  return (
    <Card style={{
      borderColor: alpha(short ? C.red : C.green, 0.3),
      background: `linear-gradient(135deg, ${alpha(short ? C.red : C.green, 0.08)}, ${C.surface})`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7 }}>
          {s.isCurrentMonth ? "Safe to spend" : "Was left over"}
        </span>
        {s.isCurrentMonth && (
          <span style={{ color: C.faint, fontSize: 11 }}>
            {s.daysLeft} {s.daysLeft === 1 ? "day" : "days"} left
          </span>
        )}
      </div>
      <p style={{
        fontFamily: F.display, fontSize: 30, fontWeight: 600, margin: "8px 0 0",
        color: short ? C.red : C.green,
      }}>
        {short ? "−" : ""}{money(Math.abs(s.free))}
      </p>
      {s.isCurrentMonth && s.perDay !== null && (
        <p style={{ color: C.muted, fontSize: 12.5, margin: "4px 0 0" }}>
          {short
            ? `${money(Math.abs(s.perDay))} a day over, on today's numbers`
            : `${money(s.perDay)} a day for the rest of the month`}
        </p>
      )}

      <div style={{
        display: "flex", gap: 10, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}`,
      }}>
        <Leg label={s.incomeSource === "expected" ? "Income (est.)" : "Income in"} value={money(s.income)} color={C.gold} />
        <Leg label="Spent" value={money(s.spent)} color={C.text} />
        <Leg label="Still to go out" value={money(s.committed)} color={C.orange} />
      </div>

      {s.upcoming.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ color: C.muted, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 7px" }}>
            Still coming this month
          </p>
          {s.upcoming.slice(0, 4).map((o, i) => (
            <div key={`${o.rule.id}-${o.date}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
              <CalendarClock size={12} color={C.faint} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 12.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o.rule.payee || o.rule.note || "Recurring"}
              </span>
              <span style={{ color: C.faint, fontSize: 11 }}>{prettyDate(o.date)}</span>
              <span style={{ color: o.type === "income" ? C.gold : C.text, fontSize: 12.5, fontWeight: 600, minWidth: 52, textAlign: "right" }}>
                {o.type === "income" ? "+" : "−"}{money(o.amount)}
              </span>
            </div>
          ))}
          {s.upcoming.length > 4 && (
            <p style={{ color: C.faint, fontSize: 11, margin: "6px 0 0" }}>
              and {s.upcoming.length - 4} more
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

const Leg = ({ label, value, color }) => (
  <div style={{ flex: 1, minWidth: 0 }}>
    <p style={{ color, fontSize: 14.5, fontWeight: 600, margin: 0 }}>{value}</p>
    <p style={{ color: C.faint, fontSize: 10.5, margin: "2px 0 0" }}>{label}</p>
  </div>
);

/**
 * Per-category budgets, judged against how much of the month has gone.
 * A bar on its own says how much is left; the pace line says whether that's a problem.
 */
export function CategoryBudgets({ state, mKey, today, onEdit }) {
  const rows = useMemo(() => categoryBudgetStatus(state, mKey, today), [state, mKey, today]);

  return (
    <>
      <SectionLabel>Category budgets</SectionLabel>
      <Card>
        {rows.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 12px" }}>
            The split above covers needs, wants and savings. A budget on one category — eating out,
            shopping — is the one that changes a decision, because it's the one you can act on in
            the moment.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 13, marginBottom: 13 }}>
            {rows.map((r) => {
              const color = STATUS_COLOR[r.status];
              const Icon = txIcon(r.catId);
              return (
                <button key={r.catId} onClick={() => onEdit(r.catId)} style={{
                  background: "none", border: "none", padding: 0, textAlign: "left",
                  cursor: "pointer", width: "100%", display: "block",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <Icon size={12} color={r.color || C.muted} style={{ flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 12.5 }}>{r.label}</span>
                    <span style={{ color: r.status === "over" ? C.red : C.muted, fontSize: 11.5 }}>
                      {money(r.spent)} of {money(r.budget)}
                    </span>
                  </div>
                  <ProgressBar pct={Math.min(100, r.pct)} color={color} />
                  <p style={{ color: C.faint, fontSize: 10.5, margin: "5px 0 0", lineHeight: 1.5 }}>
                    {r.pct}% used, {r.elapsedPct}% of the month gone · {STATUS_COPY[r.status]}
                    {r.status !== "over" && r.elapsedPct < 100 && ` · heading for ${money(r.projected)}`}
                    {r.status === "over" && ` by ${money(Math.abs(r.remaining))}`}
                  </p>
                </button>
              );
            })}
          </div>
        )}
        <button onClick={() => onEdit(null)} style={{ ...styles.ghostCta, height: 42, fontSize: 13 }}>
          <Target size={14} /> {rows.length ? "Set another budget" : "Set a category budget"}
        </button>
      </Card>
    </>
  );
}

/** Setting one number, with a figure from history offered rather than a blank box. */
export function BudgetSheet({ open, catId, state, today, onClose, onSave }) {
  if (!open) return null;
  // Remounted per category so the fields start from that budget rather than the last one's.
  return <BudgetBody key={catId || "new"} catId={catId} state={state} today={today} onClose={onClose} onSave={onSave} />;
}

function BudgetBody({ catId, state, today, onClose, onSave }) {
  const { transactions = [], categoryBudgets = {} } = state;
  const candidates = useMemo(() => budgetCandidates(transactions, 10), [transactions]);
  const [picked, setPicked] = useState(catId || candidates[0]?.id || "dining");
  const [amount, setAmount] = useState(() => String(categoryBudgets[catId] || ""));

  const current = categoryBudgets[picked];
  const suggested = suggestBudget(transactions, picked, 3, today);
  const choose = (id) => {
    setPicked(id);
    setAmount(String(state.categoryBudgets?.[id] || ""));
  };

  return (
    <div className="mtm-backdrop" onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(8,7,13,0.66)", backdropFilter: "blur(3px)",
      zIndex: 60, display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="mtm-sheet" style={{
        width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto",
        background: C.bgElev, borderTop: `1px solid ${C.borderStrong}`,
        borderRadius: `${R.xl}px ${R.xl}px 0 0`, padding: "10px 18px 22px",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: C.surface3, margin: "0 auto 14px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <h2 style={styles.h2}>Category budget</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint }}>
            <X size={16} />
          </button>
        </div>

        <p style={{ color: C.muted, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 8px" }}>
          Which category
        </p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
          {candidates.map((c) => (
            <Pill key={c.id} on={picked === c.id} color={c.color} onClick={() => choose(c.id)}>
              {c.label}{state.categoryBudgets?.[c.id] ? ` · ${money(state.categoryBudgets[c.id])}` : ""}
            </Pill>
          ))}
        </div>

        <p style={{ color: C.muted, fontSize: 10.5, letterSpacing: 0.4, textTransform: "uppercase", margin: "0 0 8px" }}>
          A month's limit
        </p>
        <input
          value={amount} inputMode="decimal" autoFocus placeholder="0"
          aria-label="Budget amount"
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          style={{ ...styles.input, fontSize: 17, fontFamily: F.display }}
        />
        {suggested !== null && (
          <button onClick={() => setAmount(String(suggested))} style={{ ...styles.linkBtn, marginTop: 10 }}>
            <TrendingUp size={12} /> You've averaged {money(suggested)} a month here — use that
          </button>
        )}
        {suggested === null && (
          <p style={{ color: C.faint, fontSize: 11, lineHeight: 1.5, margin: "9px 0 0" }}>
            No history in this category yet, so there's no figure worth suggesting. Pick one and
            adjust it after a month.
          </p>
        )}

        <button onClick={() => { onSave(picked, parseFloat(amount) || 0); onClose(); }}
          disabled={!parseFloat(amount)}
          style={{
            ...styles.cta, marginTop: 18,
            opacity: parseFloat(amount) ? 1 : 0.45, cursor: parseFloat(amount) ? "pointer" : "default",
          }}>
          <Check size={17} /> {current ? "Update it" : "Set it"}
        </button>
        {current > 0 && (
          <button onClick={() => { onSave(picked, 0); onClose(); }} style={{
            ...styles.linkBtn, margin: "14px auto 0", color: C.red,
          }}>
            <Trash2 size={12} /> Remove this budget
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Charges that repeat without having been declared.
 *
 * The ledger already held the evidence — same payee, same amount, month after month — and
 * nothing read it. Stating the yearly figure is the whole point: £9.99 is nothing and
 * £119.88 is a decision, and they're the same charge.
 */
export function SubscriptionRadar({ state, today, onDeclare, onDismiss, onUndismiss }) {
  const subs = useMemo(() => findSubscriptions(state, today), [state, today]);
  const totals = useMemo(() => subscriptionTotals(subs), [subs]);
  const [showStale, setShowStale] = useState(false);

  const declared = (state.recurring || []).filter((r) => r.active && r.type === "expense");
  const hidden = state.dismissedSubs?.length || 0;
  const live = subs.filter((s) => !s.stale);
  const stale = subs.filter((s) => s.stale);

  // Dismissing is a judgement, not a deletion, so it has to be reversible.
  const undismiss = hidden > 0 && (
    <button onClick={onUndismiss} style={{ ...styles.linkBtn, marginTop: 12, color: C.muted }}>
      Bring back {hidden} you dismissed
    </button>
  );

  if (!subs.length) {
    return (
      <>
        <SectionLabel>Subscription radar</SectionLabel>
        <Card>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: 0 }}>
            {declared.length > 0
              ? `Nothing undeclared. The ${declared.length} recurring ${declared.length === 1 ? "entry" : "entries"} above are already accounted for — this watches for the ones that aren't.`
              : "Nothing repeating yet. Once the same payee appears three months running, it turns up here with what it costs a year."}
          </p>
          {undismiss}
        </Card>
      </>
    );
  }

  return (
    <>
      <SectionLabel>Subscription radar</SectionLabel>
      <Card>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
          <Radar size={16} color={C.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
              {live.length} repeating {live.length === 1 ? "charge" : "charges"} you haven't declared
            </p>
            <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.55, margin: "5px 0 0" }}>
              {money(totals.monthly)} a month — <b style={{ color: C.orange }}>{money(totals.annual)} a year</b>.
              Found by matching the same payee across months, so check each one before acting on it.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {(showStale ? subs : live).map((s) => (
            <SubRow key={s.key} sub={s} onDeclare={onDeclare} onDismiss={onDismiss} />
          ))}
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {stale.length > 0 && (
            <button onClick={() => setShowStale((v) => !v)} style={{ ...styles.linkBtn, marginTop: 12, color: C.muted }}>
              {showStale ? "Hide" : "Show"} {stale.length} that {stale.length === 1 ? "has" : "have"} stopped
            </button>
          )}
          {undismiss}
        </div>
      </Card>
    </>
  );
}

function SubRow({ sub, onDeclare, onDismiss }) {
  const Icon = txIcon(sub.catId);
  return (
    <div style={{ ...styles.row, opacity: sub.stale ? 0.55 : 1 }}>
      <span style={{
        width: 28, height: 28, borderRadius: 9, flexShrink: 0, display: "flex",
        alignItems: "center", justifyContent: "center",
        background: alpha(sub.color || C.muted, 0.13),
        border: `1px solid ${alpha(sub.color || C.muted, 0.22)}`,
      }}>
        <Icon size={13} color={sub.color || C.muted} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", color: C.text, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {sub.payee}
        </span>
        <span style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
          <span style={styles.tag}>{sub.cadence.label}</span>
          <span style={styles.tag}>{sub.count}× since {prettyDate(sub.firstSeen)}</span>
          {sub.rose && (
            <span style={{ ...styles.tag, color: C.orange }}>
              <TrendingUp size={9} /> {money(sub.rose.from)} → {money(sub.rose.to)}
            </span>
          )}
          {sub.stale && (
            <span style={{ ...styles.tag, color: C.faint }}>
              <TrendingDown size={9} /> last {prettyDate(sub.lastSeen)}
            </span>
          )}
        </span>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ display: "block", color: C.text, fontSize: 13.5, fontWeight: 600 }}>
          {money(sub.annual)}<span style={{ color: C.faint, fontWeight: 400, fontSize: 10.5 }}>/yr</span>
        </span>
        <span style={{ display: "block", color: C.faint, fontSize: 10.5, marginTop: 2 }}>
          {moneyPrecise(sub.amount)} each
        </span>
      </div>
      {!sub.stale && (
        <button onClick={() => onDeclare(sub)} title="Add as a recurring entry" style={bare}>
          <Repeat size={13} />
        </button>
      )}
      <button onClick={() => onDismiss(sub.key)} title="Not a subscription" style={bare}>
        <X size={13} />
      </button>
    </div>
  );
}

const bare = {
  background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2, flexShrink: 0,
};
