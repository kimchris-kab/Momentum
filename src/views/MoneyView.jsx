import React, { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Pause, Play, Plus, Receipt,
  Repeat, Search, Star, Trash2, TrendingUp, Wallet, X,
} from "lucide-react";
import { C, F, R, alpha, styles } from "../theme.js";
import {
  BUDGET_CATS, MONEY_PRINCIPLES, SIDE_HUSTLE_IDEAS, TX_CAT_BY_ID,
} from "../data/constants.js";
import { longDate, money, prettyDate, todayStr } from "../lib/date.js";
import {
  categoryBreakdown, describeRule, downloadCsv, filterLedger, groupByDate, monthKeyNow,
  monthTitle, monthTotals, monthsFlow, netWorthChange, netWorthSeries, shiftMonth,
  transactionsToCsv, txBucket,
} from "../lib/money.js";
import {
  Card, Checkbox, EmptyState, IconButton, Pill, ProgressBar, SegmentedControl, SectionLabel,
} from "../components/ui.jsx";
import TxSheet from "../components/TxSheet.jsx";

const blankTx = () => ({
  type: "expense", catId: "groceries", category: "needs", amount: 0,
  note: "", payee: "", date: todayStr(),
});
const blankRule = () => ({
  type: "expense", catId: "rent", category: "needs", amount: 0, note: "", payee: "",
  freq: "monthly", dayOfMonth: new Date().getDate(), startDate: todayStr(), active: true,
  lastPostedDate: null,
});

