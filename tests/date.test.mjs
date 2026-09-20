import { atDate, suite } from "./harness.mjs";
import {
  addDays, daysBetween, formatTime12, hashIdx, isPastTime, money, moneyPrecise, monthKeyOf,
  parseD, relativeDateLabel, todayStr, weekStartOf, weekdayKey,
} from "../src/lib/date.js";

const t = suite("date");

// Every date in this app is a local "YYYY-MM-DD" string, never a Date or an ISO timestamp.
// That choice is load-bearing: it keeps a day's identity stable across timezones and DST,
// and it's why these helpers all take and return strings.

t.group("arithmetic");
{
  t.eq("adding days", addDays("2026-09-19", 3), "2026-09-22");
  t.eq("subtracting days", addDays("2026-09-19", -5), "2026-09-14");
  t.eq("across a month boundary", addDays("2026-09-30", 1), "2026-10-01");
  t.eq("across a year boundary", addDays("2026-12-31", 1), "2027-01-01");
  t.eq("into a leap day", addDays("2028-02-28", 1), "2028-02-29");
  t.eq("days between", daysBetween("2026-09-14", "2026-09-19"), 5);
  t.eq("backwards is negative", daysBetween("2026-09-19", "2026-09-14"), -5);
  t.eq("the same day is zero", daysBetween("2026-09-19", "2026-09-19"), 0);
  // A spring-forward day is 23 hours long, so the rounding in daysBetween is what stops it
  // reporting 0. (This machine runs on UTC, so the case only bites on a machine that doesn't.)
  t.eq("a clock-change boundary is still one day", daysBetween("2027-03-27", "2027-03-28"), 1);
  t.eq("parsing gives local midnight", parseD("2026-09-19").getHours(), 0);
}

t.group("weeks");
{
  t.eq("weekday keys", ["2026-09-14", "2026-09-19", "2026-09-20"].map(weekdayKey), ["mon", "sat", "sun"]);
  t.eq("a Monday is its own week start", weekStartOf("2026-09-14"), "2026-09-14");
  t.eq("mid-week", weekStartOf("2026-09-17"), "2026-09-14");
  // The Sunday case is the one an off-by-one gets wrong: weeks run Monday to Sunday here.
  t.eq("Sunday belongs to the week that started six days earlier", weekStartOf("2026-09-20"), "2026-09-14");
  t.eq("month keys", monthKeyOf("2026-09-19"), "2026-09");
}

t.group("formatting");
{
  t.eq("midnight reads as 12 AM", formatTime12("00:05"), "12:05 AM");
  t.eq("noon reads as 12 PM", formatTime12("12:00"), "12:00 PM");
  t.eq("afternoon", formatTime12("19:30"), "7:30 PM");
  t.eq("no time, nothing to format", formatTime12(null), null);
  t.eq("money drops the pennies", money(1234.56), "1,235");
  t.eq("money handles nothing", money(null), "0");
  t.eq("precise money keeps pennies when there are any", moneyPrecise(12.4), "12.40");
  t.eq("...and drops them when there aren't", moneyPrecise(12), "12");
}

t.group("relative labels");
atDate("2026-09-19T12:00:00", () => {
  t.eq("today", relativeDateLabel(todayStr()), "Today");
  t.eq("tomorrow", relativeDateLabel("2026-09-20"), "Tomorrow");
  t.eq("yesterday", relativeDateLabel("2026-09-18"), "Yesterday");
  t.eq("inside the week ahead, by name", relativeDateLabel("2026-09-22"), "Tuesday");
  t.eq("beyond that, by date", relativeDateLabel("2026-10-22"), "Oct 22");
  t.eq("nothing at all", relativeDateLabel(null), null);
});

t.group("a time that has passed");
atDate("2026-09-19T12:00:00", () => {
  t.ok("this morning has gone", isPastTime("07:00", "2026-09-19"));
  t.ok("this evening hasn't", !isPastTime("19:00", "2026-09-19"));
  t.ok("another day is never 'past' — that's for today's plan", !isPastTime("07:00", "2026-09-18"));
  t.ok("no time set is never past", !isPastTime(null, "2026-09-19"));
});

t.group("stable hashing");
{
  t.eq("the same string always lands in the same slot", hashIdx("morning walk", 170), hashIdx("morning walk", 170));
  t.ok("and always inside the range", [...Array(50)].every((_, i) => {
    const idx = hashIdx(`mantra-${i}`, 7);
    return Number.isInteger(idx) && idx >= 0 && idx < 7;
  }));
}
