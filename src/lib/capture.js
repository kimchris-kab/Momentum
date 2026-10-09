import { TX_CATEGORIES, TX_CAT_BY_ID } from "../data/constants.js";
import { INCOME_KEYWORDS, KEYWORDS, alreadyLogged, guessCategory, learnedPayees, parseTyped, toTransaction } from "./txparse.js";
import { todayStr } from "./date.js";

// Getting money into the ledger without the effort that makes people stop: a line typed anywhere, a reply typed into a
// notification, and the messages banks and mobile-money services already send. The phone side reads and offers; this
// side decides what the settings are, gives the phone what it needs to guess well, and collects what it saved.

/** Where the phone looks for its instructions. Written by publishCapture; the Java side reads exactly this string. */
export const CAPTURE_KEY = "momentum:capture";
/** Payments the phone logged while the app was closed, waiting here to be added. */
export const PENDING_TX_KEY = "momentum:pendingTx";
/** A payment the person chose to adjust from its notification (the Change button): the app opens on it, ready to edit. */
export const PENDING_DRAFT_KEY = "momentum:pendingDraft";
/** Ids of payments the person undid from the notification before the app collected them. */
export const UNDO_TX_KEY = "momentum:undoTx";

// Senders whose messages are read by default once reading is switched on. Matched without regard to case, as a whole
// name or as part of one; the person can add their own, and remove these.
export const DEFAULT_SENDERS = ["MPESA", "M-PESA", "AirtelMoney", "Airtel Money", "MTN", "MoMo", "Equity", "KCB", "Co-op", "ABSA", "Stanbic", "NCBA", "I&M", "DTB", "Family Bank"];

export const DEFAULT_CAPTURE = { typed: true, quick: true, read: false, mode: "ask", senders: DEFAULT_SENDERS, packages: [] };

export function captureSettings(settings) {
  const s = settings?.capture || {};
  const list = (v, fallback) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => x.trim()).slice(0, 60) : fallback);
  return {
    typed: s.typed !== false,
    quick: s.quick !== false,
    read: s.read === true,
    mode: s.mode === "auto" ? "auto" : "ask",
    senders: list(s.senders, DEFAULT_SENDERS),
    packages: list(s.packages, []),
  };
}

/** The ledger record for what a person typed, with the bucket the rest of the app rolls categories up into. */
export function recordFromTyped(parsed, { at = Date.now() } = {}) {
  return {
    type: parsed.type, amount: parsed.amount, catId: parsed.catId, category: TX_CAT_BY_ID[parsed.catId]?.bucket ?? null,
    date: parsed.date, payee: parsed.payee, note: "", via: "typed", createdAt: at,
  };
}

/** The record for a payment the phone read, as it goes into the ledger. */
export function recordFromPayment(p, { at = Date.now() } = {}) {
  const r = toTransaction(p, { at });
  return { ...r, category: TX_CAT_BY_ID[r.catId]?.bucket ?? null };
}

/** What a line says, judged against what is already known about this person's payees. */
export function readLine(line, state) {
  return parseTyped(line, { today: todayStr(), learned: learnedPayees(state.transactions) });
}

/** The categories offered as one-tap alternatives to the guess: the person's most used first. */
export function alternatives(state, type, current, limit = 4) {
  const score = {};
  (state.transactions || []).forEach((t) => { if (t.type === type && t.catId) score[t.catId] = (score[t.catId] || 0) + 1; });
  const all = TX_CATEGORIES.filter((c) => c.type === type && c.id !== current);
  return all.sort((a, b) => (score[b.id] || 0) - (score[a.id] || 0)).slice(0, limit);
}

// ---- The phone ----

const prefs = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.Preferences : null);
const money = () => (typeof window !== "undefined" ? window.Capacitor?.Plugins?.MomentumMoney : null);

/** Is the installed app one that can capture money at all? Older builds of the app don't have the native half. */
export const hasNativeCapture = () => !!money();

