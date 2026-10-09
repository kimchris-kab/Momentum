import { addDays, dstr, parseD } from "./date.js";
import P from "./txpatterns.json" with { type: "json" };

// Turning words into a transaction, two ways: a line you type ("lunch 12", "+5000 salary") and the message a bank or
// mobile-money service sends after a payment. Plain functions of their input, with no clock and no storage.
//
// The phone has its own parser, because messages arrive while the app is closed, and the two must agree. So what they have in
// common is data, not code: every pattern and keyword is in txpatterns.json, read by this file and by the Java one, and the
// cases in tests/fixtures are run through both. The control flow below is mirrored in MoneyParse.java, line for line.

export const KEYWORDS = P.keywords;
export const INCOME_KEYWORDS = P.incomeKeywords;

const sub = (src) => src.replace(/\{CUR\}/g, P.currency).replace(/\{STOP\}/g, P.message.stop);
const re = (src, flags = "") => new RegExp(sub(src), flags);

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Where a payment probably belongs. `learned` is the person's own payee -> category map (lower-cased payee, newest
 * entry wins); it is tried by exact payee and then by containment before any built-in guess.
 */
export function guessCategory(text, type = "expense", learned = {}) {
  const t = norm(text);
  if (!t) return type === "income" ? "other_income" : "other_expense";
  if (learned[t]) return learned[t];
  const hit = Object.keys(learned).find((k) => k.length >= 4 && (t.includes(k) || k.includes(t)));
  if (hit) return learned[hit];
  const table = type === "income" ? INCOME_KEYWORDS : KEYWORDS;
  // A keyword starts a word; a short one is the whole word, so "bar" is not found in "Barbados". Longer ones may be stems:
  // "medic" finds "medical".
  const found = table.find(([kw]) => new RegExp(`(^|[^a-z])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${kw.length <= 4 ? "(?![a-z])" : ""}`).test(t));
  if (found) return found[1];
  return type === "income" ? "other_income" : "other_expense";
}

