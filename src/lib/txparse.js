import { addDays, dstr, parseD } from "./date.js";

// Turning words into a transaction, two ways: a line you type ("lunch 12", "+5000 salary") and the message a bank or
// mobile-money service sends after a payment. Plain functions of their input, with no clock and no storage, so the same
// fixtures can check them here and on the phone: the Java parser has to give the same answers or one of them is wrong.

// ---- Categories ----
// What a word suggests about where money went. The person's own history is consulted first (see guessCategory), so this is
// only what's assumed about a payee never seen before. Ordered: the first keyword found in the text wins.
export const KEYWORDS = [
  // needs
  ["naivas", "groceries"], ["quickmart", "groceries"], ["carrefour", "groceries"], ["chandarana", "groceries"], ["tuskys", "groceries"],
  ["supermarket", "groceries"], ["grocer", "groceries"], ["mart", "groceries"], ["market", "groceries"], ["butchery", "groceries"],
  ["vegetable", "groceries"], ["milk", "groceries"], ["bread", "groceries"], ["eggs", "groceries"], ["groceries", "groceries"],
  ["kenya power", "utilities"], ["kplc", "utilities"], ["token", "utilities"], ["electric", "utilities"], ["water", "utilities"],
  ["airtime", "utilities"], ["data bundle", "utilities"], ["bundle", "utilities"], ["wifi", "utilities"], ["internet", "utilities"],
  ["zuku", "utilities"], ["faiba", "utilities"], ["safaricom", "utilities"], ["airtel", "utilities"], ["dstv", "subscriptions"],
  ["gotv", "subscriptions"], ["rent", "rent"], ["rental", "rent"], ["landlord", "rent"], ["housing", "rent"],
  ["uber", "transport"], ["bolt", "transport"], ["little cab", "transport"], ["taxi", "transport"], ["matatu", "transport"],
  ["fare", "transport"], ["bus", "transport"], ["fuel", "transport"], ["petrol", "transport"], ["diesel", "transport"],
  ["shell", "transport"], ["rubis", "transport"], ["totalenergies", "transport"], ["parking", "transport"], ["boda", "transport"],
  ["hospital", "health"], ["pharmacy", "health"], ["chemist", "health"], ["clinic", "health"], ["doctor", "health"],
  ["dental", "health"], ["medic", "health"], ["shif", "insurance"], ["nhif", "insurance"], ["insurance", "insurance"], ["jubilee", "insurance"],
  // wants
  ["kfc", "dining"], ["java", "dining"], ["artcaffe", "dining"], ["cafe", "dining"], ["coffee", "dining"], ["restaurant", "dining"],
  ["pizza", "dining"], ["burger", "dining"], ["chicken", "dining"], ["lunch", "dining"], ["dinner", "dining"], ["breakfast", "dining"],
  ["snack", "dining"], ["eatery", "dining"], ["hotel", "dining"], ["bar", "dining"], ["pub", "dining"], ["drinks", "dining"],
  ["food", "dining"], ["starbucks", "dining"], ["mcdonald", "dining"], ["glovo", "dining"], ["jumia food", "dining"],
  ["jumia", "shopping"], ["kilimall", "shopping"], ["amazon", "shopping"], ["aliexpress", "shopping"], ["shopping", "shopping"],
  ["clothes", "shopping"], ["shoes", "shopping"], ["boutique", "shopping"],
  ["netflix", "subscriptions"], ["spotify", "subscriptions"], ["showmax", "subscriptions"], ["youtube", "subscriptions"],
  ["subscription", "subscriptions"], ["icloud", "subscriptions"], ["google one", "subscriptions"],
  ["cinema", "entertainment"], ["movie", "entertainment"], ["concert", "entertainment"], ["game", "entertainment"], ["betting", "entertainment"],
  ["flight", "travel"], ["airline", "travel"], ["kenya airways", "travel"], ["booking.com", "travel"], ["airbnb", "travel"],
  // money moved on purpose
  ["savings", "saving"], ["sacco", "saving"], ["mshwari", "saving"], ["m-shwari", "saving"], ["kcb mpesa", "saving"],
  ["invest", "investing"], ["stock", "investing"], ["unit trust", "investing"], ["mmf", "investing"],
  ["loan", "debt"], ["fuliza", "debt"], ["repay", "debt"],
];

// For money coming in.
export const INCOME_KEYWORDS = [
  ["salary", "salary"], ["payroll", "salary"], ["wages", "salary"], ["freelance", "freelance"], ["invoice", "freelance"],
  ["client", "freelance"], ["bonus", "bonus"], ["refund", "refund"], ["reversal", "refund"], ["gift", "gift"],
];

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

const CURRENCY = "ksh|kshs|kes|ugx|tzs|ghs|usd|eur|gbp|zar|ngn|rwf|etb|us\\$|\\$|£|€";
const CUR_CODE = { ksh: "KES", kshs: "KES", kes: "KES", ugx: "UGX", tzs: "TZS", ghs: "GHS", usd: "USD", "us$": "USD", $: "USD", eur: "EUR", "€": "EUR", gbp: "GBP", "£": "GBP", zar: "ZAR", ngn: "NGN", rwf: "RWF", etb: "ETB" };
const toNumber = (s) => Number(String(s).replace(/,/g, ""));
const FILLER = new Set(["for", "on", "at", "to", "from", "the", "a", "an", "of", "spent", "paid", "pay", "bought", "buy", "got", "my", "some", "was", "i", "in", "with", "and"]);