/** The person's own payees and the built-in keywords, newest and most recent first, capped so it stays small. */
export function captureConfig(state) {
  const cfg = captureSettings(state.settings);
  const learned = learnedPayees(state.transactions);
  const payees = Object.fromEntries(Object.entries(learned).slice(-300));
  return {
    quick: cfg.quick, read: cfg.read, mode: cfg.mode, senders: cfg.senders, packages: cfg.packages,
    payees, keywords: KEYWORDS, incomeKeywords: INCOME_KEYWORDS,
    categories: Object.fromEntries(TX_CATEGORIES.map((c) => [c.id, { label: c.label, type: c.type }])),
    top: topCategories(state), updatedAt: Date.now(),
  };
}

/** The few categories a person uses most, for the buttons the phone offers. */
export function topCategories(state, limit = 4) {
  const score = {};
  (state.transactions || []).forEach((t) => { if (t.type === "expense" && t.catId) score[t.catId] = (score[t.catId] || 0) + 1; });
  return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
}

/** Hands the phone its instructions. A no-op on the web. */
export async function publishCapture(state) {
  const p = prefs();
  if (!p?.set) return { published: false, reason: "not-native" };
  try {
    await p.set({ key: CAPTURE_KEY, value: JSON.stringify(captureConfig(state)) });
    await money()?.refresh?.();
    return { published: true };
  } catch (e) {
    return { published: false, reason: String(e) };
  }
}

/** Payments saved on the phone while the app was closed, and ids undone there. Read once, then cleared. */
export async function takePending() {
  const p = prefs();
  if (!p?.get) return { add: [], undo: [] };
  const read = async (key) => {
    try {
      const { value } = await p.get({ key });
      if (!value) return [];
      await p.remove({ key });
      const rows = JSON.parse(value);
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  };
  const add = (await read(PENDING_TX_KEY)).filter((r) => r && r.amount > 0 && (r.type === "expense" || r.type === "income") && typeof r.date === "string");
  const undo = (await read(UNDO_TX_KEY)).filter((x) => typeof x === "string");
  return { add, undo };
}

/** The payment waiting to be adjusted, once, or null. */
export async function takeDraft() {
  const p = prefs();
  if (!p?.get) return null;
  try {
    const { value } = await p.get({ key: PENDING_DRAFT_KEY });
    if (!value) return null;
    await p.remove({ key: PENDING_DRAFT_KEY });
    const r = JSON.parse(value);
    return r && r.amount > 0 ? r : null;
  } catch { return null; }
}

/** The fields the ledger's editor starts from for a payment that has not been saved. */
export function draftForEditor(r) {
  return {
    type: r.type === "income" ? "income" : "expense", catId: r.catId, category: TX_CAT_BY_ID[r.catId]?.bucket ?? null,
    amount: r.amount, note: "", payee: r.payee || "", date: r.date || todayStr(),
  };
}

/**
 * The ledger after applying what the phone collected: new payments added unless they are already there, and anything undone
 * removed. Returns the same ledger when nothing changed, so the caller can skip a save.
 */
export function applyPending(transactions, { add = [], undo = [] }) {
  let out = transactions || [];
  const undone = new Set(undo);
  if (undone.size) out = out.filter((t) => !undone.has(String(t.id)));
  const fresh = [];
  add.forEach((p) => {
    if (undone.has(String(p.id))) return;
    const all = [...out, ...fresh];
    const sameId = p.id && all.some((t) => String(t.id) === String(p.id));
    // A payment read from a message is a repeat if the same one is already there; a line someone typed is only a repeat if it is the
    // very same entry, because two lunches at one price on one day are two lunches.
    if (sameId || (p.via !== "typed" && alreadyLogged(all, p))) return;
    const r = p.id ? { ...recordFromPayment(p), id: p.id } : recordFromPayment(p);
    fresh.push({ ...r, key: p.key || r.key, createdAt: p.at || r.createdAt });
  });
  return fresh.length || undone.size ? [...out, ...fresh] : transactions;
}

export const describeMoney = (t) => `${Number(t.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} · ${TX_CAT_BY_ID[t.catId]?.label || "Other"}`;
export { guessCategory };