/** The person's own category for each payee they have logged, from the ledger: the most recent entry wins. */
export function learnedPayees(transactions) {
  const out = {};
  [...(transactions || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach((t) => {
    const k = norm(t.payee);
    if (k.length >= 3 && t.catId) out[k] = t.catId;
  });
  return out;
}

// ---- Shared helpers ----

const toNumber = (s) => Number(String(s).replace(/,/g, ""));
const FILLER = new Set(P.filler);
const pad = (n) => String(n).padStart(2, "0");
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

// Capitalises each word of a name: "NAIVAS SUPERMARKET" -> "Naivas Supermarket", and puts known acronyms back in capitals.
const title = (s) => {
  const words = String(s || "").toLowerCase().replace(/\b([a-z])([a-z']*)/g, (_, a, b) => a.toUpperCase() + b);
  return words.replace(re(`\\b(${P.acronyms.join("|")})\\b`, "gi"), (m) => m.toUpperCase());
};

const RX = {
  channel: re(P.clean.channel, "i"), phone10: re(P.clean.phone10, "g"), phoneIntl: re(P.clean.phoneIntl, "g"),
  longDigits: re(P.clean.longDigits, "g"), tail: re(P.clean.tail, ""),
};
const cleanPayee = (s) => title(String(s || "")
  .replace(RX.channel, "")
  .replace(RX.phone10, "").replace(RX.phoneIntl, "").replace(RX.longDigits, "")
  .replace(RX.tail, "").replace(/\s+/g, " ").trim());

// ---- A line you type ----

const WEEKDAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const T = {
  yesterday: re(P.typed.yesterday, "i"), daysAgo: re(P.typed.daysAgo, "i"), today: re(P.typed.today, "i"), weekday: re(P.typed.weekday, "i"),
  plus: re(P.typed.plus), incomeWords: re(P.typed.incomeWords, "i"), amount: re(P.typed.amount, "i"),
  currencyWord: re(P.typed.currencyWord, "ig"), notWord: re(P.typed.notWord, "gu"),
};

// Cuts the first match out of a string, by position, leaving a space.
const cut = (text, m, keep = "") => `${text.slice(0, m.index)}${keep} ${text.slice(m.index + m[0].length)}`;

/**
 * "lunch 12", "taxi 8.5 uber yesterday", "+5000 salary", "coffee 2k". Everything is read from the words themselves; nothing is
 * assumed that the line does not say. Returns null when there is no amount, because an amount is the one thing a record needs.
 */
export function parseTyped(line, { today, learned = {} } = {}) {
  let text = String(line || "").trim();
  if (!text) return null;
  const base = today || dstr(new Date());

  let date = base;
  let m;
  if ((m = text.match(T.yesterday))) { date = addDays(base, -1); text = cut(text, m); }
  else if ((m = text.match(T.daysAgo))) { date = addDays(base, -Number(m[1])); text = cut(text, m); }
  else if ((m = text.match(T.today))) { text = cut(text, m); }
  else if ((m = text.match(T.weekday))) {
    const want = WEEKDAY.indexOf(m[1].toLowerCase());
    let back = (parseD(base).getDay() - want + 7) % 7;
    if (back === 0) back = 7;
    date = addDays(base, -back);
    text = cut(text, m);
  }

  let type = "expense";
  if ((m = text.match(T.plus))) { type = "income"; text = cut(text, m); }
  else if (T.incomeWords.test(text)) type = "income";

  // The amount: a standalone number, optionally with a currency mark and a "k". The first one wins; digits glued to letters
  // ("7up", "m3") are part of a word and not read as money.
  const hit = text.match(T.amount);
  if (!hit) return null;
  let amount = toNumber(hit[1]);
  if (hit[2]) amount *= 1000;
  if (!(amount > 0)) return null;
  // The match may begin with a separator that belongs to the rest of the line; keep it, drop the number.
  const lead = /^\w/.test(hit[0]) ? "" : hit[0][0];
  const rest = cut(text, hit, lead).replace(T.currencyWord, " ");

  const words = rest.replace(T.notWord, " ").split(/\s+/).filter((w) => w && !FILLER.has(w.toLowerCase()));
  const payee = title(words.join(" "));
  return {
    amount: Math.round(amount * 100) / 100, type, date, payee,
    catId: guessCategory(payee, type, learned), via: "typed",
  };
}

// ---- A message from a bank or mobile-money service ----

const M = {
  ignore: re(P.message.ignore, "i"), income: re(P.message.income, "i"), expense: re(P.message.expense, "i"),
  sentOrPaidTo: re(P.message.sentOrPaidTo, "i"), notThePayment: re(P.message.notThePayment, "i"),
  amounts: [re(P.message.amountA, "ig"), re(P.message.amountB, "ig"), re(P.message.amountC, "ig")],
  dateSlash: re(P.message.dateSlash), dateMonth: re(P.message.dateMonth, "i"), time: re(P.message.time, "i"),
  refLead: re(P.message.refLead), refTag: re(P.message.refTag, "i"),
  airtime: re(P.message.airtime, "i"), bought: re(P.message.bought, "i"),
  withdrawFrom: re(P.message.withdrawFrom, "i"), withdraw: re(P.message.withdraw, "i"), forAccount: re(P.message.forAccount, "i"),
  out: P.message.out.map((src, i) => re(src, P.message.outFlags[i])), in: P.message.in.map((src) => re(src, "i")),
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function readDate(text) {
  let m = text.match(M.dateSlash);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  m = text.match(M.dateMonth);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(m[1])}`;
  }
  return null;
}

function readTime(text) {
  const m = text.match(M.time);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return h <= 23 ? `${pad(h)}:${m[2]}` : null;
}

// Every amount in the message with the currency beside it, in the order they appear; the payment is the first that isn't a
// balance, a fee or a limit. (The three patterns are the three ways a currency can sit next to a number.)
function readAmount(text) {
  const found = [];
  M.amounts.forEach((rx, k) => {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(text))) {
      const cur = k === 2 ? m[2] : m[1];
      const num = k === 2 ? m[1] : m[2];
      found.push({ index: m.index, cur: cur.toLowerCase(), num });
    }
  });
  found.sort((a, b) => a.index - b.index);
  for (const f of found) {
    const before = text.slice(Math.max(0, f.index - 26), f.index);
    if (M.notThePayment.test(before)) continue;
    return { amount: toNumber(f.num), cur: P.currencyCodes[f.cur] || f.cur.toUpperCase() };
  }
  return null;
}

function readRef(text) {
  let m = text.match(M.refLead);
  if (m) return m[1];
  m = text.match(M.refTag);
  return m ? m[1].replace(/[.\-_]+$/, "").toUpperCase() : null;
}

// Who the money went to or came from. Each shape a message takes is its own pattern, tried in order; the first that finds a
// name wins.
function readParty(text, type) {
  let m;
  if (M.airtime.test(text) && M.bought.test(text)) return "Airtime";
  if ((m = text.match(M.withdrawFrom))) return `${cleanPayee(m[1])} (cash)`;
  if (M.withdraw.test(text)) return "Cash withdrawal";
  const forAccount = text.match(M.forAccount);
  for (const rx of type === "income" ? M.in : M.out) {
    m = text.match(rx);
    const name = m ? cleanPayee(m[1]) : "";
    if (name) return forAccount && type === "expense" ? `${name} (${forAccount[1]})` : name;
  }
  return "";
}

/**
 * A payment read out of a message, or null if the message is not clearly one. `now` is when it arrived, used for the date
 * and time when the message doesn't carry its own. Being wrong about "this is a payment" costs a pointless prompt, so
 * the test is deliberate: an amount, and a verb that says which way the money went.
 */
export function parseMessage(raw, { now = Date.now(), learned = {} } = {}) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (text.length < 12 || M.ignore.test(text)) return null;
  const money = readAmount(text);
  if (!money || !(money.amount > 0)) return null;
  const isIncome = M.income.test(text);
  const isExpense = M.expense.test(text);
  if (!isIncome && !isExpense) return null;
  const type = isIncome && !M.sentOrPaidTo.test(text) ? "income" : "expense";
  const payee = readParty(text, type);
  const when = new Date(now);
  const date = readDate(text) || dstr(when);
  const time = readTime(text) || `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const forCat = `${payee} ${M.airtime.test(text) ? "airtime" : ""}`;
  let catId = guessCategory(forCat, type, learned);
  // Money in often says what it is only in the narration ("SALARY AUGUST", "Invoice 4411"), not in who sent it.
  if (type === "income" && catId === "other_income") catId = guessCategory(text, type, {});
  return {
    amount: Math.round(money.amount * 100) / 100, cur: money.cur, type, payee, date, time,
    ref: readRef(text), catId, via: "message",
  };
}

/** A key that says two reads are the same payment: the reference when there is one, otherwise what and when. */
export const paymentKey = (p) => (p.ref ? `ref:${p.ref}` : `${p.type}|${p.amount}|${norm(p.payee)}|${p.date}|${String(p.time || "").slice(0, 4)}`);

/** Whether this payment is already in the ledger, so a text and an app notification for one payment give one entry. */
export function alreadyLogged(transactions, p) {
  const key = paymentKey(p);
  return (transactions || []).some((t) => (t.key && t.key === key) || (p.ref && t.ref === p.ref)
    || (!p.ref && t.via && t.type === p.type && Number(t.amount) === p.amount && t.date === p.date && norm(t.payee) === norm(p.payee)));
}

/** The ledger record for a read payment, with an id that is the same each time so draining it twice does not duplicate it. */
export function toTransaction(p, { id, at = Date.now() } = {}) {
  const key = paymentKey(p);
  return {
    id: id || `cap-${key.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 60)}`,
    type: p.type, amount: p.amount, catId: p.catId, date: p.date, payee: p.payee || "", note: p.note || "",
    via: p.via || "message", ref: p.ref || null, key, createdAt: at,
  };
}
