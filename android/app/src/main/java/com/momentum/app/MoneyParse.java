package com.momentum.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.GregorianCalendar;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads a payment out of words: a line typed into the notification, or the message a bank or mobile-money service sends.
 *
 * This is the phone's copy of src/lib/txparse.js, because messages arrive while the app is closed. Everything the two have in common is data: the
 * patterns and keywords are in src/lib/txpatterns.json (packaged here as an asset), and the control flow below follows the JavaScript one function
 * for function. The cases in tests/fixtures are run through both; if they ever disagree, one of them is wrong.
 */
final class MoneyParse {

    private MoneyParse() { }

    /** What was read. Null fields are simply unknown. */
    static final class Payment {
        double amount;
        String cur = null;
        String type = "expense";
        String payee = "";
        String date;
        String time = null;
        String ref = null;
        String catId;
        String via;
    }

    /** What the person has taught the app: their own payees, as lower-cased name to category id. */
    static final class Learned {
        /** In the order the app wrote them, which is the order the JavaScript tries them in. */
        final Map<String, String> payees = new LinkedHashMap<>();
    }

    // ---- the shared data ----

    private static final class Data {
        String currency;
        JSONObject codes;
        Set<String> filler = new HashSet<>();
        List<String> acronyms = new ArrayList<>();
        JSONArray keywords;
        JSONArray incomeKeywords;
        JSONObject typed;
        JSONObject message;
        JSONObject clean;
    }

    private static Data data;
    private static final Map<String, Pattern> CACHE = new HashMap<>();