const title = (s) => String(s || "")
  .toLowerCase().replace(/\b([a-z])([a-z']*)/g, (_, a, b) => a.toUpperCase() + b)
  .replace(/\b(Kplc|Kfc|Nhif|Shif|Mpesa|Dstv|Gotv|Atm|Kcb)\b/gi, (m) => m.toUpperCase());

const cleanPayee = (s) => title(String(s || "")
  .replace(/^\s*(pos|atm|ecom|pos purchase|mpesa|m-pesa)[/\s-]+/i, "")
  .replace(/\b0\d{9}\b/g, "").replace(/\b\+?254\d{9}\b/g, "").replace(/\b\d{6,}\b/g, "")
  .replace(/[.,;:\-–]+\s*$/g, "").replace(/\s+/g, " ").trim());

// ---- A line you type ----

const WEEKDAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * "lunch 12", "taxi 8.5 uber yesterday", "+5000 salary", "coffee 2k". Everything is read from the words themselves; nothing is
 * assumed that the line does not say. Returns null when there is no amount, because an amount is the one thing a record needs.
 */
export function parseTyped(line, { today, learned = {} } = {}) {
  let text = String(line || "").trim();
  if (!text) return null;
  const base = today || dstr(new Date());

  let date = base;
  const lower = text.toLowerCase();
  let m;
  if (/\byesterday\b|\blast night\b/.test(lower)) { date = addDays(base, -1); text = text.replace(/\byesterday\b|\blast night\b/i, " "); }
  else if ((m = lower.match(/\b(\d{1,2}) days? ago\b/))) { date = addDays(base, -Number(m[1])); text = text.replace(m[0], " "); }
  else if (/\btoday\b|\btonight\b|\bthis morning\b/.test(lower)) { text = text.replace(/\btoday\b|\btonight\b|\bthis morning\b/i, " "); }
  else if ((m = lower.match(new RegExp(`\\b(?:on |last )?(${WEEKDAY.join("|")})\\b`)))) {
    const want = WEEKDAY.indexOf(m[1]);
    let back = (parseD(base).getDay() - want + 7) % 7;
    if (back === 0) back = 7;
    date = addDays(base, -back);
    text = text.replace(new RegExp(`\\b(?:on |last )?${m[1]}\\b`, "i"), " ");
  }

  let type = "expense";
  if (/^\s*\+/.test(text)) { type = "income"; text = text.replace(/^\s*\+/, " "); }
  else if (/\b(salary|got paid|received|income|refund|bonus|gift|paid me|earned|payroll)\b/i.test(text)) type = "income";

  // The amount: a standalone number, optionally with a currency mark and a "k". The first one wins, so "7 up 12" is 7 and the
  // person can say it the other way round; digits glued to letters ("7up", "m3") are part of a word and not read as money.
  const amt = new RegExp(`(?:^|[^\\w.])(?:(?:${CURRENCY})\\s?)?(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)\\s?(k\\b)?(?![\\w])`, "i");
  const hit = text.match(amt);
  if (!hit) return null;
  let amount = toNumber(hit[1]);
  if (hit[2]) amount *= 1000;
  if (!(amount > 0)) return null;
  const rest = text.replace(hit[0], (x) => (/^\w/.test(x) ? " " : x[0] + " ")).replace(new RegExp(`\\b(${CURRENCY})\\b`, "ig"), " ");

  const words = rest.replace(/[^\p{L}\p{N}\s'&.-]/gu, " ").split(/\s+/).filter((w) => w && !FILLER.has(w.toLowerCase()));
  const payee = title(words.join(" "));
  return {
    amount: Math.round(amount * 100) / 100, type, date, payee,
    catId: guessCategory(payee, type, learned), via: "typed",
  };
}

// ---- A message from a bank or mobile-money service ----

// Words that say which way the money went. The first match wins, so the order matters: "received" before "sent", because
// an M-Pesa receipt for money you were sent can also mention the person who sent it.
const INCOME_WORDS = /\b(you have received|you've received|has been credited|was credited|credited with|credit alert|received from|deposited|deposit of|salary|credited)\b/i;
const EXPENSE_WORDS = /\b(sent to|paid to|you have sent|you've sent|you sent|payment of|payment to|purchase of|purchase at|transacted|you bought|you have bought|spent|debited|debit alert|withdrawn|withdraw|transferred to|you have paid|you paid|charged)\b/i;
const IGNORE_WORDS = /\b(otp|one[- ]time|verification code|passcode|your pin|reversal of|fuliza m-?pesa amount|loan limit|you have been awarded|congratulations)\b/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n) => String(n).padStart(2, "0");

function readDate(text) {
  let m = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${y}-${pad(m[2])}-${pad(m[1])}`;
  }
  m = text.match(new RegExp(`\\b(\\d{1,2})[ -]?(${MONTHS.join("|")})[a-z]*[ ,-]*(\\d{2}|\\d{4})\\b`, "i"));
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${pad(MONTHS.indexOf(m[2].toLowerCase()) + 1)}-${pad(m[1])}`;
  }
  return null;
}

function readTime(text) {
  const m = text.match(/\b(\d{1,2}):(\d{2})\s?(am|pm)?\b/i);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  return h <= 23 ? `${pad(h)}:${m[2]}` : null;
}

// Amounts that are not the payment: what is left in the account, what the transfer cost, what can still be spent today.
const NOT_THE_PAYMENT = /(balance|bal\b|cost|fee|charge|limit|can transact|available|avail)\W*(is|of|:)?\W*$/i;

function readAmount(text) {
  const re = new RegExp(`(?:\\b(${CURRENCY})\\s?|(?<![\\w])(${CURRENCY})\\s?)(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)|(\\d{1,3}(?:,\\d{3})+(?:\\.\\d{1,2})?|\\d+(?:\\.\\d{1,2})?)\\s?(${CURRENCY})\\b`, "ig");
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 26), m.index);
    if (NOT_THE_PAYMENT.test(before)) continue;
    const cur = (m[1] || m[2] || m[5] || "").toLowerCase();
    return { amount: toNumber(m[3] || m[4]), cur: CUR_CODE[cur] || cur.toUpperCase() };
  }
  return null;
}

function readRef(text) {
  let m = text.match(/^\s*([A-Z0-9]{8,12})\b\s*(?:confirmed|Confirmed)/);
  if (m) return m[1];
  m = text.match(/\b(?:TID|Txn ID|Transaction ID|Trans ID|Ref(?:erence)?(?: No)?)[:.\s]+([A-Z0-9][A-Z0-9._-]{5,30})/i);
  return m ? m[1].replace(/[.\-_]+$/, "").toUpperCase() : null;
}

// Who the money went to or came from. Each shape a message takes is its own pattern, tried in order; the first that finds a
// name wins. The stop words are what end a name: "on 17/8/23", a phone number, "for account", a full stop.
const AMOUNT = `(?:${CURRENCY})\\s?[\\d,]+(?:\\.\\d+)?`;
const STOP = "(?=\\s+(?:on|at|for account|ref|via|using|successful|was|has|new|transaction|balance|avail|bal)\\b|\\s+\\(|\\s+\\d{9,}|\\.\\s|\\.$|,|$)";
const STOP_FROM = "(?=\\s+\\d{9,}|\\s+on\\b|\\s+at\\b|\\.\\s|\\.$|$)";
const PAYEE_OUT = [
  new RegExp(`\\b(?:paid|sent|transferred|payment of)\\s+(?:${AMOUNT}\\s+)?to\\s+(.+?)${STOP}`, "i"),
  /\b(?:merchant|info|desc|details?)[:\s]+([A-Za-z0-9 &'./-]+?)(?=\s+(?:avail|bal|on|ref)\b|\.\s|\.$|$)/i,
  /\b(?:purchase(?: of)?|spent|transacted)\b.*?\bat\s+(.+?)(?=\s+on\b|\s+using\b|\s+via\b|\s+card\b|\.\s|\.$|$)/i,
  /\bat\s+([A-Z][A-Za-z0-9 &'./-]+?)(?=\s+on\b|\s+using\b|\s+card\b|\.\s|\.$|$)/,
];
const PAYEE_IN = [new RegExp(`\\bfrom\\s+(.+?)${STOP_FROM}`, "i")];

function readParty(text, type) {
  let m;
  if (/\bairtime\b/i.test(text) && /\bbought\b/i.test(text)) return "Airtime";
  if ((m = text.match(/\bwithdraw(?:n)?\b.*?\bfrom\s+\d+\s*[-\u2013]\s*([A-Za-z0-9 &'.]+?)(?=\s+(?:new|on|at)\b|\.\s|\.$|$)/i))) return `${cleanPayee(m[1])} (cash)`;
  if (/\bwithdraw(?:n)?\b/i.test(text)) return "Cash withdrawal";
  const forAccount = text.match(/for account\s+([A-Za-z0-9-]+)/i);
  for (const re of type === "income" ? PAYEE_IN : PAYEE_OUT) {
    m = text.match(re);
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
  if (text.length < 12 || IGNORE_WORDS.test(text)) return null;
  const money = readAmount(text);
  if (!money || !(money.amount > 0)) return null;
  const isIncome = INCOME_WORDS.test(text);
  const isExpense = EXPENSE_WORDS.test(text);
  if (!isIncome && !isExpense) return null;
  const type = isIncome && !/\b(sent to|paid to)\b/i.test(text) ? "income" : "expense";
  const payee = readParty(text, type);
  const when = new Date(now);
  const date = readDate(text) || dstr(when);
  const time = readTime(text) || `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const forCat = `${payee} ${/airtime/i.test(text) ? "airtime" : ""}`;
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
