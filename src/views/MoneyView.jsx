import React, { useMemo, useState } from "react";
import {
  BarChart, Bar, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Check, ChevronDown, ChevronUp, Plus, Star, Trash2, Wallet, X } from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import { BUDGET_CATS, MONEY_PRINCIPLES, SIDE_HUSTLE_IDEAS } from "../data/constants.js";
import { monthKeyOf, monthLabel, money, pad, prettyDate, todayStr } from "../lib/date.js";
import {
  Card, Checkbox, EmptyState, IconButton, Pill, ProgressBar, SegmentedControl, SectionLabel,
} from "../components/ui.jsx";

function monthTotals(transactions, mKey) {
  const income = transactions
    .filter((t) => t.type === "income" && monthKeyOf(t.date) === mKey)
    .reduce((a, t) => a + t.amount, 0);
  const byCat = { needs: 0, wants: 0, savings: 0 };
  transactions
    .filter((t) => t.type === "expense" && monthKeyOf(t.date) === mKey)
    .forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const totalExpense = byCat.needs + byCat.wants + byCat.savings;
  return { income, byCat, totalExpense, net: income - totalExpense };
}

function last6MonthsFlow(transactions) {
  const out = [];
  const base = new Date();
  base.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const mKey = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
    const t = monthTotals(transactions, mKey);
    out.push({ month: monthLabel(mKey), Income: t.income, Expenses: t.totalExpense });
  }
  return out;
}

