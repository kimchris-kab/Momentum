import { suite } from "./harness.mjs";
import {
  CAPTURE_KEY, DEFAULT_SENDERS, PENDING_TX_KEY, UNDO_TX_KEY, alternatives, applyPending, captureConfig, captureSettings, describeMoney,
  readLine, recordFromPayment, recordFromTyped, topCategories,
} from "../src/lib/capture.js";
import { parseMessage } from "../src/lib/txparse.js";
import { emptyState } from "../src/lib/migrate.js";
import { mergeStates } from "../src/lib/merge.js";

const t = suite("capture");
const NOW = new Date("2026-10-12T14:30:00").getTime();
const state = (over = {}) => ({ ...emptyState(), ...over });

// ---- settings ----
t.eq("typing on, reading off, asking first", [captureSettings({}).typed, captureSettings({}).read, captureSettings({}).mode], [true, false, "ask"]);
t.eq("the usual senders are there to begin with", captureSettings({}).senders, DEFAULT_SENDERS);
t.ok("including M-Pesa and the mobile-money services", ["MPESA", "AirtelMoney", "MTN"].every((s) => DEFAULT_SENDERS.includes(s)));
t.eq("reading has to be turned on", captureSettings({ capture: { read: true } }).read, true);
t.eq("only 'auto' is automatic", [captureSettings({ capture: { mode: "auto" } }).mode, captureSettings({ capture: { mode: "x" } }).mode], ["auto", "ask"]);
t.eq("the senders can be changed", captureSettings({ capture: { senders: ["MyBank", "  ", 5] } }).senders, ["MyBank"]);
t.eq("and emptied", captureSettings({ capture: { senders: [] } }).senders, []);
t.eq("the list is capped", captureSettings({ capture: { senders: Array.from({ length: 200 }, (_, i) => `S${i}`) } }).senders.length, 60);
t.eq("the keys the phone reads are fixed strings", [CAPTURE_KEY, PENDING_TX_KEY, UNDO_TX_KEY], ["momentum:capture", "momentum:pendingTx", "momentum:undoTx"]);

// ---- a typed line ----
const typed = readLine("lunch 12", state());
const rec = recordFromTyped(typed, { at: 7 });
t.eq("a typed line becomes a record with its bucket", [rec.amount, rec.catId, rec.category, rec.via, rec.createdAt], [12, "dining", "wants", "typed", 7]);
t.eq("an income line has no bucket", recordFromTyped(readLine("+5000 salary", state())).category, null);
t.eq("what you've taught it is used", readLine("zed 40", state({ transactions: [{ payee: "Zed", catId: "health", date: "2026-10-01" }] })).catId, "health");
t.eq("no amount, no record", readLine("lunch", state()), null);

// ---- the categories offered instead ----
const ledger = [1, 2, 3].map((i) => ({ id: i, type: "expense", catId: "transport", amount: 5, date: "2026-10-01" })).concat([{ id: 9, type: "expense", catId: "health", amount: 5, date: "2026-10-01" }]);
t.eq("your most used come first, never the one already chosen", alternatives(state({ transactions: ledger }), "expense", "dining").slice(0, 2).map((c) => c.id), ["transport", "health"]);
t.eq("the current guess is not offered again", alternatives(state({ transactions: ledger }), "expense", "transport").every((c) => c.id !== "transport"), true);
t.eq("income has its own", alternatives(state(), "income", "salary").every((c) => c.type === "income"), true);
t.eq("the top few categories, by use", topCategories(state({ transactions: ledger })), ["transport", "health"]);

// ---- what the phone is given ----
const cfg = captureConfig(state({ transactions: [{ payee: "Mama Mboga", catId: "groceries", date: "2026-10-01" }], settings: { capture: { read: true } } }));
t.eq("your payees go to the phone", cfg.payees["mama mboga"], "groceries");
t.ok("with the built-in keywords", cfg.keywords.some(([k, c]) => k === "naivas" && c === "groceries"));
t.ok("and the category names", cfg.categories.groceries.label === "Groceries" && cfg.categories.salary.type === "income");
t.eq("and whether to read", cfg.read, true);
t.ok("the config is small enough to keep in preferences", JSON.stringify(captureConfig(state())).length < 20000);

// ---- collecting what the phone saved ----
const pay = (text, over = {}) => ({ ...parseMessage(text, { now: NOW }), ...over });
const naivas = pay("SBH7K2LM9R Confirmed. Ksh1,200.00 paid to NAIVAS SUPERMARKET. on 17/8/23 at 6:45 PM.New M-PESA balance is Ksh2,000.00.");
const added = applyPending([], { add: [naivas] });
t.eq("a payment from the phone is added", added.length, 1);
t.eq("as a ledger record", [added[0].amount, added[0].catId, added[0].category, added[0].via, added[0].ref], [1200, "groceries", "needs", "message", "SBH7K2LM9R"]);
t.eq("collecting it again adds nothing", applyPending(added, { add: [naivas] }), added);
t.eq("the same ledger comes back, untouched, when there's nothing new", applyPending(added, {}), added);
const both = applyPending([], { add: [naivas, { ...naivas }] });
t.eq("two copies in one batch are one entry", both.length, 1);
t.eq("an undone payment is removed", applyPending(added, { undo: [added[0].id] }).length, 0);
t.eq("an undone one that never arrived is not added", applyPending([], { add: [{ ...naivas, id: "cap-x" }], undo: ["cap-x"] }).length, 0);
t.eq("existing entries are kept", applyPending([{ id: 5, type: "expense", amount: 1, date: "2026-01-01" }], { add: [naivas] }).length, 2);
t.eq("a typed-in-notification entry keeps the id the phone gave it", applyPending([], { add: [{ ...naivas, ref: null, key: "k", id: "q-123", via: "typed", payee: "Lunch" }] })[0].id, "q-123");
t.eq("an old payment is not added twice by different ids", applyPending(added, { add: [{ ...naivas, id: "different" }] }).length, 1);
t.eq("a record reads back as words", describeMoney(recordFromPayment(naivas)), "1,200 · Groceries");
t.eq("two devices' captured payments merge by id", mergeStates({ ...emptyState(), transactions: added }, { ...emptyState(), transactions: applyPending([], { add: [pay("Purchase of USD 12.50 at STARBUCKS on card ending 1234.")] }) }).transactions.length, 2);