export default function MoneyView({
  state, onPatch, onAddStrategy, onUpdateStrategy, onRemoveStrategy,
  onSaveTx, onDeleteTx, onSaveRule, onDeleteRule, onSaveNetWorth,
}) {
  const {
    strategies, moneyPrinciples, moneyIdeas, netWorth, netWorthLog, transactions, recurring,
    monthlyIncome, budgetSplit,
  } = state;

  const [tab, setTab] = useState("flow");
  const [learnTab, setLearnTab] = useState("playbook");
  const [mKey, setMKey] = useState(monthKeyNow());
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [filterType, setFilterType] = useState("all");
  const [filterBucket, setFilterBucket] = useState("all");
  const [editing, setEditing] = useState(null);
  const [editingRule, setEditingRule] = useState(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [openGoal, setOpenGoal] = useState(null);
  const [subDraft, setSubDraft] = useState("");

  const totals = useMemo(() => monthTotals(transactions, mKey), [transactions, mKey]);
  const flowData = useMemo(() => monthsFlow(transactions, 6, mKey), [transactions, mKey]);
  const breakdown = useMemo(() => categoryBreakdown(transactions, mKey, "expense"), [transactions, mKey]);
  const ledger = useMemo(
    () => groupByDate(filterLedger(transactions, { mKey, query, type: filterType, bucket: filterBucket })),
    [transactions, mKey, query, filterType, filterBucket]);

  const nwSeries = useMemo(() => netWorthSeries(netWorthLog), [netWorthLog]);
  const nwChange = useMemo(() => netWorthChange(netWorthLog), [netWorthLog]);
  const assets = parseFloat(netWorth.assets) || 0;
  const liabilities = parseFloat(netWorth.liabilities) || 0;
  const nw = assets - liabilities;

  const income = parseFloat(monthlyIncome) || 0;
  const actualIncome = totals.income || income;
  const targets = {
    needs: actualIncome * budgetSplit.needs / 100,
    wants: actualIncome * budgetSplit.wants / 100,
    savings: actualIncome * budgetSplit.savings / 100,
  };
  const splitSum = budgetSplit.needs + budgetSplit.wants + budgetSplit.savings;

  const totalTarget = strategies.reduce((a, s) => a + (s.target || 0), 0);
  const totalCurrent = strategies.reduce((a, s) => a + (s.current || 0), 0);
  const goalPct = totalTarget ? Math.min(100, (totalCurrent / totalTarget) * 100) : 0;

  const adoptedCount = Object.values(moneyPrinciples).filter(Boolean).length;
  const principlesPct = Math.round((adoptedCount / MONEY_PRINCIPLES.length) * 100);
  const byCat = {};
  MONEY_PRINCIPLES.forEach((p) => { (byCat[p.cat] = byCat[p.cat] || []).push(p); });

  const isThisMonth = mKey === monthKeyNow();

  const addGoal = () => {
    if (!name.trim() || !target) return;
    onAddStrategy({
      id: Date.now(), name: name.trim(), target: +target, current: 0,
      notes: "", subtasks: [], starred: false, targetDate: null,
    });
    setName("");
    setTarget("");
  };

  return (
    <div style={styles.page}>
      <p style={styles.eyebrow}>Build wealth</p>
      <h1 style={styles.h1}>Money</h1>

      <SegmentedControl
        value={tab} onChange={setTab} style={{ marginBottom: 16 }}
        options={[
          { id: "flow", label: "Flow" }, { id: "records", label: "Records" },
          { id: "goals", label: "Goals" }, { id: "learn", label: "Learn" },
        ]}
      />

      {(tab === "flow" || tab === "records") && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: C.surface, border: `1px solid ${C.border}`, borderRadius: R.md,
          padding: "8px 10px", marginBottom: 14,
        }}>
          <IconButton onClick={() => setMKey(shiftMonth(mKey, -1))} title="Previous month">
            <ChevronLeft size={16} />
          </IconButton>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{monthTitle(mKey)}</p>
            <p style={{ color: C.faint, fontSize: 10.5, margin: "2px 0 0" }}>
              {totals.count} {totals.count === 1 ? "entry" : "entries"}
            </p>
          </div>
          <IconButton onClick={() => setMKey(shiftMonth(mKey, 1))} title="Next month"
            style={{ opacity: isThisMonth ? 0.4 : 1 }}>
            <ChevronRight size={16} />
          </IconButton>
        </div>
      )}

      {tab === "flow" && (
        <>
          <Card flip style={styles.cardTall}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: C.muted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7 }}>
                {isThisMonth ? "This month" : monthTitle(mKey)}
              </span>
              <span style={{ color: totals.net >= 0 ? C.gold : C.red, fontSize: 13, fontWeight: 600 }}>
                {totals.net >= 0 ? "+" : ""}{money(totals.net)} net
              </span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              <BigNum value={money(totals.income)} label="Income" color={C.gold} />
              <BigNum value={money(totals.totalExpense)} label="Spent" color={C.red} />
              <BigNum value={`${totals.savingsRate}%`} label="Saved" color={C.green} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 16 }}>
              {BUDGET_CATS.map((cat) => {
                const spent = totals.byBucket[cat.id] || 0;
                const t = targets[cat.id];
                const p = t ? Math.min(100, (spent / t) * 100) : 0;
                const over = t > 0 && spent > t;
                return (
                  <div key={cat.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: C.text, fontSize: 12.5 }}>{cat.label}</span>
                      <span style={{ color: over ? C.red : C.muted, fontSize: 11.5 }}>
                        {money(spent)} of {money(t)}
                      </span>
                    </div>
                    <ProgressBar pct={p} color={over ? C.red : cat.color} />
                  </div>
                );
              })}
            </div>
          </Card>

          {breakdown.length > 0 && (
            <>
              <SectionLabel>Where it went</SectionLabel>
              <Card>
                <div style={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", marginBottom: 14 }}>
                  {breakdown.map((c) => (
                    <div key={c.id} title={`${c.label} · ${c.pct}%`}
                      style={{ width: `${c.pct}%`, background: c.color }} />
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {breakdown.slice(0, 6).map((c) => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: c.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, color: C.text, fontSize: 12.5 }}>{c.label}</span>
                      <span style={{ color: C.muted, fontSize: 11.5 }}>{c.pct}%</span>
                      <span style={{ color: C.text, fontSize: 12.5, fontWeight: 600, minWidth: 54, textAlign: "right" }}>
                        {money(c.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}

          <SectionLabel>Six months to {monthTitle(mKey).split(" ")[0]}</SectionLabel>
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

          <SectionLabel>Net worth</SectionLabel>
          <Card style={styles.cardTall}>
            <div style={{ display: "flex", gap: 8 }}>
              {["assets", "liabilities"].map((k) => (
                <div key={k} style={{ flex: 1 }}>
                  <p style={{ color: C.muted, fontSize: 10.5, margin: "0 0 5px", textTransform: "capitalize" }}>{k}</p>
                  <input value={netWorth[k]} inputMode="decimal" placeholder="0"
                    onChange={(e) => onPatch({ netWorth: { ...netWorth, [k]: e.target.value.replace(/[^0-9.]/g, "") } })}
                    style={styles.input} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 14 }}>
              <span style={{ fontFamily: F.display, fontSize: 24, fontWeight: 600, color: nw >= 0 ? C.gold : C.red }}>
                {money(nw)}
              </span>
              {nwChange && (
                <span style={{ color: nwChange.delta >= 0 ? C.green : C.red, fontSize: 12, fontWeight: 600 }}>
                  {nwChange.delta >= 0 ? "▲" : "▼"} {money(Math.abs(nwChange.delta))} since {prettyDate(nwChange.since)}
                </span>
              )}
            </div>
            <button onClick={onSaveNetWorth} style={{ ...styles.ghostCta, height: 42, marginTop: 12, fontSize: 13 }}>
              <TrendingUp size={14} /> Save snapshot for today
            </button>

            {nwSeries.length > 1 && (
              <div style={{ height: 150, marginTop: 14, marginLeft: -22 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={nwSeries} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={C.gold} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={C.gold} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: C.faint, fontSize: 9.5 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => money(v)} />
                    <Area type="monotone" dataKey="net" stroke={C.gold} strokeWidth={2} fill="url(#nwfill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            {nwSeries.length > 0 && (
              <p style={{ color: C.faint, fontSize: 10.5, marginTop: 10, marginBottom: 0 }}>
                {nwSeries.length} snapshot{nwSeries.length === 1 ? "" : "s"} logged
                {nwSeries.length === 1 && " — save another later to see the trend."}
              </p>
            )}
          </Card>

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
        </>
      )}

      {tab === "records" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <button onClick={() => setEditing(blankTx())} style={{ ...styles.cta, height: 46, flex: 1, fontSize: 14 }}>
              <Plus size={17} /> Add entry
            </button>
            <IconButton onClick={() => setSearching((s) => !s)} active={searching} title="Search"
              style={{ width: 46, height: 46 }}>
              <Search size={17} />
            </IconButton>
            <IconButton title="Export CSV" style={{ width: 46, height: 46 }}
              onClick={() => downloadCsv(`momentum-transactions-${todayStr()}.csv`, transactionsToCsv(transactions))}>
              <Download size={17} />
            </IconButton>
          </div>

          {searching && (
            <div style={{ ...styles.fieldShell, marginBottom: 10 }}>
              <Search size={14} color={C.muted} />
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search payee, note or category…"
                style={{ ...styles.bareInput, flex: 1, fontSize: 13.5 }} />
              {query && <button onClick={() => setQuery("")} style={bareBtn}><X size={13} /></button>}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12 }}>
            {[["all", "All"], ["expense", "Expenses"], ["income", "Income"]].map(([k, l]) => (
              <Pill key={k} on={filterType === k} onClick={() => setFilterType(k)}>{l}</Pill>
            ))}
            {BUDGET_CATS.map((b) => (
              <Pill key={b.id} on={filterBucket === b.id} color={b.color}
                onClick={() => setFilterBucket(filterBucket === b.id ? "all" : b.id)}>
                {b.label}
              </Pill>
            ))}
          </div>

          {ledger.length === 0 ? (
            <EmptyState
              Icon={Receipt}
              title={query || filterType !== "all" || filterBucket !== "all" ? "No matching entries" : "No entries this month"}
              hint={query || filterType !== "all" || filterBucket !== "all"
                ? "Try clearing the filters or searching something else."
                : "Log what you spent and earned — you can back-date anything you forgot."}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {ledger.map((day) => (
                <div key={day.date}>
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6,
                  }}>
                    <span style={{ color: C.muted, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" }}>
                      {longDate(day.date)}
                    </span>
                    <span style={{ color: day.net >= 0 ? C.green : C.muted, fontSize: 11 }}>
                      {day.net >= 0 ? "+" : ""}{money(day.net)}
                    </span>
                  </div>
                  <Card style={{ padding: "6px 14px", marginBottom: 0 }}>
                    {day.items.map((t) => {
                      const cat = TX_CAT_BY_ID[t.catId];
                      const color = t.type === "income" ? C.gold
                        : (BUDGET_CATS.find((b) => b.id === txBucket(t))?.color || C.muted);
                      return (
                        <button key={t.id} onClick={() => setEditing(t)} style={{
                          ...styles.row, width: "100%", background: "none", border: "none",
                          cursor: "pointer", textAlign: "left",
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: 4, background: color, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ display: "block", color: C.text, fontSize: 13 }}>
                              {t.payee || t.note || cat?.label || (t.type === "income" ? "Income" : "Expense")}
                            </span>
                            <span style={{ display: "flex", gap: 5, marginTop: 3, flexWrap: "wrap" }}>
                              {cat && <span style={styles.tag}>{cat.label}</span>}
                              {t.recurringId && <span style={styles.tag}><Repeat size={9} /> Auto</span>}
                              {t.payee && t.note && <span style={styles.tag}>{t.note}</span>}
                            </span>
                          </div>
                          <span style={{
                            color: t.type === "income" ? C.gold : C.text, fontSize: 13.5, fontWeight: 600,
                          }}>
                            {t.type === "income" ? "+" : "−"}{money(t.amount)}
                          </span>
                        </button>
                      );
                    })}
                  </Card>
                </div>
              ))}
            </div>
          )}

          <SectionLabel>Recurring</SectionLabel>
          <Card>
            {(!recurring || recurring.length === 0) ? (
              <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.55, margin: "0 0 12px" }}>
                Rent, salary, subscriptions — set them once and they post themselves each month,
                so your records stay complete without you remembering.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                {recurring.map((r) => {
                  const cat = TX_CAT_BY_ID[r.catId];
                  return (
                    <div key={r.id} style={styles.row}>
                      <span style={{
                        width: 7, height: 7, borderRadius: 4, flexShrink: 0,
                        background: r.active ? (r.type === "income" ? C.gold : cat?.color || C.muted) : C.faint,
                      }} />
                      <button onClick={() => setEditingRule(r)} style={{
                        flex: 1, minWidth: 0, background: "none", border: "none", padding: 0,
                        cursor: "pointer", textAlign: "left",
                      }}>
                        <span style={{ display: "block", color: r.active ? C.text : C.faint, fontSize: 13 }}>
                          {r.payee || cat?.label || "Recurring"}
                        </span>
                        <span style={{ display: "block", color: C.faint, fontSize: 10.5, marginTop: 2 }}>
                          {describeRule(r)}{r.lastPostedDate ? ` · last posted ${prettyDate(r.lastPostedDate)}` : ""}
                        </span>
                      </button>
                      <span style={{ color: r.type === "income" ? C.gold : C.text, fontSize: 13, fontWeight: 600 }}>
                        {r.type === "income" ? "+" : "−"}{money(r.amount)}
                      </span>
                      <button onClick={() => onSaveRule({ ...r, active: !r.active })} style={bareBtn}
                        title={r.active ? "Pause" : "Resume"}>
                        {r.active ? <Pause size={13} /> : <Play size={13} />}
                      </button>
                      <button onClick={() => onDeleteRule(r.id)} style={bareBtn}><Trash2 size={13} /></button>
                    </div>
                  );
                })}
              </div>
            )}
            <button onClick={() => setEditingRule(blankRule())} style={{ ...styles.ghostCta, height: 42, fontSize: 13 }}>
              <Repeat size={14} /> Add a recurring entry
            </button>
          </Card>
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
                <span style={{ color: C.gold, fontSize: 13, fontWeight: 600 }}>{Math.round(goalPct)}%</span>
              </div>
              <ProgressBar pct={goalPct} height={9} style={{ marginTop: 12 }} />
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
                      <button onClick={() => onUpdateStrategy(s.id, { starred: !s.starred })} style={bareBtn}>
                        <Star size={15} color={s.starred ? C.gold : C.faint} fill={s.starred ? C.gold : "none"} />
                      </button>
                      <button onClick={() => onRemoveStrategy(s.id)} style={bareBtn}><Trash2 size={15} /></button>
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
                              })} style={bareBtn}><X size={12} /></button>
                            </div>
                          ))}
                          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                            <input value={isOpen ? subDraft : ""} onChange={(e) => setSubDraft(e.target.value)}
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

      {tab === "learn" && (
        <>
          <SegmentedControl value={learnTab} onChange={setLearnTab} style={{ marginBottom: 16 }}
            options={[{ id: "playbook", label: "Playbook" }, { id: "ideas", label: "Ideas" }]} />

          {learnTab === "playbook" && (
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
                        <Card key={pr.id} style={{
                          marginBottom: 0, borderColor: on ? alpha(C.gold, 0.32) : C.border,
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                            <Checkbox checked={on} style={{ marginTop: 1 }}
                              onClick={() => onPatch({ moneyPrinciples: { ...moneyPrinciples, [pr.id]: !on } })} />
                            <div style={{ flex: 1 }}>
                              <p style={{ color: on ? C.gold : C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>
                                {pr.title}
                              </p>
                              <p style={{ color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 1.55 }}>{pr.desc}</p>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}

          {learnTab === "ideas" && (
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
                          style={bareBtn}>
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
        </>
      )}

      <p style={{ color: C.faint, fontSize: 10.5, marginTop: 22, lineHeight: 1.55 }}>
        General financial education, not personalized advice. Sanity-check big decisions with your own
        research or a professional.
      </p>

      <TxSheet
        open={!!editing} tx={editing} mode="tx"
        onChange={setEditing}
        onClose={() => setEditing(null)}
        onSave={() => { onSaveTx(editing); setEditing(null); }}
        onDelete={editing?.id ? () => { onDeleteTx(editing.id); setEditing(null); } : null}
      />
      <TxSheet
        open={!!editingRule} tx={editingRule} mode="rule"
        onChange={setEditingRule}
        onClose={() => setEditingRule(null)}
        onSave={() => { onSaveRule(editingRule); setEditingRule(null); }}
        onDelete={editingRule?.id ? () => { onDeleteRule(editingRule.id); setEditingRule(null); } : null}
      />
    </div>
  );
}

const tooltipStyle = {
  background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12,
};
const bareBtn = {
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