export default function MoneyView({ state, onPatch, onUpdateStrategy, onAddStrategy, onRemoveStrategy }) {
  const {
    strategies, moneyPrinciples, moneyIdeas, netWorth, transactions, monthlyIncome, budgetSplit,
  } = state;
  const [tab, setTab] = useState("flow");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [openGoal, setOpenGoal] = useState(null);
  const [subDraft, setSubDraft] = useState("");
  const [txType, setTxType] = useState("expense");
  const [txCat, setTxCat] = useState("needs");
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");

  const assets = parseFloat(netWorth.assets) || 0;
  const liabilities = parseFloat(netWorth.liabilities) || 0;
  const nw = assets - liabilities;

  const totalTarget = strategies.reduce((a, s) => a + (s.target || 0), 0);
  const totalCurrent = strategies.reduce((a, s) => a + (s.current || 0), 0);
  const pct = totalTarget ? Math.min(100, (totalCurrent / totalTarget) * 100) : 0;

  const adoptedCount = Object.values(moneyPrinciples).filter(Boolean).length;
  const principlesPct = Math.round((adoptedCount / MONEY_PRINCIPLES.length) * 100);
  const byCat = {};
  MONEY_PRINCIPLES.forEach((p) => { (byCat[p.cat] = byCat[p.cat] || []).push(p); });

  const splitSum = budgetSplit.needs + budgetSplit.wants + budgetSplit.savings;
  const income = parseFloat(monthlyIncome) || 0;
  const thisMonth = monthTotals(transactions, monthKeyOf(todayStr()));
  const actualIncome = thisMonth.income || income;
  const targets = {
    needs: actualIncome * budgetSplit.needs / 100,
    wants: actualIncome * budgetSplit.wants / 100,
    savings: actualIncome * budgetSplit.savings / 100,
  };
  const flowData = useMemo(() => last6MonthsFlow(transactions), [transactions]);
  const recentTx = [...transactions].sort((a, b) => (b.id || 0) - (a.id || 0)).slice(0, 12);

  const addTx = () => {
    if (!txAmount) return;
    onPatch({
      transactions: [...transactions, {
        id: Date.now(), type: txType, category: txType === "expense" ? txCat : null,
        amount: +txAmount, note: txNote.trim(), date: todayStr(),
      }],
    });
    setTxAmount("");
    setTxNote("");
  };
  const removeTx = (id) => onPatch({ transactions: transactions.filter((t) => t.id !== id) });

  const addGoal = () => {
    if (!name.trim() || !target) return;
    onAddStrategy({
      id: Date.now(), name: name.trim(), target: +target, current: 0, note: "",
      notes: "", subtasks: [], starred: false, targetDate: null,
    });
    setName("");
    setTarget("");
  };

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Build wealth</p>
      <h1 style={styles.h1}>Money</h1>

      <Card flip style={styles.cardTall}>
        <p style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, margin: 0 }}>
          Net worth snapshot
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {["assets", "liabilities"].map((k) => (
            <div key={k} style={{ flex: 1 }}>
              <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 5px", textTransform: "capitalize" }}>{k}</p>
              <input value={netWorth[k]} inputMode="decimal" placeholder="0"
                onChange={(e) => onPatch({ netWorth: { ...netWorth, [k]: e.target.value.replace(/[^0-9.]/g, "") } })}
                style={styles.input} />
            </div>
          ))}
        </div>
        <p style={{
          marginTop: 14, marginBottom: 0, fontFamily: F.display, fontSize: 24, fontWeight: 600,
          color: nw >= 0 ? C.gold : C.red,
        }}>
          {money(nw)} <span style={{ color: C.faint, fontSize: 12, fontFamily: F.body }}>net worth</span>
        </p>
      </Card>

      <SegmentedControl
        value={tab} onChange={setTab} style={{ marginBottom: 16 }}
        options={[
          { id: "flow", label: "Flow" }, { id: "goals", label: "Goals" },
          { id: "playbook", label: "Playbook" }, { id: "ideas", label: "Ideas" },
        ]}
      />

      {tab === "flow" && (
        <>
          <Card>
            <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
              Monthly income (estimate)
            </p>
            <input value={monthlyIncome} inputMode="decimal" placeholder="0"
              onChange={(e) => onPatch({ monthlyIncome: e.target.value.replace(/[^0-9.]/g, "") })}
              style={styles.input} />
            <p style={{ color: C.muted, fontSize: 10.5, margin: "14px 0 6px", letterSpacing: 0.4, textTransform: "uppercase" }}>
              Budget split — {splitSum}% {splitSum !== 100 && <span style={{ color: C.red }}>(should total 100%)</span>}
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              {BUDGET_CATS.map((cat) => (
                <div key={cat.id} style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: cat.color }} />
                    <span style={{ color: C.muted, fontSize: 10.5 }}>{cat.label}</span>
                  </div>
                  <input value={budgetSplit[cat.id]} inputMode="numeric"
                    onChange={(e) => onPatch({
                      budgetSplit: { ...budgetSplit, [cat.id]: +e.target.value.replace(/[^0-9]/g, "") || 0 },
                    })}
                    style={{ ...styles.input, padding: "10px", textAlign: "center", fontSize: 13 }} />
                </div>
              ))}
            </div>
          </Card>

          <Card style={styles.cardTall}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7 }}>This month</span>
              <span style={{ color: thisMonth.net >= 0 ? C.gold : C.red, fontSize: 13, fontWeight: 600 }}>
                {thisMonth.net >= 0 ? "+" : ""}{money(thisMonth.net)} net
              </span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              <BigNum value={money(thisMonth.income)} label="Income logged" color={C.gold} />
              <BigNum value={money(thisMonth.totalExpense)} label="Spent" color={C.red} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
              {BUDGET_CATS.map((cat) => {
                const spent = thisMonth.byCat[cat.id] || 0;
                const t = targets[cat.id];
                const p = t ? Math.min(100, (spent / t) * 100) : 0;
                return (
                  <div key={cat.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: C.text, fontSize: 12.5 }}>{cat.label}</span>
                      <span style={{ color: spent > t && t ? C.red : C.muted, fontSize: 11.5 }}>
                        {money(spent)} of {money(t)}
                      </span>
                    </div>
                    <ProgressBar pct={p} color={spent > t && t ? C.red : cat.color} />
                  </div>
                );
              })}
            </div>
          </Card>

          <SectionLabel>Money flow — last 6 months</SectionLabel>
          <Card style={{ height: 215, padding: "16px 6px 4px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowData} margin={{ top: 6, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 10.5 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Income" fill={C.gold} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill={C.red} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 8px", letterSpacing: 0.4, textTransform: "uppercase" }}>
              Log a transaction
            </p>
            <SegmentedControl value={txType} onChange={setTxType}
              options={[{ id: "expense", label: "Expense" }, { id: "income", label: "Income" }]} />
            {txType === "expense" && (
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {BUDGET_CATS.map((cat) => (
                  <Pill key={cat.id} on={txCat === cat.id} color={cat.color} onClick={() => setTxCat(cat.id)}
                    style={{ flex: 1, textAlign: "center" }}>
                    {cat.label}
                  </Pill>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input value={txAmount} inputMode="decimal" placeholder="Amount"
                onChange={(e) => setTxAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                style={{ ...styles.input, flex: 1 }} />
              <button onClick={addTx} style={styles.addBtn}><Plus size={20} /></button>
            </div>
            <input value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="Note (optional)"
              style={{ ...styles.input, marginTop: 8, fontSize: 13 }} />
          </Card>

          <SectionLabel>Recent</SectionLabel>
          {recentTx.length === 0 ? (
            <EmptyState Icon={Wallet} title="No transactions yet" hint="Log one above to start tracking your flow." />
          ) : (
            <Card style={{ padding: "8px 14px" }}>
              {recentTx.map((t) => {
                const cat = t.category ? BUDGET_CATS.find((c) => c.id === t.category) : null;
                const color = t.type === "income" ? C.gold : (cat?.color || C.muted);
                return (
                  <div key={t.id} style={styles.row}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: C.text, fontSize: 13 }}>
                        {t.note || (t.type === "income" ? "Income" : cat?.label || "Expense")}
                      </span>
                      <span style={{ color: C.faint, fontSize: 10.5, marginLeft: 8 }}>{prettyDate(t.date)}</span>
                    </div>
                    <span style={{ color, fontSize: 13, fontWeight: 600 }}>
                      {t.type === "income" ? "+" : "-"}{money(t.amount)}
                    </span>
                    <button onClick={() => removeTx(t.id)} style={iconBtnBare}><X size={13} /></button>
                  </div>
                );
              })}
            </Card>
          )}
        </>
      )}

      {tab === "goals" && (
        <>
          {strategies.length > 0 && (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7 }}>
                  Total progress
                </span>
                <span style={{ color: C.gold, fontSize: 13, fontWeight: 600 }}>{Math.round(pct)}%</span>
              </div>
              <ProgressBar pct={pct} height={9} style={{ marginTop: 12 }} />
              <p style={{ color: C.text, fontSize: 15, marginTop: 12, marginBottom: 0, fontFamily: F.display }}>
                {money(totalCurrent)} <span style={{ color: C.faint }}>of {money(totalTarget)}</span>
              </p>
            </Card>
          )}

          <Card>
            <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 8px", letterSpacing: 0.4, textTransform: "uppercase" }}>
              New goal
            </p>
            <input value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Emergency fund, Pay off card" style={styles.input} />
            <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
              <input value={target} inputMode="decimal" placeholder="Target amount"
                onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))}
                style={{ ...styles.input, flex: 1 }} />
              <button onClick={addGoal} style={styles.addBtn}><Plus size={20} /></button>
            </div>
          </Card>

          {strategies.length === 0 ? (
            <EmptyState Icon={Wallet} title="No money goals yet"
              hint="Name one and set its target — the bar fills as you put money aside." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
              {strategies.map((s) => {
                const p = s.target ? Math.min(100, (s.current / s.target) * 100) : 0;
                const isOpen = openGoal === s.id;
                const subs = s.subtasks || [];
                const subDone = subs.filter((x) => x.done).length;
                return (
                  <Card key={s.id} style={{ marginBottom: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <span style={{ color: C.text, fontSize: 15, fontWeight: 550, flex: 1 }}>{s.name}</span>
                      <button onClick={() => onUpdateStrategy(s.id, { starred: !s.starred })} style={iconBtnBare}>
                        <Star size={15} color={s.starred ? C.gold : C.faint} fill={s.starred ? C.gold : "none"} />
                      </button>
                      <button onClick={() => onRemoveStrategy(s.id)} style={iconBtnBare}><Trash2 size={15} /></button>
                    </div>
                    <ProgressBar pct={p} height={8} style={{ marginTop: 11 }} />
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                      <span style={{ color: C.muted, fontSize: 12.5 }}>Saved</span>
                      <input value={s.current || ""} inputMode="decimal" placeholder="0"
                        onChange={(e) => onUpdateStrategy(s.id, { current: +e.target.value.replace(/[^0-9.]/g, "") || 0 })}
                        style={{ ...styles.input, width: 92, padding: "8px 11px", textAlign: "right" }} />
                      <span style={{ color: C.faint, fontSize: 12.5, marginLeft: "auto" }}>
                        of {money(s.target)} · {Math.round(p)}%
                      </span>
                    </div>

                    <button onClick={() => setOpenGoal(isOpen ? null : s.id)} style={{ ...styles.linkBtn, marginTop: 12 }}>
                      {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      Plan {subs.length > 0 && `· ${subDone}/${subs.length} steps`}
                    </button>

                    {isOpen && (
                      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                        <textarea value={s.notes || ""} rows={2} placeholder="How will you hit this?"
                          onChange={(e) => onUpdateStrategy(s.id, { notes: e.target.value })}
                          style={{ ...styles.input, resize: "none", fontSize: 12.5, lineHeight: 1.55 }} />
                        <div style={styles.fieldShell}>
                          <span style={{ color: C.muted, fontSize: 12 }}>Target date</span>
                          <input type="date" value={s.targetDate || ""}
                            onChange={(e) => onUpdateStrategy(s.id, { targetDate: e.target.value || null })}
                            style={{ ...styles.bareInput, marginLeft: "auto" }} />
                        </div>
                        <div>
                          {subs.map((x) => (
                            <div key={x.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
                              <Checkbox checked={x.done} size={17}
                                onClick={() => onUpdateStrategy(s.id, {
                                  subtasks: subs.map((y) => y.id === x.id ? { ...y, done: !y.done } : y),
                                })} />
                              <span style={{
                                flex: 1, color: x.done ? C.faint : C.text, fontSize: 12.5,
                                textDecoration: x.done ? "line-through" : "none",
                              }}>{x.text}</span>
                              <button onClick={() => onUpdateStrategy(s.id, {
                                subtasks: subs.filter((y) => y.id !== x.id),
                              })} style={iconBtnBare}><X size={12} /></button>
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <input value={openGoal === s.id ? subDraft : ""} onChange={(e) => setSubDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key !== "Enter" || !subDraft.trim()) return;
                                onUpdateStrategy(s.id, {
                                  subtasks: [...subs, { id: `g-${Date.now()}`, text: subDraft.trim(), done: false }],
                                });
                                setSubDraft("");
                              }}
                              placeholder="Add a step…"
                              style={{ ...styles.input, flex: 1, fontSize: 12, padding: "8px 12px" }} />
                            <IconButton title="Add step" onClick={() => {
                              if (!subDraft.trim()) return;
                              onUpdateStrategy(s.id, {
                                subtasks: [...subs, { id: `g-${Date.now()}`, text: subDraft.trim(), done: false }],
                              });
                              setSubDraft("");
                            }}><Plus size={15} /></IconButton>
                          </div>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "playbook" && (
        <>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ color: C.muted, fontSize: 12 }}>{adoptedCount} of {MONEY_PRINCIPLES.length} adopted</span>
              <span style={{ color: C.gold, fontSize: 12, fontWeight: 600 }}>{principlesPct}%</span>
            </div>
            <ProgressBar pct={principlesPct} />
          </Card>
          {Object.entries(byCat).map(([cat, items]) => (
            <div key={cat}>
              <SectionLabel>{cat}</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((pr) => {
                  const on = !!moneyPrinciples[pr.id];
                  return (
                    <button key={pr.id} onClick={() => onPatch({
                      moneyPrinciples: { ...moneyPrinciples, [pr.id]: !on },
                    })} style={{
                      ...styles.card, marginBottom: 0, width: "100%", textAlign: "left", cursor: "pointer",
                      borderColor: on ? alpha(C.gold, 0.32) : C.border,
                    }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                        <Checkbox checked={on} onClick={() => onPatch({
                          moneyPrinciples: { ...moneyPrinciples, [pr.id]: !on },
                        })} style={{ marginTop: 1 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ color: on ? C.gold : C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{pr.title}</p>
                          <p style={{ color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 1.55 }}>{pr.desc}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "ideas" && (
        <>
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, marginTop: 0, marginBottom: 14 }}>
            Low-to-moderate barrier ways to build income on the side. Star the ones worth exploring.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SIDE_HUSTLE_IDEAS.map((idea) => {
              const starred = !!moneyIdeas[idea.id];
              return (
                <Card key={idea.id} style={{ marginBottom: 0, borderColor: starred ? alpha(C.gold, 0.3) : C.border }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{idea.title}</span>
                    <button onClick={() => onPatch({ moneyIdeas: { ...moneyIdeas, [idea.id]: !starred } })}
                      style={iconBtnBare}>
                      <Star size={17} color={starred ? C.gold : C.faint} fill={starred ? C.gold : "none"} />
                    </button>
                  </div>
                  <span style={{ ...styles.tag, marginTop: 8 }}>{idea.level}</span>
                  <p style={{ color: C.muted, fontSize: 12.5, marginTop: 8, marginBottom: 0, lineHeight: 1.55 }}>
                    {idea.desc}
                  </p>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <p style={{ color: C.faint, fontSize: 10.5, marginTop: 22, lineHeight: 1.55 }}>
        General financial education, not personalized advice. Sanity-check big decisions with your own
        research or a professional.
      </p>
    </div>
  );
}

const tooltipStyle = {
  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12,
};
const iconBtnBare = {
  background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2, flexShrink: 0,
};

function BigNum({ value, label, color }) {
  return (
    <div style={{ flex: 1 }}>
      <p style={{ color, fontSize: 19, fontFamily: F.display, fontWeight: 600, margin: 0 }}>{value}</p>
      <p style={{ color: C.faint, fontSize: 10.5, margin: "2px 0 0" }}>{label}</p>
    </div>
  );
}
