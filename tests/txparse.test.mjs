import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { suite } from "./harness.mjs";
import {
  alreadyLogged, guessCategory, learnedPayees, parseMessage, parseTyped, paymentKey, toTransaction,
} from "../src/lib/txparse.js";

const t = suite("txparse");
const load = (name) => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", name), "utf8"));
const NOW = new Date("2026-10-12T14:30:00").getTime();

// Both files are also read by the phone's own parser (android/.../MoneyParseTest): one set of cases, two implementations.
const messages = load("tx-messages.json");
messages.forEach((c) => {
  const got = parseMessage(c.text, { now: NOW });
  if (c.expect === null) { t.eq(`message: ${c.name}`, got, null); return; }
  if (!got) { t.ok(`message: ${c.name}`, false, "parsed as nothing"); return; }
  const wrong = Object.entries(c.expect).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k}: want ${JSON.stringify(v)}, got ${JSON.stringify(got[k])}`);
  t.ok(`message: ${c.name}`, wrong.length === 0, wrong.join("; "));
});

load("tx-typed.json").forEach((c) => {
  const got = parseTyped(c.line, { today: c.today });
  if (c.expect === null) { t.eq(`typed: "${c.line}"`, got, null); return; }
  if (!got) { t.ok(`typed: "${c.line}"`, false, "parsed as nothing"); return; }
  const wrong = Object.entries(c.expect).filter(([k, v]) => got[k] !== v).map(([k, v]) => `${k}: want ${JSON.stringify(v)}, got ${JSON.stringify(got[k])}`);
  t.ok(`typed: "${c.line}"`, wrong.length === 0, wrong.join("; "));
});

// ---- when the message doesn't say when ----
const noDate = parseMessage("You sent $20.00 to Sam Wilson", { now: NOW });
t.eq("without a date or time of its own, a message is stamped with when it arrived", [noDate.date, noDate.time], ["2026-10-12", "14:30"]);

// ---- the person's own history comes first ----
const ledger = [
  { payee: "Mama Mboga", catId: "groceries", date: "2026-09-01" },
  { payee: "Mama Mboga", catId: "dining", date: "2026-10-01" },
  { payee: "Joseph Kamau", catId: "rent", date: "2026-10-02" },
  { payee: "x", catId: "dining", date: "2026-10-03" },
];
const learned = learnedPayees(ledger);
t.eq("the latest category for a payee wins", learned["mama mboga"], "dining");
t.eq("a payee seen once is learned", learned["joseph kamau"], "rent");
t.ok("a one-letter payee is not", !("x" in learned));
t.eq("learned beats the built-in guess", guessCategory("Joseph Kamau", "expense", learned), "rent");
t.eq("a longer name that contains a learned one still matches", guessCategory("Mama Mboga Westlands", "expense", learned), "dining");
t.eq("the built-in guess is the fallback", guessCategory("Naivas", "expense", learned), "groceries");
t.eq("an unknown payee is 'other'", guessCategory("Zzzz Ltd", "expense", {}), "other_expense");
t.eq("and for income too", guessCategory("Zzzz Ltd", "income", {}), "other_income");
t.eq("a keyword is a word, not a fragment of one", guessCategory("Barbados", "expense", {}), "other_expense");
const withLearned = parseMessage("Confirmed. Ksh500.00 sent to JOSEPH KAMAU 0733112233 on 17/8/23 at 2:15 PM. New balance Ksh10.00", { now: NOW, learned });
t.eq("a message uses what you've taught it", withLearned.catId, "rent");

// ---- the same payment twice ----
const a = parseMessage(messages[1].text, { now: NOW });
const b = parseMessage(messages[1].text, { now: NOW + 60000 });
t.eq("a payment with a reference has a stable key", paymentKey(a), paymentKey(b));
t.eq("keyed on the reference", paymentKey(a), "ref:SBH7K2LM9R");
const noRef = parseMessage("Purchase of USD 12.50 at STARBUCKS on card ending 1234.", { now: NOW });
t.ok("one without is keyed on what and when", /^expense\|12.5\|starbucks\|2026-10-12\|14:3/.test(paymentKey(noRef)), paymentKey(noRef));
const tx = toTransaction(a, { at: 5 });
t.eq("a ledger record carries the payment", [tx.amount, tx.type, tx.catId, tx.payee, tx.via, tx.ref], [1200, "expense", "groceries", "Naivas Supermarket", "message", "SBH7K2LM9R"]);
t.eq("with an id that is the same each time", toTransaction(b).id, tx.id);
t.eq("so a record is recognised as already logged", alreadyLogged([tx], b), true);
t.eq("and a different payment is not", alreadyLogged([tx], parseMessage(messages[0].text, { now: NOW })), false);
t.eq("a reference matches an entry that was edited", alreadyLogged([{ ...tx, key: "other", amount: 5 }], b), true);
t.eq("an empty ledger has nothing logged", alreadyLogged([], b), false);