    /** Loads the shared patterns once. Safe to call from anywhere; the asset ships inside the app. */
    static synchronized void load(Context context) {
        if (data != null) return;
        try (InputStream in = context.getAssets().open("txpatterns.json")) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            JSONObject o = new JSONObject(out.toString("UTF-8"));
            Data d = new Data();
            d.currency = o.getString("currency");
            d.codes = o.getJSONObject("currencyCodes");
            JSONArray f = o.getJSONArray("filler");
            for (int i = 0; i < f.length(); i++) d.filler.add(f.getString(i));
            JSONArray a = o.getJSONArray("acronyms");
            for (int i = 0; i < a.length(); i++) d.acronyms.add(a.getString(i));
            d.keywords = o.getJSONArray("keywords");
            d.incomeKeywords = o.getJSONArray("incomeKeywords");
            d.typed = o.getJSONObject("typed");
            d.message = o.getJSONObject("message");
            d.clean = o.getJSONObject("clean");
            data = d;
            CACHE.clear();
        } catch (Exception e) {
            throw new IllegalStateException("txpatterns.json is missing or unreadable", e);
        }
    }

    /** The same substitutions the JavaScript does: {CUR} and {STOP}. */
    private static String sub(String src) {
        return src.replace("{CUR}", data.currency).replace("{STOP}", data.message.optString("stop"));
    }

    private static Pattern re(String src, boolean ignoreCase) {
        String key = (ignoreCase ? "i:" : "-:") + src;
        Pattern p = CACHE.get(key);
        if (p == null) {
            p = Pattern.compile(sub(src), ignoreCase ? Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE : 0);
            CACHE.put(key, p);
        }
        return p;
    }

    private static String typed(String name) { return data.typed.optString(name); }
    private static String msg(String name) { return data.message.optString(name); }

    // ---- small helpers ----

    static String norm(String s) {
        if (s == null) return "";
        return s.toLowerCase(Locale.ROOT).replaceAll("[\\s\\p{Z}]+", " ").trim();
    }

    private static double toNumber(String s) {
        return Double.parseDouble(s.replace(",", ""));
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private static String pad(int n) {
        return n < 10 ? "0" + n : String.valueOf(n);
    }

    private static String pad(String n) {
        return pad(Integer.parseInt(n));
    }

    /** Capitalises each word and puts known acronyms back in capitals: "NAIVAS SUPERMARKET" becomes "Naivas Supermarket". */
    static String title(String s) {
        String lower = s == null ? "" : s.toLowerCase(Locale.ROOT);
        Matcher m = Pattern.compile("\\b([a-z])([a-z']*)").matcher(lower);
        StringBuffer sb = new StringBuffer();
        while (m.find()) m.appendReplacement(sb, Matcher.quoteReplacement(m.group(1).toUpperCase(Locale.ROOT) + m.group(2)));
        m.appendTail(sb);
        StringBuilder alt = new StringBuilder();
        for (String a : data.acronyms) alt.append(alt.length() == 0 ? "" : "|").append(a);
        Matcher ac = Pattern.compile("\\b(" + alt + ")\\b", Pattern.CASE_INSENSITIVE).matcher(sb.toString());
        StringBuffer out = new StringBuffer();
        while (ac.find()) ac.appendReplacement(out, Matcher.quoteReplacement(ac.group().toUpperCase(Locale.ROOT)));
        ac.appendTail(out);
        return out.toString();
    }

    private static String cleanPayee(String s) {
        String t = s == null ? "" : s;
        t = re(data.clean.optString("channel"), true).matcher(t).replaceFirst("");
        t = re(data.clean.optString("phone10"), false).matcher(t).replaceAll("");
        t = re(data.clean.optString("phoneIntl"), false).matcher(t).replaceAll("");
        t = re(data.clean.optString("longDigits"), false).matcher(t).replaceAll("");
        t = re(data.clean.optString("tail"), false).matcher(t).replaceFirst("");
        t = t.replaceAll("\\s+", " ").trim();
        return title(t);
    }

    // ---- dates ----

    private static GregorianCalendar parseD(String s) {
        String[] p = s.split("-");
        return new GregorianCalendar(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]));
    }

    static String dstr(Calendar c) {
        return c.get(Calendar.YEAR) + "-" + pad(c.get(Calendar.MONTH) + 1) + "-" + pad(c.get(Calendar.DAY_OF_MONTH));
    }

    static String addDays(String date, int n) {
        GregorianCalendar c = parseD(date);
        c.add(Calendar.DAY_OF_MONTH, n);
        return dstr(c);
    }

    static String today(long now) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(now);
        return dstr(c);
    }

    // ---- guessing a category ----

    private static final Map<String, Pattern> KW = new HashMap<>();

    /** Where a payment probably belongs: your own history first, then the built-in keywords. */
    static String guessCategory(String text, String type, Learned learned) {
        String t = norm(text);
        boolean income = "income".equals(type);
        if (t.isEmpty()) return income ? "other_income" : "other_expense";
        if (learned != null) {
            String exact = learned.payees.get(t);
            if (exact != null) return exact;
            for (Map.Entry<String, String> e : learned.payees.entrySet()) {
                String k = e.getKey();
                if (k.length() >= 4 && (t.contains(k) || k.contains(t))) return e.getValue();
            }
        }
        JSONArray table = income ? data.incomeKeywords : data.keywords;
        for (int i = 0; i < table.length(); i++) {
            JSONArray row = table.optJSONArray(i);
            if (row == null) continue;
            String kw = row.optString(0);
            Pattern p = KW.get(kw);
            if (p == null) {
                p = Pattern.compile("(^|[^a-z])" + Pattern.quote(kw) + (kw.length() <= 4 ? "(?![a-z])" : ""));
                KW.put(kw, p);
            }
            if (p.matcher(t).find()) return row.optString(1);
        }
        return income ? "other_income" : "other_expense";
    }

    // ---- a line you type ----

    private static final String[] WEEKDAY = { "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday" };

    /** Text with the match cut out and a space (and optionally a kept character) left in its place. */
    private static String cut(String text, Matcher m, String keep) {
        return text.substring(0, m.start()) + keep + " " + text.substring(m.end());
    }

    static Payment parseTyped(String line, String today, Learned learned) {
        String text = line == null ? "" : line.trim();
        if (text.isEmpty()) return null;
        String base = today;

        String date = base;
        Matcher m;
        if ((m = re(typed("yesterday"), true).matcher(text)).find()) { date = addDays(base, -1); text = cut(text, m, ""); }
        else if ((m = re(typed("daysAgo"), true).matcher(text)).find()) { date = addDays(base, -Integer.parseInt(m.group(1))); text = cut(text, m, ""); }
        else if ((m = re(typed("today"), true).matcher(text)).find()) { text = cut(text, m, ""); }
        else if ((m = re(typed("weekday"), true).matcher(text)).find()) {
            int want = 0;
            String w = m.group(1).toLowerCase(Locale.ROOT);
            for (int i = 0; i < WEEKDAY.length; i++) if (WEEKDAY[i].equals(w)) want = i;
            int back = (parseD(base).get(Calendar.DAY_OF_WEEK) - 1 - want + 7) % 7;
            if (back == 0) back = 7;
            date = addDays(base, -back);
            text = cut(text, m, "");
        }

        String type = "expense";
        if ((m = re(typed("plus"), false).matcher(text)).find()) { type = "income"; text = cut(text, m, ""); }
        else if (re(typed("incomeWords"), true).matcher(text).find()) type = "income";

        Matcher hit = re(typed("amount"), true).matcher(text);
        if (!hit.find()) return null;
        double amount = toNumber(hit.group(1));
        if (hit.group(2) != null) amount *= 1000;
        if (!(amount > 0)) return null;
        String whole = hit.group();
        String lead = Character.isLetterOrDigit(whole.charAt(0)) || whole.charAt(0) == '_' ? "" : whole.substring(0, 1);
        String rest = cut(text, hit, lead);
        rest = re(typed("currencyWord"), true).matcher(rest).replaceAll(" ");

        rest = re(typed("notWord"), false).matcher(rest).replaceAll(" ");
        StringBuilder words = new StringBuilder();
        for (String w : rest.split("\\s+")) {
            if (w.isEmpty() || data.filler.contains(w.toLowerCase(Locale.ROOT))) continue;
            if (words.length() > 0) words.append(' ');
            words.append(w);
        }
        String payee = title(words.toString());
        Payment p = new Payment();
        p.amount = round2(amount);
        p.type = type;
        p.date = date;
        p.payee = payee;
        p.catId = guessCategory(payee, type, learned);
        p.via = "typed";
        return p;
    }

    // ---- a message from a bank or mobile-money service ----

    private static final String[] MONTHS = { "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec" };

    private static String readDate(String text) {
        Matcher m = re(msg("dateSlash"), false).matcher(text);
        if (m.find()) {
            int y = m.group(3).length() == 2 ? 2000 + Integer.parseInt(m.group(3)) : Integer.parseInt(m.group(3));
            int mo = Integer.parseInt(m.group(2));
            if (mo >= 1 && mo <= 12) return y + "-" + pad(mo) + "-" + pad(m.group(1));
        }
        m = re(msg("dateMonth"), true).matcher(text);
        if (m.find()) {
            int y = m.group(3).length() == 2 ? 2000 + Integer.parseInt(m.group(3)) : Integer.parseInt(m.group(3));
            String mon = m.group(2).toLowerCase(Locale.ROOT);
            int idx = 0;
            for (int i = 0; i < MONTHS.length; i++) if (MONTHS[i].equals(mon)) idx = i;
            return y + "-" + pad(idx + 1) + "-" + pad(m.group(1));
        }
        return null;
    }

    private static String readTime(String text) {
        Matcher m = re(msg("time"), true).matcher(text);
        if (!m.find()) return null;
        int h = Integer.parseInt(m.group(1));
        if (m.group(3) != null) {
            boolean pm = "pm".equalsIgnoreCase(m.group(3));
            if (pm && h < 12) h += 12;
            if (!pm && h == 12) h = 0;
        }
        return h <= 23 ? pad(h) + ":" + m.group(2) : null;
    }

    private static final class Found {
        int index;
        String cur;
        String num;
    }

    /** Every amount with its currency, in the order they appear; the payment is the first that isn't a balance, a fee or a limit. */
    private static double[] readAmount(String text, String[] curOut) {
        List<Found> found = new ArrayList<>();
        String[] keys = { "amountA", "amountB", "amountC" };
        for (int k = 0; k < keys.length; k++) {
            Matcher m = re(msg(keys[k]), true).matcher(text);
            while (m.find()) {
                Found f = new Found();
                f.index = m.start();
                f.cur = (k == 2 ? m.group(2) : m.group(1)).toLowerCase(Locale.ROOT);
                f.num = k == 2 ? m.group(1) : m.group(2);
                found.add(f);
            }
        }
        found.sort((a, b) -> Integer.compare(a.index, b.index));
        Pattern not = re(msg("notThePayment"), true);
        for (Found f : found) {
            String before = text.substring(Math.max(0, f.index - 26), f.index);
            if (not.matcher(before).find()) continue;
            String code = data.codes.optString(f.cur, f.cur.toUpperCase(Locale.ROOT));
            curOut[0] = code;
            return new double[] { toNumber(f.num) };
        }
        return null;
    }

    private static String readRef(String text) {
        Matcher m = re(msg("refLead"), false).matcher(text);
        if (m.find()) return m.group(1);
        m = re(msg("refTag"), true).matcher(text);
        return m.find() ? m.group(1).replaceAll("[.\\-_]+$", "").toUpperCase(Locale.ROOT) : null;
    }

    private static String readParty(String text, String type) {
        Matcher m;
        if (re(msg("airtime"), true).matcher(text).find() && re(msg("bought"), true).matcher(text).find()) return "Airtime";
        if ((m = re(msg("withdrawFrom"), true).matcher(text)).find()) return cleanPayee(m.group(1)) + " (cash)";
        if (re(msg("withdraw"), true).matcher(text).find()) return "Cash withdrawal";
        Matcher fa = re(msg("forAccount"), true).matcher(text);
        String account = fa.find() ? fa.group(1) : null;
        JSONArray list = data.message.optJSONArray("income".equals(type) ? "in" : "out");
        JSONArray flags = data.message.optJSONArray("outFlags");
        for (int i = 0; i < list.length(); i++) {
            boolean ci = "income".equals(type) || (flags != null && "i".equals(flags.optString(i)));
            m = re(list.optString(i), ci).matcher(text);
            String name = m.find() ? cleanPayee(m.group(1)) : "";
            if (!name.isEmpty()) return account != null && "expense".equals(type) ? name + " (" + account + ")" : name;
        }
        return "";
    }

    /** A payment read out of a message, or null if the message is not clearly one. */
    static Payment parseMessage(String raw, long now, Learned learned) {
        String text = raw == null ? "" : raw.replaceAll("[\\s\\p{Z}]+", " ").trim();
        if (text.length() < 12 || re(msg("ignore"), true).matcher(text).find()) return null;
        String[] cur = new String[1];
        double[] amount = readAmount(text, cur);
        if (amount == null || !(amount[0] > 0)) return null;
        boolean isIncome = re(msg("income"), true).matcher(text).find();
        boolean isExpense = re(msg("expense"), true).matcher(text).find();
        if (!isIncome && !isExpense) return null;
        String type = isIncome && !re(msg("sentOrPaidTo"), true).matcher(text).find() ? "income" : "expense";
        String payee = readParty(text, type);
        Calendar when = Calendar.getInstance();
        when.setTimeInMillis(now);
        String date = readDate(text);
        if (date == null) date = dstr(when);
        String time = readTime(text);
        if (time == null) time = pad(when.get(Calendar.HOUR_OF_DAY)) + ":" + pad(when.get(Calendar.MINUTE));
        boolean air = re(msg("airtime"), true).matcher(text).find();
        String forCat = payee + " " + (air ? "airtime" : "");
        String catId = guessCategory(forCat, type, learned);
        if ("income".equals(type) && "other_income".equals(catId)) catId = guessCategory(text, type, null);
        Payment p = new Payment();
        p.amount = round2(amount[0]);
        p.cur = cur[0];
        p.type = type;
        p.payee = payee;
        p.date = date;
        p.time = time;
        p.ref = readRef(text);
        p.catId = catId;
        p.via = "message";
        return p;
    }

    /** A key that says two reads are the same payment: the reference when there is one, otherwise what and when. */
    static String paymentKey(Payment p) {
        if (p.ref != null) return "ref:" + p.ref;
        String t = p.time == null ? "" : p.time.substring(0, Math.min(4, p.time.length()));
        return p.type + "|" + trimNumber(p.amount) + "|" + norm(p.payee) + "|" + p.date + "|" + t;
    }

    /** JavaScript prints 12 for 12.0 and 12.5 for 12.5; so must this, or the same payment gets two keys. */
    static String trimNumber(double v) {
        if (v == Math.rint(v) && Math.abs(v) < 1e15) return String.valueOf((long) v);
        String s = String.valueOf(v);
        return s;
    }
}
