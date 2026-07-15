import React, { useState, useEffect, useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import {
  Sparkles, Coins, Sprout, Heart, HandHeart, HeartPulse, Users, Flame,
  Compass, PenLine, BookOpen, Wallet, TrendingUp, ListChecks, CalendarDays,
  Plus, Check, Trash2, ChevronLeft, ChevronDown, ChevronUp, RefreshCw, Crown, X, Clock,
  Ban, Fingerprint, Link2, MapPin, Zap, AlertTriangle, PartyPopper, Gift,
  Gamepad2, HelpCircle, AlertCircle, Anchor, Star,
} from "lucide-react";

// ---- The seven areas you track ----
const PILLARS = [
  { id: "spiritual",     name: "Spiritual",     color: "#A99BE8", Icon: Sparkles,  prompt: "Prayer, reflection, gratitude, presence" },
  { id: "financial",     name: "Financial",     color: "#E8B75D", Icon: Coins,     prompt: "Discipline with money, sticking to plan" },
  { id: "growth",        name: "Self-growth",   color: "#6FC79B", Icon: Sprout,    prompt: "Learning, discipline, habits, progress" },
  { id: "personality",   name: "Personality",   color: "#E8946F", Icon: Heart,     prompt: "Patience, honesty, character, temper" },
  { id: "deeds",         name: "Deeds",         color: "#E8749B", Icon: HandHeart, prompt: "Kindness, help, good actions today" },
  { id: "health",        name: "Health",        color: "#5FC7C0", Icon: HeartPulse,prompt: "Sleep, movement, eating, energy" },
  { id: "relationships", name: "Relationships", color: "#6FA8E8", Icon: Users,     prompt: "Family, friends, presence with others" },
];
const P_BY_ID = Object.fromEntries(PILLARS.map((p) => [p.id, p]));

const WEEKDAYS = [
  { key: "mon", label: "Monday" }, { key: "tue", label: "Tuesday" }, { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" }, { key: "fri", label: "Friday" }, { key: "sat", label: "Saturday" }, { key: "sun", label: "Sunday" },
];
const WK_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const PRIORITY = {
  high: { label: "High", color: "#E8746F" },
  med:  { label: "Med",  color: "#E8B75D" },
  low:  { label: "Low",  color: "#6FA8E8" },
};

const AUDIT_TAGS = {
  good:    { label: "Good",    color: "#6FC79B" },
  bad:     { label: "Bad",     color: "#E8746F" },
  neutral: { label: "Neutral", color: "#948FA9" },
};

// From Feel Good Productivity: the three energizers and the three "Kryptonite" blockers
const ENERGIZERS = [
  { id: "play",   label: "Play",   Icon: Gamepad2, color: "#E8B75D", desc: "Approached something with curiosity or fun" },
  { id: "power",  label: "Power",  Icon: Zap,      color: "#A99BE8", desc: "Felt capable, skilled, or in control" },
  { id: "people", label: "People", Icon: Users,    color: "#6FA8E8", desc: "Connected with, or helped, someone" },
];
const BLOCKERS = [
  { id: "uncertainty", label: "Uncertainty", Icon: HelpCircle,  color: "#948FA9", tip: "Get clear on just the next tiny step — you don't need the whole plan." },
  { id: "fear",        label: "Fear",        Icon: AlertCircle, color: "#E8746F", tip: "Ask yourself: what's the worst that could realistically happen?" },
  { id: "inertia",     label: "Inertia",     Icon: Anchor,      color: "#5FC7C0", tip: "Shrink it down. Commit to just two minutes." },
];
const FEEL_LEVELS = [
  { v: 1, emoji: "😴", label: "Drained" },
  { v: 2, emoji: "😕", label: "Low" },
  { v: 3, emoji: "😐", label: "Okay" },
  { v: 4, emoji: "🙂", label: "Good" },
  { v: 5, emoji: "🤩", label: "Energized" },
];
const RECHARGE_LEVELS = [
  { v: 1, emoji: "🪫", label: "Running on empty" },
  { v: 2, emoji: "😮‍💨", label: "Tired" },
  { v: 3, emoji: "😌", label: "Steady" },
  { v: 4, emoji: "🌱", label: "Replenished" },
  { v: 5, emoji: "✨", label: "Fully recharged" },
];

// What each 1–5 score actually means, per pillar — shown live as you tap a number
const PILLAR_LEVELS = {
  spiritual: [
    "Distant today — little to no prayer, reflection, or gratitude.",
    "Went through the motions; presence was missing.",
    "Showed up, but not fully consistent or intentional.",
    "Present and intentional — it had real weight today.",
    "Deeply connected — gratitude and presence were strong all day.",
  ],
  financial: [
    "Spent carelessly or ignored the plan entirely.",
    "Slipped off the plan more than once today.",
    "Stuck to the basics, nothing extra tracked.",
    "Disciplined — spending and saving stayed on plan.",
    "Excellent — actively built wealth or cut waste today.",
  ],
  growth: [
    "No learning, no discipline — coasted today.",
    "Minimal effort toward any skill or habit.",
    "Did the basics, nothing pushed further.",
    "Learned something or held a habit with real discipline.",
    "Pushed hard — real progress on a skill or habit today.",
  ],
  personality: [
    "Reactive, impatient, or dishonest in some way today.",
    "Struggled to stay level — temper or honesty slipped.",
    "Held it together, nothing remarkable either way.",
    "Patient and honest — handled friction well.",
    "Best version of yourself — calm, honest, strong all day.",
  ],
  deeds: [
    "No act of kindness or help today.",
    "Meant to help but didn't follow through.",
    "One small kind act, nothing more.",
    "Went out of your way to help or be kind.",
    "Generous and intentional — kindness shaped your day.",
  ],
  health: [
    "Neglected sleep, movement, and food today.",
    "Mostly ignored your body's needs.",
    "Met the basics — nothing more, nothing less.",
    "Took real care — good sleep, movement, or eating.",
    "Excellent — energy, movement, and rest all aligned.",
  ],
  relationships: [
    "Isolated — no real connection with anyone today.",
    "Distracted or distant with people who matter.",
    "Present but not particularly engaged.",
    "Made time and gave real attention to someone.",
    "Deeply connected — strengthened a relationship today.",
  ],
};

// Original mantras — rotates by date, refreshable
const MANTRAS = [
  "Small steps today become the person you're building tomorrow.",
  "Discipline is choosing what you want most over what you want now.",
  "You don't need a perfect day — you need a directed one.",
  "Progress is a decision made again and again, quietly.",
  "Show up for yourself the way you would for someone you love.",
  "What you repeat, you become.",
  "The plan is the promise you make to your future self.",
  "Momentum is built one honest choice at a time.",
  "Rest is part of the plan, not a break from it.",
  "Today's effort is tomorrow's evidence.",
  "You are the sum of what you choose to finish.",
  "Consistency turns intention into identity.",
  "Every checked box is a vote for who you're becoming.",
  "Start before you're ready — readiness comes from starting.",
  "Your habits are quietly writing your future.",
  "Do the next right thing, then the next.",
  "A calm mind plans better than an anxious one.",
  "You don't rise to your goals, you fall to your systems — build good ones.",
  "Be patient with yourself; growth isn't linear, but it is real.",
  "The version of you that you're becoming is watching what you do today.",
  "Discipline now is freedom later.",
  "Gratitude turns what you have into enough.",
  "Kindness today plants what you'll need tomorrow.",
  "One grounded day is worth more than ten scattered ones.",
];

// Money — foundational principles checklist (general education, not personal financial advice)
const MONEY_PRINCIPLES = [
  { id: "emergency",   cat: "Foundation", title: "Build a starter emergency fund",     desc: "Aim for $1,000 first, then 3–6 months of expenses. This is what keeps a bad month from becoming a bad year." },
  { id: "budget",      cat: "Foundation", title: "Run a simple budget",                 desc: "A common split: 50% needs, 30% wants, 20% savings/debt. Doesn't have to be exact — just tracked." },
  { id: "highinterest",cat: "Foundation", title: "Kill high-interest debt first",       desc: "Credit card debt often runs 20%+ APR — paying it off usually beats almost any investment return." },
  { id: "credit",      cat: "Foundation", title: "Build credit early and carefully",    desc: "Pay in full, on time, every time. A strong score quietly saves you money for decades." },
  { id: "automate",    cat: "Foundation", title: "Pay yourself first",                  desc: "Automate a transfer to savings/investing the day you get paid, before you can spend it." },
  { id: "compound",    cat: "Growth",     title: "Start investing early",               desc: "Compound growth rewards time in the market more than timing it. Starting at 22 vs 32 can roughly double the outcome." },
  { id: "match",       cat: "Growth",     title: "Take any employer match",             desc: "If a job offers a retirement match, that's an instant guaranteed return — leaving it unclaimed is leaving pay on the table." },
  { id: "diversify",   cat: "Growth",     title: "Diversify, don't gamble",             desc: "Broad, low-fee index funds spread risk. Concentrated bets on single stocks or coins can wipe out years of saving fast." },
  { id: "skills",      cat: "Income",     title: "Invest in a sellable skill",          desc: "Your income potential is the biggest lever you have early on — a skill upgrade often outperforms any investment return." },
  { id: "negotiate",   cat: "Income",     title: "Negotiate, don't just accept",        desc: "Asking for more — a raise, a rate, a price — costs nothing and is where a lot of young men leave money unclaimed." },
  { id: "lifestyle",   cat: "Protection", title: "Watch lifestyle inflation",           desc: "When income rises, let savings rise with it — not just spending. This is the single biggest wealth killer at every income level." },
  { id: "scams",       cat: "Protection", title: "Be skeptical of 'guaranteed' returns", desc: "Anything promising fast, certain, outsized returns is the biggest red flag in finance. If it sounds too good, it usually is." },
];

// Money — side income / project ideas, low to moderate barrier to entry
const SIDE_HUSTLE_IDEAS = [
  { id: "freelance",  title: "Freelance a skill you have",     level: "Beginner",     desc: "Writing, design, code, editing, video — sell what you already know on a freelance platform or direct outreach." },
  { id: "tutoring",   title: "Tutor or coach",                  level: "Beginner",     desc: "Academic subjects, a language, or a sport you're solid at. Low startup cost, direct pay." },
  { id: "reselling",  title: "Flip or resell",                  level: "Beginner",     desc: "Thrift, clearance, or bulk finds resold online. Teaches margins and negotiation fast." },
  { id: "content",    title: "Build one piece of content weekly", level: "Intermediate", desc: "A niche you actually know — consistency compounds into an audience, then income, over months." },
  { id: "service",    title: "Local service hustle",             level: "Beginner",     desc: "Lawn care, moving help, pressure washing, cleaning — low barrier, fast cash, easy to test." },
  { id: "digital",    title: "Build a small digital product",    level: "Intermediate", desc: "A template, guide, or tool solving one specific problem. Sell it once, earn from it repeatedly." },
  { id: "trade",      title: "Learn a trade skill",              level: "Long-term",    desc: "Electrical, plumbing, HVAC — real demand, real pay, and far less competition than most online hustles." },
  { id: "network",    title: "Build in public",                  level: "Intermediate", desc: "Share what you're learning or building — network and opportunities tend to follow visible effort." },
];

// Cash-flow tracking: 50/30/20-style budget categories
const BUDGET_CATS = [
  { id: "needs",   label: "Needs",   color: "#5FC7C0", hint: "Rent, bills, groceries, transport" },
  { id: "wants",   label: "Wants",   color: "#E8946F", hint: "Eating out, hobbies, subscriptions" },
  { id: "savings", label: "Savings", color: "#6FC79B", hint: "Saved, invested, or debt paydown" },
];
const monthKeyOf = (dateStr) => dateStr.slice(0, 7);
const monthLabel = (mKey) => { const [y, m] = mKey.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" }); };
function monthTotals(transactions, mKey) {
  const income = transactions.filter((t) => t.type === "income" && monthKeyOf(t.date) === mKey).reduce((a, t) => a + t.amount, 0);
  const byCat = { needs: 0, wants: 0, savings: 0 };
  transactions.filter((t) => t.type === "expense" && monthKeyOf(t.date) === mKey).forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const totalExpense = byCat.needs + byCat.wants + byCat.savings;
  return { income, byCat, totalExpense, net: income - totalExpense };
}
function last6MonthsFlow(transactions) {
  const out = [];
  const base = new Date(); base.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(base.getFullYear(), base.getMonth() - i, 1);
    const mKey = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
    const t = monthTotals(transactions, mKey);
    out.push({ month: monthLabel(mKey), Income: t.income, Expenses: t.totalExpense });
  }
  return out;
}

const C = {
  bg: "#14131f", surface: "#1e1c2e", surface2: "#26243a",
  text: "#ECE8F5", muted: "#948FA9", faint: "#615C78",
  gold: "#E8B75D", red: "#E8746F", border: "rgba(255,255,255,0.07)",
};

const pad = (n) => String(n).padStart(2, "0");
const dstr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayStr = () => dstr(new Date());
const parseD = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const prettyDate = (s) => parseD(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const longDate = (s) => parseD(s).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const money = (n) => (n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const weekdayKey = (dateStr) => WK_ORDER[parseD(dateStr).getDay()];
const hashIdx = (s, len) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h % len; };
const formatTime12 = (t) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad(m)} ${period}`;
};
const isOverdue = (task, dateStr) => {
  if (!task.time || task.done || dateStr !== todayStr()) return false;
  const [h, m] = task.time.split(":").map(Number);
  const deadline = new Date(); deadline.setHours(h, m, 0, 0);
  return new Date() > deadline;
};
const intentionSentence = (t) => {
  if (t.stackAfter) {
    let s = `After ${t.stackAfter}, I will ${t.text}`;
    if (t.location) s += ` in ${t.location}`;
    return s;
  }
  if (t.time) {
    let s = `I will ${t.text} at ${formatTime12(t.time)}`;
    if (t.location) s += ` in ${t.location}`;
    return s;
  }
  if (t.location) return `I will ${t.text} in ${t.location}`;
  return null;
};

// Merge a weekday's build-routine template into a day's task list, preserving custom tasks + completion
function planTasks(date, routines, existingTasks) {
  const wk = weekdayKey(date);
  const routineTasks = (routines[wk] || []).map((rt) => {
    const match = existingTasks.find((t) => t.source === "routine" && t.routineId === rt.id);
    return {
      id: match ? match.id : `r-${rt.id}`, text: rt.text, done: match ? match.done : false,
      source: "routine", routineId: rt.id, priority: rt.priority || "high", time: rt.time || null,
      location: rt.location || null, stackAfter: rt.stackAfter || null, bundle: rt.bundle || null,
      twoMin: rt.twoMin || null, pillarId: rt.pillarId || null,
    };
  });
  const customTasks = existingTasks.filter((t) => t.source === "custom");
  return [...routineTasks, ...customTasks];
}

// Merge a weekday's break-habit template into a day's avoid-list
function planBreakTasks(date, breakRoutines, existingTasks) {
  const wk = weekdayKey(date);
  return (breakRoutines[wk] || []).map((rt) => {
    const match = existingTasks.find((t) => t.routineId === rt.id);
    return { id: match ? match.id : `b-${rt.id}`, text: rt.text, done: match ? match.done : false, routineId: rt.id, priority: rt.priority || "high", trigger: rt.trigger || null };
  });
}

function routineDayStatus(dateStr, routines, dayPlans) {
  const wk = weekdayKey(dateStr);
  const template = routines[wk] || [];
  if (template.length === 0) return null;
  const tasks = (dayPlans[dateStr]?.tasks || []).filter((t) => t.source === "routine");
  if (tasks.length === 0) return false;
  return tasks.every((t) => t.done);
}
function breakDayStatus(dateStr, breakRoutines, breakPlans) {
  const wk = weekdayKey(dateStr);
  const template = breakRoutines[wk] || [];
  if (template.length === 0) return null;
  const tasks = breakPlans[dateStr]?.tasks || [];
  if (tasks.length === 0) return false;
  return tasks.every((t) => t.done);
}
function computeStreak(statusFn) {
  let n = 0;
  const d = new Date();
  if (statusFn(todayStr()) === false) d.setDate(d.getDate() - 1);
  let guard = 0;
  while (guard < 400) {
    guard++;
    const status = statusFn(dstr(d));
    if (status === false) break;
    if (status === true) n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
// Weekly-occurrence streak for a single habit (it recurs on one weekday, not daily)
function weeklyHabitStreak(routineId, wk, plans) {
  let d = new Date();
  let safety = 0;
  while (WK_ORDER[d.getDay()] !== wk && safety < 7) { d.setDate(d.getDate() - 1); safety++; }
  const taskDoneOn = (dateStr) => {
    const list = plans[dateStr]?.tasks || [];
    const t = list.find((x) => x.routineId === routineId);
    return t ? t.done : null;
  };
  if (dstr(d) === todayStr()) {
    const status = taskDoneOn(todayStr());
    if (status !== true) d.setDate(d.getDate() - 7);
  }
  let n = 0, guard = 0;
  while (guard < 52) {
    guard++;
    if (taskDoneOn(dstr(d)) !== true) break;
    n++;
    d.setDate(d.getDate() - 7);
  }
  return n;
}
function voteTally(dayPlans) {
  const tally = {};
  Object.values(dayPlans).forEach((dp) => {
    (dp.tasks || []).forEach((t) => {
      if (t.source === "routine" && t.done && t.pillarId) tally[t.pillarId] = (tally[t.pillarId] || 0) + 1;
    });
  });
  return tally;
}
function heatmapDays(dayPlans, numDays = 84) {
  const days = [];
  const d = new Date();
  d.setDate(d.getDate() - (numDays - 1));
  for (let i = 0; i < numDays; i++) {
    const ds = dstr(d);
    const tasks = (dayPlans[ds]?.tasks || []).filter((t) => t.source === "routine");
    const ratio = tasks.length ? tasks.filter((t) => t.done).length / tasks.length : null;
    days.push({ date: ds, ratio });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

// ---------------- DECORATIVE 3D MOTION LAYER ----------------
// Pure-CSS, absolutely-positioned, pointer-events:none — layered on top of / behind the
// real UI without touching any state, handlers, or layout logic above.
const MOTION_CSS = `
@keyframes mtm-sparkle-move {
  0%   { opacity: 0;    transform: translate3d(0,0,0) scale(0.3) rotate(0deg); }
  40%  { opacity: 0.85; transform: translate3d(4px,-10px,0) scale(1) rotate(110deg); }
  60%  { opacity: 0.85; transform: translate3d(-3px,-18px,0) scale(0.85) rotate(170deg); }
  100% { opacity: 0;    transform: translate3d(0,-24px,0) scale(0.3) rotate(230deg); }
}
@keyframes mtm-orb-drift {
  0%, 100% { transform: translate3d(0,0,0) scale(1); }
  33%      { transform: translate3d(18px,-24px,0) scale(1.08); }
  66%      { transform: translate3d(-16px,16px,0) scale(0.93); }
}
@keyframes mtm-view-flip-in {
  0%   { opacity: 0; transform: perspective(1200px) rotateX(-12deg) rotateY(3deg) translateY(12px) scale(0.98); }
  100% { opacity: 1; transform: perspective(1200px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1); }
}
@keyframes mtm-card-flip-in {
  0%   { opacity: 0; transform: perspective(900px) rotateX(-75deg); }
  100% { opacity: 1; transform: perspective(900px) rotateX(0deg); }
}
@keyframes mtm-shimmer-sweep {
  0%   { transform: translateX(-130%) skewX(-14deg); }
  100% { transform: translateX(230%) skewX(-14deg); }
}
@keyframes mtm-glow-pulse {
  0%, 100% { filter: drop-shadow(0 0 0px rgba(232,183,93,0)); }
  50%      { filter: drop-shadow(0 0 7px rgba(232,183,93,0.85)); }
}

.mtm-orb-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: -1; }
.mtm-orb {
  position: absolute; border-radius: 50%; filter: blur(40px); opacity: 0.32; will-change: transform;
  animation: mtm-orb-drift var(--mtm-odur, 16s) ease-in-out infinite;
  animation-delay: var(--mtm-odelay, 0s);
}

.mtm-sparkle-layer { position: absolute; inset: 0; overflow: hidden; pointer-events: none; z-index: 2; }
.mtm-sparkle {
  position: absolute; color: #E8B75D; will-change: transform, opacity;
  animation: mtm-sparkle-move var(--mtm-dur, 4.5s) ease-in-out infinite;
  animation-delay: var(--mtm-delay, 0s);
}

.mtm-view-flip {
  animation: mtm-view-flip-in .5s cubic-bezier(.22,.8,.25,1) both;
  transform-style: preserve-3d; backface-visibility: hidden;
}
.mtm-card-flip {
  animation: mtm-card-flip-in .7s cubic-bezier(.2,.7,.3,1) both;
  transform-style: preserve-3d; transform-origin: 50% 100%; backface-visibility: hidden;
}
.mtm-shimmer { position: relative; overflow: hidden; }
.mtm-shimmer::after {
  content: ""; position: absolute; top: 0; left: 0; width: 45%; height: 100%;
  background: linear-gradient(75deg, transparent, rgba(255,255,255,0.4), transparent);
  animation: mtm-shimmer-sweep 3s ease-in-out infinite; pointer-events: none;
}
.mtm-glow-pulse { animation: mtm-glow-pulse 2.4s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .mtm-sparkle, .mtm-orb, .mtm-view-flip, .mtm-card-flip, .mtm-shimmer::after, .mtm-glow-pulse {
    animation: none !important;
  }
}
`;

// Soft blurred orbs drifting in 3D behind all content — ambient depth, never intercepts touch.
function AmbientOrbs() {
  const orbs = useMemo(() => ([
    { color: "#A99BE8", top: "4%",  left: "-12%", size: 190, dur: 17, delay: 0 },
    { color: "#E8B75D", top: "38%", left: "72%",  size: 150, dur: 20, delay: 3 },
    { color: "#6FC79B", top: "74%", left: "-8%",  size: 170, dur: 23, delay: 6 },
  ]), []);
  return (
    <div className="mtm-orb-layer" aria-hidden="true">
      {orbs.map((o, i) => (
        <div key={i} className="mtm-orb" style={{
          top: o.top, left: o.left, width: o.size, height: o.size, background: o.color,
          ["--mtm-odur"]: `${o.dur}s`, ["--mtm-odelay"]: `${o.delay}s`,
        }} />
      ))}
    </div>
  );
}

// Ambient twinkling sparkles drifting over the whole app — decorative, pointer-events:none.
function SparkleField({ count = 16 }) {
  const sparkles = useMemo(() => Array.from({ length: count }, (_, i) => ({
    id: i,
    top: Math.random() * 100,
    left: Math.random() * 100,
    size: 8 + Math.random() * 9,
    dur: 3 + Math.random() * 3.5,
    delay: Math.random() * 5,
  })), [count]);
  return (
    <div className="mtm-sparkle-layer" aria-hidden="true">
      {sparkles.map((s) => (
        <Sparkles key={s.id} size={s.size} className="mtm-sparkle" style={{
          top: `${s.top}%`, left: `${s.left}%`,
          ["--mtm-dur"]: `${s.dur}s`, ["--mtm-delay"]: `${s.delay}s`,
        }} />
      ))}
    </div>
  );
}

export default function Momentum() {
  const [view, setView] = useState("home");
  const [checkins, setCheckins] = useState([]);
  const [goals, setGoals] = useState([]);
  const [strategies, setStrategies] = useState([]);
  const [routines, setRoutines] = useState({});
  const [dayPlans, setDayPlans] = useState({});
  const [breakRoutines, setBreakRoutines] = useState({});
  const [breakPlans, setBreakPlans] = useState({});
  const [identities, setIdentities] = useState({});
  const [habitAudit, setHabitAudit] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [moneyPrinciples, setMoneyPrinciples] = useState({});
  const [moneyIdeas, setMoneyIdeas] = useState({});
  const [netWorth, setNetWorth] = useState({ assets: "", liabilities: "" });
  const [transactions, setTransactions] = useState([]);
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [budgetSplit, setBudgetSplit] = useState({ needs: 50, wants: 30, savings: 20 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap";
    document.head.appendChild(l);
  }, []);

  // Inject the decorative 3D motion / sparkle / flip-card keyframes once. Purely additive —
  // nothing here reads or writes app state, so it can never affect the logic above.
  useEffect(() => {
    if (document.getElementById("mtm-motion-style")) return;
    const style = document.createElement("style");
    style.id = "mtm-motion-style";
    style.textContent = MOTION_CSS;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("momentum:data");
        if (r && r.value) {
          const d = JSON.parse(r.value);
          setCheckins(d.checkins || []);
          setGoals(d.goals || []);
          setStrategies(d.strategies || []);
          setRoutines(d.routines || {});
          setDayPlans(d.dayPlans || {});
          setBreakRoutines(d.breakRoutines || {});
          setBreakPlans(d.breakPlans || {});
          setIdentities(d.identities || {});
          setHabitAudit(d.habitAudit || []);
          setJournalEntries(d.journalEntries || []);
          setMoneyPrinciples(d.moneyPrinciples || {});
          setMoneyIdeas(d.moneyIdeas || {});
          setNetWorth(d.netWorth || { assets: "", liabilities: "" });
          setTransactions(d.transactions || []);
          setMonthlyIncome(d.monthlyIncome || "");
          setBudgetSplit(d.budgetSplit || { needs: 50, wants: 30, savings: 20 });
        }
      } catch (e) { /* first run */ }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set("momentum:data", JSON.stringify({
          checkins, goals, strategies, routines, dayPlans, breakRoutines, breakPlans, identities, habitAudit,
          journalEntries, moneyPrinciples, moneyIdeas, netWorth, transactions, monthlyIncome, budgetSplit,
        }), false);
      } catch (e) { console.error("Could not save", e); }
    })();
  }, [checkins, goals, strategies, routines, dayPlans, breakRoutines, breakPlans, identities, habitAudit,
      journalEntries, moneyPrinciples, moneyIdeas, netWorth, transactions, monthlyIncome, budgetSplit, loaded]);

  const sorted = useMemo(() => [...checkins].sort((a, b) => a.date.localeCompare(b.date)), [checkins]);
  const checkedInToday = checkins.some((c) => c.date === todayStr());

  // Auto-load today's build-routine as tasks the moment the day starts.
  useEffect(() => {
    if (!loaded) return;
    const today = todayStr();
    if ((routines[weekdayKey(today)] || []).length === 0) return;
    setDayPlans((prev) => {
      const cur = prev[today];
      const merged = planTasks(today, routines, cur?.tasks || []);
      const unchanged = cur && cur.tasks.length === merged.length &&
        cur.tasks.every((t, i) => t.id === merged[i].id && t.done === merged[i].done && t.text === merged[i].text);
      if (unchanged) return prev;
      return { ...prev, [today]: { generated: true, mantraIdx: cur?.mantraIdx ?? hashIdx(today, MANTRAS.length), tasks: merged } };
    });
  }, [loaded, routines]);

  // Auto-load today's break-habit list the same way.
  useEffect(() => {
    if (!loaded) return;
    const today = todayStr();
    if ((breakRoutines[weekdayKey(today)] || []).length === 0) return;
    setBreakPlans((prev) => {
      const cur = prev[today];
      const merged = planBreakTasks(today, breakRoutines, cur?.tasks || []);
      const unchanged = cur && cur.tasks.length === merged.length &&
        cur.tasks.every((t, i) => t.id === merged[i].id && t.done === merged[i].done);
      if (unchanged) return prev;
      return { ...prev, [today]: { tasks: merged } };
    });
  }, [loaded, breakRoutines]);

  const averages = useMemo(() => {
    const recent = sorted.slice(-7);
    const out = {};
    PILLARS.forEach((p) => {
      const vals = recent.map((c) => c.scores[p.id]).filter((v) => typeof v === "number");
      out[p.id] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });
    return out;
  }, [sorted]);

  const overall = useMemo(() => {
    const vals = PILLARS.map((p) => averages[p.id]).filter((v) => v > 0);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }, [averages]);

  const streak = useMemo(() => computeStreak((d) => routineDayStatus(d, routines, dayPlans)), [dayPlans, routines]);
  const breakStreak = useMemo(() => computeStreak((d) => breakDayStatus(d, breakRoutines, breakPlans)), [breakPlans, breakRoutines]);
  const yesterdayMissed = useMemo(() => {
    const y = new Date(); y.setDate(y.getDate() - 1);
    return routineDayStatus(dstr(y), routines, dayPlans) === false;
  }, [routines, dayPlans]);
  const tally = useMemo(() => voteTally(dayPlans), [dayPlans]);
  const heatmap = useMemo(() => heatmapDays(dayPlans), [dayPlans]);
  const needsRest = useMemo(() => {
    const last3 = [...checkins].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
    return last3.length === 3 && last3.every((c) => (c.recharge ?? 3) <= 2);
  }, [checkins]);

  const saveCheckin = (entry) => {
    setCheckins((prev) => [...prev.filter((c) => c.date !== entry.date), entry]);
    setView("home");
  };

  const today = todayStr();
  const todayPlan = dayPlans[today];
  const todayBreak = breakPlans[today];

  const makePlan = () => {
    setDayPlans((prev) => {
      const existing = prev[today]?.tasks || [];
      const tasks = planTasks(today, routines, existing);
      const mantraIdx = prev[today]?.generated ? hashIdx(today + Date.now(), MANTRAS.length) : hashIdx(today, MANTRAS.length);
      return { ...prev, [today]: { generated: true, mantraIdx, tasks } };
    });
  };
  const updateTodayTasks = (updater) => {
    setDayPlans((prev) => {
      const cur = prev[today] || { generated: true, mantraIdx: hashIdx(today, MANTRAS.length), tasks: [] };
      return { ...prev, [today]: { ...cur, tasks: updater(cur.tasks) } };
    });
  };
  const updateBreakTasks = (updater) => {
    setBreakPlans((prev) => {
      const cur = prev[today] || { tasks: [] };
      return { ...prev, [today]: { tasks: updater(cur.tasks) } };
    });
  };

  if (!loaded) {
    return <div style={{ ...styles.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: C.muted }}>Loading your map…</span></div>;
  }

  return (
    <div style={styles.app}>
      <div style={styles.phone}>
        <AmbientOrbs />
        <SparkleField />
        <div style={styles.scroll}>
          <div key={view} className="mtm-view-flip">
            {view === "home" && (
              <HomeView
                averages={averages} overall={overall} streak={streak} breakStreak={breakStreak}
                checkedInToday={checkedInToday} count={checkins.length} todayPlan={todayPlan} todayBreak={todayBreak}
                onMakePlan={makePlan} onUpdateTasks={updateTodayTasks} onUpdateBreakTasks={updateBreakTasks}
                onCheckin={() => setView("checkin")} onOpenRoutine={() => setView("routine")}
                onOpenBreak={() => setView("break")} onOpenIdentity={() => setView("identity")}
                yesterdayMissed={yesterdayMissed} tally={tally} heatmap={heatmap} routines={routines}
                dayPlans={dayPlans} needsRest={needsRest}
              />
            )}
            {view === "checkin" && <CheckinView existing={checkins.find((c) => c.date === todayStr())}
              onSave={saveCheckin} onBack={() => setView("home")} />}
            {view === "routine" && <RoutineView routines={routines} setRoutines={setRoutines} onBack={() => setView("home")} />}
            {view === "break" && <BreakHabitsView breakRoutines={breakRoutines} setBreakRoutines={setBreakRoutines} onBack={() => setView("home")} />}
            {view === "identity" && <IdentityView identities={identities} setIdentities={setIdentities}
              habitAudit={habitAudit} setHabitAudit={setHabitAudit} tally={tally} onBack={() => setView("home")} />}
            {view === "journal" && <JournalView sorted={sorted} onCheckin={() => setView("checkin")}
              journalEntries={journalEntries} setJournalEntries={setJournalEntries} />}
            {view === "money" && <MoneyView strategies={strategies} setStrategies={setStrategies}
              moneyPrinciples={moneyPrinciples} setMoneyPrinciples={setMoneyPrinciples}
              moneyIdeas={moneyIdeas} setMoneyIdeas={setMoneyIdeas} netWorth={netWorth} setNetWorth={setNetWorth}
              transactions={transactions} setTransactions={setTransactions}
              monthlyIncome={monthlyIncome} setMonthlyIncome={setMonthlyIncome}
              budgetSplit={budgetSplit} setBudgetSplit={setBudgetSplit} />}
            {view === "insights" && <InsightsView sorted={sorted} streak={streak} goals={goals} setGoals={setGoals} />}
          </div>
        </div>

        <nav style={styles.nav}>
          {[
            { id: "home", label: "Map", Icon: Compass },
            { id: "checkin", label: "Check in", Icon: PenLine },
            { id: "journal", label: "Journal", Icon: BookOpen },
            { id: "money", label: "Money", Icon: Wallet },
            { id: "insights", label: "Insights", Icon: TrendingUp },
          ].map((t) => {
            const active = view === t.id;
            return (
              <button key={t.id} onClick={() => setView(t.id)}
                style={{ ...styles.navBtn, color: active ? C.gold : C.faint }}>
                <t.Icon size={20} strokeWidth={active ? 2.4 : 1.9} className={active ? "mtm-glow-pulse" : undefined} />
                <span style={{ fontSize: 10, marginTop: 3, fontWeight: active ? 600 : 500 }}>{t.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function summarize(entries) {
  const perPillar = {};
  PILLARS.forEach((p) => {
    const vals = entries.map((c) => c.scores[p.id]).filter((v) => typeof v === "number");
    if (vals.length) perPillar[p.id] = vals.reduce((a, b) => a + b, 0) / vals.length;
  });
  const ids = Object.keys(perPillar);
  const balance = ids.length ? ids.reduce((a, id) => a + perPillar[id], 0) / ids.length : 0;
  let best = null, focus = null;
  ids.forEach((id) => {
    if (best === null || perPillar[id] > perPillar[best]) best = id;
    if (focus === null || perPillar[id] < perPillar[focus]) focus = id;
  });
  const deeds = entries.filter((c) => c.deed).length;
  return { perPillar, balance, best, focus, deeds, entries: entries.length };
}

// ---------------- HOME / THE MAP ----------------
function HomeView({
  averages, overall, streak, breakStreak, checkedInToday, count, todayPlan, todayBreak,
  onMakePlan, onUpdateTasks, onUpdateBreakTasks, onCheckin, onOpenRoutine, onOpenBreak, onOpenIdentity,
  yesterdayMissed, tally, heatmap, routines, dayPlans, needsRest,
}) {
  const radarData = PILLARS.map((p) => ({ pillar: p.name.split("-")[0], value: +averages[p.id].toFixed(2) }));
  const hour = new Date().getHours();
  const greet = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const tasks = todayPlan?.tasks || [];
  const mantra = todayPlan ? MANTRAS[todayPlan.mantraIdx % MANTRAS.length] : null;
  const [filter, setFilter] = useState("all");
  const [text, setText] = useState("");
  const [prio, setPrio] = useState("med");

  const shown = tasks
    .filter((t) => filter === "all" ? true : t.source === filter)
    .sort((a, b) => (a.time && b.time) ? a.time.localeCompare(b.time) : a.time ? -1 : b.time ? 1 : 0);
  const doneCount = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;
  const routineTasks = tasks.filter((t) => t.source === "routine");
  const routineDone = routineTasks.filter((t) => t.done).length;
  const fullyDone = tasks.length > 0 && pct === 100;

  const breakTasks = todayBreak?.tasks || [];
  const breakDone = breakTasks.filter((t) => t.done).length;

  const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);
  const topPillar = Object.keys(tally).length ? Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0] : null;

  const addTask = () => {
    if (!text.trim()) return;
    onUpdateTasks((prev) => [...prev, { id: `c-${Date.now()}`, text: text.trim(), done: false, source: "custom", priority: prio }]);
    setText("");
  };
  const toggleTask = (id) => onUpdateTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const removeTask = (id) => onUpdateTasks((prev) => prev.filter((t) => t.id !== id));
  const toggleBreak = (id) => onUpdateBreakTasks((prev) => prev.map((t) => t.id === id ? { ...t, done: !t.done } : t));
  const rerollMantra = () => onMakePlan();

  const weeks = [];
  for (let i = 0; i < heatmap.length; i += 7) weeks.push(heatmap.slice(i, i + 7));

  return (
    <div style={{ padding: "26px 20px 16px" }}>
      <p style={styles.eyebrow}>{greet}</p>
      <h1 style={styles.h1}>Your map</h1>

      <div style={styles.mapCard} className="mtm-card-flip">
        {count === 0 ? (
          <div style={{ textAlign: "center", padding: "34px 12px" }}>
            <p style={{ color: C.text, fontFamily: "Fraunces, serif", fontSize: 19, marginBottom: 8 }}>Your map is empty.</p>
            <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.5 }}>Do your first check-in and each pillar will start to take shape.</p>
          </div>
        ) : (
          <div style={{ height: 268, margin: "0 -6px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="70%">
                <defs>
                  <radialGradient id="mapfill" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={C.gold} stopOpacity={0.42} />
                    <stop offset="100%" stopColor={C.gold} stopOpacity={0.1} />
                  </radialGradient>
                </defs>
                <PolarGrid stroke="rgba(255,255,255,0.09)" />
                <PolarAngleAxis dataKey="pillar" tick={{ fill: C.muted, fontSize: 10.5 }} />
                <Radar dataKey="value" stroke={C.gold} strokeWidth={2} fill="url(#mapfill)"
                  dot={{ r: 3, fill: C.gold, strokeWidth: 0 }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        )}
        <div style={styles.statRow}>
          <Stat label="Balance" value={count ? overall.toFixed(1) : "—"} sub="/ 5" delay={0} />
          <div style={styles.divider} />
          <Stat label="Streak" value={streak} sub={streak === 1 ? "day" : "days"} flame delay={0.12} />
          <div style={styles.divider} />
          <Stat label="Entries" value={count} sub={count === 1 ? "log" : "logs"} delay={0.24} />
        </div>
      </div>

      {yesterdayMissed && (
        <div style={styles.warnBanner} className="mtm-card-flip">
          <AlertTriangle size={16} color={C.red} style={{ flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: C.text, fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
            Yesterday's routine wasn't finished. <b>Never miss twice</b> — let's get today done.
          </p>
        </div>
      )}

      {needsRest && (
        <div style={{ ...styles.warnBanner, background: "#5FC7C012", borderColor: "#5FC7C033" }} className="mtm-card-flip">
          <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>🪫</span>
          <p style={{ color: C.text, fontSize: 12.5, lineHeight: 1.5, margin: 0 }}>
            You've felt low on energy three check-ins running. <b>Sustain, don't burn out</b> — consider an easier day.
          </p>
        </div>
      )}

      <button onClick={onCheckin} style={{ ...styles.cta, opacity: checkedInToday ? 0.85 : 1, marginBottom: 12 }}>
        {checkedInToday ? <Check size={18} /> : <PenLine size={17} />}
        {checkedInToday ? "Edit today's check-in" : "Check in for today"}
      </button>

      {!todayPlan ? (
        <button onClick={onMakePlan} style={styles.premiumCta} className="mtm-shimmer mtm-card-flip">
          <Sparkles size={17} className="mtm-glow-pulse" /> Make me plan so I'm ready
        </button>
      ) : (
        <div style={styles.mantraCard} className="mtm-card-flip">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <Sparkles size={17} color={C.gold} className="mtm-glow-pulse" style={{ marginTop: 2, flexShrink: 0 }} />
            <p style={{ color: C.text, fontSize: 14.5, lineHeight: 1.6, fontFamily: "Fraunces, serif", fontStyle: "italic", margin: 0 }}>{mantra}</p>
          </div>
          <button onClick={rerollMantra} style={styles.rerollBtn}><RefreshCw size={12.5} /> New mantra</button>
        </div>
      )}

      {/* Advanced Todo */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "24px 0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ListChecks size={16} color={C.gold} />
          <span style={{ color: C.text, fontSize: 14.5, fontWeight: 600, fontFamily: "Inter, sans-serif" }}>Today's plan</span>
          <span style={styles.proBadge} className="mtm-glow-pulse"><Crown size={9} /> PLAN+</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onOpenIdentity} style={styles.iconBtn} title="Identity"><Fingerprint size={15} /></button>
          <button onClick={onOpenBreak} style={styles.iconBtn} title="Habits to break"><Ban size={15} /></button>
          <button onClick={onOpenRoutine} style={styles.iconBtn} title="Routine"><CalendarDays size={15} /></button>
        </div>
      </div>

      <div style={styles.softCard}>
        {fullyDone && (
          <div style={styles.celebrate}>
            <PartyPopper size={15} color={C.gold} /> Full day complete — nice work.
          </div>
        )}
        {tasks.length > 0 && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ color: C.muted, fontSize: 11.5 }}>{doneCount} of {tasks.length} done</span>
              <span style={{ color: C.gold, fontSize: 12, fontWeight: 600 }}>{pct}%</span>
            </div>
            <div style={{ ...styles.track, height: 6, marginBottom: 14 }}>
              <div style={{ ...styles.fill, width: `${pct}%`, background: C.gold }} />
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[["all", "All"], ["routine", "Routine"], ["custom", "Custom"]].map(([k, l]) => {
                const on = filter === k;
                return <button key={k} onClick={() => setFilter(k)} style={{ ...styles.pill, padding: "5px 12px", fontSize: 11.5,
                  border: `1px solid ${on ? C.gold : C.border}`, background: on ? C.gold + "22" : "transparent", color: on ? C.gold : C.muted }}>{l}</button>;
              })}
            </div>
          </>
        )}

        {shown.length === 0 && tasks.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "10px 4px 16px", lineHeight: 1.55 }}>
            Your routine loads here on its own each day. Nothing set for today yet — add a task below, or set a routine.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map((t) => {
            const overdue = isOverdue(t, todayStr());
            const wStreak = t.source === "routine" ? weeklyHabitStreak(t.routineId, weekdayKey(todayStr()), dayPlans) : 0;
            return (
              <div key={t.id} style={{ ...styles.taskRow, ...(overdue ? styles.taskRowOverdue : {}) }}>
                <button onClick={() => toggleTask(t.id)} style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, cursor: "pointer",
                  border: `1.6px solid ${t.done ? C.gold : overdue ? C.red : C.faint}`, background: t.done ? C.gold : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {t.done && <Check size={13} color="#14131f" strokeWidth={3} />}
                </button>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: PRIORITY[t.priority || "med"].color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: t.done ? C.faint : C.text, fontSize: 13.5, textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
                {wStreak > 0 && (
                  <span style={styles.miniStreak} title="Consecutive weeks completed"><Flame size={9} color={C.gold} /> {wStreak}</span>
                )}
                {t.twoMin && !t.done && (
                  <button onClick={() => toggleTask(t.id)} style={styles.twoMinTag} title={`2-min version: ${t.twoMin}`}>
                    <Zap size={10} /> 2-min
                  </button>
                )}
                {t.time && (
                  <span style={{ ...styles.timeTag, ...(overdue ? { color: C.red, background: C.red + "22" } : {}) }}>
                    <Clock size={10} /> {overdue ? "Overdue" : formatTime12(t.time)}
                  </span>
                )}
                {t.source === "routine" && <span style={styles.routineTag}>Routine</span>}
                <button onClick={() => removeTask(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2, flexShrink: 0 }}>
                  <X size={14} /></button>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()}
            placeholder="Add a task for today…" style={{ ...styles.input, marginTop: 0, flex: 1, fontSize: 13 }} />
          <button onClick={addTask} style={styles.addBtn}><Plus size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {Object.entries(PRIORITY).map(([k, v]) => {
            const on = prio === k;
            return <button key={k} onClick={() => setPrio(k)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
              borderRadius: 12, cursor: "pointer", fontSize: 11, border: `1px solid ${on ? v.color : C.border}`,
              background: on ? v.color + "22" : "transparent", color: on ? v.color : C.muted }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: v.color }} /> {v.label}
            </button>;
          })}
        </div>
      </div>

      {totalVotes > 0 && (
        <button onClick={onOpenIdentity} style={styles.voteCard} className="mtm-card-flip">
          <Fingerprint size={16} color={C.gold} />
          <span style={{ color: C.text, fontSize: 12.5 }}>
            <b>{totalVotes}</b> vote{totalVotes === 1 ? "" : "s"} cast for who you're becoming
            {topPillar && <> · strongest in <b style={{ color: P_BY_ID[topPillar].color }}>{P_BY_ID[topPillar].name}</b></>}
          </span>
        </button>
      )}

      <p style={styles.sectionLabel}>Don't break the chain</p>
      <div style={styles.mapCard}>
        <div style={{ display: "flex", gap: 3, overflowX: "auto", paddingBottom: 2 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {week.map((day) => (
                <div key={day.date} title={`${day.date}${day.ratio !== null ? ` · ${Math.round(day.ratio * 100)}%` : ""}`}
                  style={{ width: 10, height: 10, borderRadius: 3,
                    background: day.ratio === null ? C.surface2 : C.gold,
                    opacity: day.ratio === null ? 1 : 0.15 + day.ratio * 0.85,
                    border: day.ratio === null ? `1px solid ${C.border}` : "none" }} />
              ))}
            </div>
          ))}
        </div>
        <p style={{ color: C.faint, fontSize: 10.5, marginTop: 10, marginBottom: 0 }}>Last 12 weeks of routine completion</p>
      </div>

      <div style={styles.streakCard} className="mtm-card-flip">
        <Flame size={20} color={C.gold} className="mtm-glow-pulse" />
        <div style={{ flex: 1 }}>
          <p style={{ color: C.text, fontSize: 18, fontFamily: "Fraunces, serif", fontWeight: 600, margin: 0 }}>{streak} {streak === 1 ? "day" : "days"}</p>
          <p style={{ color: C.muted, fontSize: 11.5, margin: 0 }}>
            {routineTasks.length > 0 ? `full routine completed in a row · ${routineDone}/${routineTasks.length} today` : "full routine completed in a row"}
          </p>
        </div>
      </div>

      {/* Habits to break */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "26px 0 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Ban size={16} color={C.red} />
          <span style={{ color: C.text, fontSize: 14.5, fontWeight: 600, fontFamily: "Inter, sans-serif" }}>Habits to avoid today</span>
        </div>
        <button onClick={onOpenBreak} style={styles.iconBtn}><CalendarDays size={15} /></button>
      </div>
      <div style={{ ...styles.softCard, borderColor: breakTasks.length ? C.red + "22" : C.border }}>
        {breakTasks.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "6px 4px 4px", lineHeight: 1.55 }}>
            Nothing set to avoid today. Add habits you're breaking via the calendar icon.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: C.muted, fontSize: 11.5 }}>{breakDone} of {breakTasks.length} avoided</span>
              <span style={{ color: C.red, fontSize: 11.5 }}>🔥 {breakStreak} day{breakStreak === 1 ? "" : "s"} clean</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {breakTasks.map((t) => (
                <div key={t.id} style={styles.taskRow}>
                  <button onClick={() => toggleBreak(t.id)} style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, cursor: "pointer",
                    border: `1.6px solid ${t.done ? C.red : C.faint}`, background: t.done ? C.red : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {t.done && <Check size={13} color="#14131f" strokeWidth={3} />}
                  </button>
                  <span style={{ flex: 1, color: t.done ? C.faint : C.text, fontSize: 13.5, textDecoration: t.done ? "line-through" : "none" }}>{t.text}</span>
                  <span style={styles.avoidTag}>Avoid</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, flame, delay = 0 }) {
  return (
    <div className="mtm-card-flip" style={{ flex: 1, textAlign: "center", animationDelay: `${delay}s` }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 3 }}>
        {flame && value > 0 && <Flame size={15} color={C.gold} className="mtm-glow-pulse" style={{ alignSelf: "center" }} />}
        <span style={{ color: C.text, fontSize: 22, fontFamily: "Fraunces, serif", fontWeight: 600 }}>{value}</span>
        <span style={{ color: C.faint, fontSize: 11 }}>{sub}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 10.5, marginTop: 2, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</p>
    </div>
  );
}

// ---------------- ROUTINE EDITOR (build habits) ----------------
function RoutineView({ routines, setRoutines, onBack }) {
  const [wk, setWk] = useState(WK_ORDER[new Date().getDay()]);
  const [text, setText] = useState("");
  const [prio, setPrio] = useState("high");
  const [time, setTime] = useState("");
  const [adv, setAdv] = useState(false);
  const [pillarId, setPillarId] = useState(null);
  const [location, setLocation] = useState("");
  const [stackAfter, setStackAfter] = useState("");
  const [bundle, setBundle] = useState("");
  const [twoMin, setTwoMin] = useState("");

  const dayTasks = routines[wk] || [];
  const add = () => {
    if (!text.trim()) return;
    setRoutines((r) => ({ ...r, [wk]: [...(r[wk] || []), {
      id: Date.now(), text: text.trim(), priority: prio, time: time || null, pillarId,
      location: location.trim() || null, stackAfter: stackAfter.trim() || null,
      bundle: bundle.trim() || null, twoMin: twoMin.trim() || null,
    }] }));
    setText(""); setTime(""); setPillarId(null); setLocation(""); setStackAfter(""); setBundle(""); setTwoMin("");
  };
  const remove = (id) => setRoutines((r) => ({ ...r, [wk]: (r[wk] || []).filter((t) => t.id !== id) }));

  return (
    <div style={{ padding: "22px 20px 16px" }}>
      <button onClick={onBack} style={styles.back}><ChevronLeft size={18} /> Map</button>
      <h1 style={styles.h1}>Your routine</h1>
      <p style={{ color: C.muted, fontSize: 13, marginTop: -4, marginBottom: 18, lineHeight: 1.5 }}>
        Set what a normal day looks like — differently for each day. Give a task a time and it flags overdue if you're late.
      </p>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, margin: "0 -20px", paddingLeft: 20, paddingRight: 20 }}>
        {WEEKDAYS.map((d) => {
          const on = wk === d.key;
          const n = (routines[d.key] || []).length;
          return (
            <button key={d.key} onClick={() => setWk(d.key)} style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 14, cursor: "pointer",
              border: `1px solid ${on ? C.gold : C.border}`, background: on ? C.gold + "1f" : C.surface, color: on ? C.gold : C.muted }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.label.slice(0, 3)}</div>
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>{n} task{n === 1 ? "" : "s"}</div>
            </button>
          );
        })}
      </div>

      <p style={{ ...styles.sectionLabel, marginTop: 20 }}>{WEEKDAYS.find((d) => d.key === wk).label}</p>

      <div style={styles.softCard}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Morning prayer, gym, budget review" style={{ ...styles.input, marginTop: 0, flex: 1, fontSize: 13 }} />
          <button onClick={add} style={styles.addBtn}><Plus size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "6px 10px" }}>
            <Clock size={13} color={C.muted} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
              style={{ background: "none", border: "none", outline: "none", color: C.text, fontSize: 12.5, fontFamily: "Inter, sans-serif", colorScheme: "dark" }} />
            {time && <button onClick={() => setTime("")} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", padding: 0 }}><X size={12} /></button>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {Object.entries(PRIORITY).map(([k, v]) => {
            const on = prio === k;
            return <button key={k} onClick={() => setPrio(k)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
              borderRadius: 12, cursor: "pointer", fontSize: 11, border: `1px solid ${on ? v.color : C.border}`,
              background: on ? v.color + "22" : "transparent", color: on ? v.color : C.muted }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: v.color }} /> {v.label}
            </button>;
          })}
        </div>

        <button onClick={() => setAdv((a) => !a)} style={styles.advToggle}>
          {adv ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Advanced (identity, stacking, bundling, 2-min rule)
        </button>

        {adv && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <p style={styles.miniLabel}>Which identity is this for?</p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {PILLARS.map((p) => {
                  const on = pillarId === p.id;
                  return <button key={p.id} onClick={() => setPillarId(on ? null : p.id)}
                    style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 9px", borderRadius: 10, cursor: "pointer", fontSize: 10.5,
                      border: `1px solid ${on ? p.color : C.border}`, background: on ? p.color + "22" : "transparent", color: on ? p.color : C.muted }}>
                    <p.Icon size={11} /> {p.name}
                  </button>;
                })}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 11px" }}>
              <MapPin size={13} color={C.muted} />
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where? (implementation intention)"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 12.5, fontFamily: "Inter, sans-serif" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 11px" }}>
              <Link2 size={13} color={C.muted} />
              <input value={stackAfter} onChange={(e) => setStackAfter(e.target.value)} placeholder="Stack after… (e.g. brushing teeth)"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 12.5, fontFamily: "Inter, sans-serif" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 11px" }}>
              <Gift size={13} color={C.muted} />
              <input value={bundle} onChange={(e) => setBundle(e.target.value)} placeholder="Bundle with something you enjoy"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 12.5, fontFamily: "Inter, sans-serif" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 12, padding: "9px 11px" }}>
              <Zap size={13} color={C.muted} />
              <input value={twoMin} onChange={(e) => setTwoMin(e.target.value)} placeholder="2-minute version for hard days"
                style={{ flex: 1, background: "none", border: "none", outline: "none", color: C.text, fontSize: 12.5, fontFamily: "Inter, sans-serif" }} />
            </div>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dayTasks.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: "20px", lineHeight: 1.55 }}>
            No routine set for {WEEKDAYS.find((d) => d.key === wk).label} yet.
          </p>
        )}
        {dayTasks.map((t) => {
          const sentence = intentionSentence(t);
          const p = t.pillarId ? P_BY_ID[t.pillarId] : null;
          return (
            <div key={t.id} style={styles.softCard}>
              <div style={styles.taskRow}>
                <span style={{ width: 6, height: 6, borderRadius: 3, background: PRIORITY[t.priority || "med"].color, flexShrink: 0 }} />
                <span style={{ flex: 1, color: C.text, fontSize: 13.5 }}>{t.text}</span>
                {t.time && <span style={styles.timeTag}><Clock size={10} /> {formatTime12(t.time)}</span>}
                <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2 }}>
                  <Trash2 size={14} /></button>
              </div>
              {(sentence || p || t.bundle || t.twoMin) && (
                <div style={{ marginTop: 6, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 5 }}>
                  {sentence && <p style={{ color: C.muted, fontSize: 11.5, fontStyle: "italic", margin: 0, lineHeight: 1.4 }}>"{sentence}"</p>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {p && <span style={{ ...styles.miniTag, color: p.color, background: p.color + "1a" }}><p.Icon size={9} /> {p.name}</span>}
                    {t.bundle && <span style={styles.miniTag}><Gift size={9} /> {t.bundle}</span>}
                    {t.twoMin && <span style={styles.miniTag}><Zap size={9} /> {t.twoMin}</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- BREAK HABITS EDITOR ----------------
function BreakHabitsView({ breakRoutines, setBreakRoutines, onBack }) {
  const [wk, setWk] = useState(WK_ORDER[new Date().getDay()]);
  const [text, setText] = useState("");
  const [prio, setPrio] = useState("high");
  const [trigger, setTrigger] = useState("");

  const dayTasks = breakRoutines[wk] || [];
  const add = () => {
    if (!text.trim()) return;
    setBreakRoutines((r) => ({ ...r, [wk]: [...(r[wk] || []), { id: Date.now(), text: text.trim(), priority: prio, trigger: trigger.trim() || null }] }));
    setText(""); setTrigger("");
  };
  const remove = (id) => setBreakRoutines((r) => ({ ...r, [wk]: (r[wk] || []).filter((t) => t.id !== id) }));

  return (
    <div style={{ padding: "22px 20px 16px" }}>
      <button onClick={onBack} style={styles.back}><ChevronLeft size={18} /> Map</button>
      <h1 style={styles.h1}>Habits to break</h1>
      <p style={{ color: C.muted, fontSize: 13, marginTop: -4, marginBottom: 18, lineHeight: 1.5 }}>
        List what you're cutting out, per day. Naming the trigger makes it easier to keep the cue out of sight.
      </p>

      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, margin: "0 -20px", paddingLeft: 20, paddingRight: 20 }}>
        {WEEKDAYS.map((d) => {
          const on = wk === d.key;
          const n = (breakRoutines[d.key] || []).length;
          return (
            <button key={d.key} onClick={() => setWk(d.key)} style={{ flexShrink: 0, padding: "9px 14px", borderRadius: 14, cursor: "pointer",
              border: `1px solid ${on ? C.red : C.border}`, background: on ? C.red + "1a" : C.surface, color: on ? C.red : C.muted }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{d.label.slice(0, 3)}</div>
              <div style={{ fontSize: 10, marginTop: 2, opacity: 0.8 }}>{n} habit{n === 1 ? "" : "s"}</div>
            </button>
          );
        })}
      </div>

      <p style={{ ...styles.sectionLabel, marginTop: 20 }}>{WEEKDAYS.find((d) => d.key === wk).label}</p>

      <div style={styles.softCard}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="e.g. Doomscrolling, late-night snacking" style={{ ...styles.input, marginTop: 0, flex: 1, fontSize: 13 }} />
          <button onClick={add} style={styles.addBtn}><Plus size={18} /></button>
        </div>
        <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="What usually triggers it? (optional)"
          style={{ ...styles.input, marginTop: 8, fontSize: 12.5 }} />
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {Object.entries(PRIORITY).map(([k, v]) => {
            const on = prio === k;
            return <button key={k} onClick={() => setPrio(k)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
              borderRadius: 12, cursor: "pointer", fontSize: 11, border: `1px solid ${on ? v.color : C.border}`,
              background: on ? v.color + "22" : "transparent", color: on ? v.color : C.muted }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: v.color }} /> {v.label}
            </button>;
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dayTasks.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: "20px", lineHeight: 1.55 }}>
            Nothing listed for {WEEKDAYS.find((d) => d.key === wk).label} yet.
          </p>
        )}
        {dayTasks.map((t) => (
          <div key={t.id} style={styles.taskRow}>
            <Ban size={13} color={C.red} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <span style={{ color: C.text, fontSize: 13.5 }}>{t.text}</span>
              {t.trigger && <p style={{ color: C.faint, fontSize: 11, margin: "2px 0 0" }}>Trigger: {t.trigger}</p>}
            </div>
            <button onClick={() => remove(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2 }}>
              <Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- IDENTITY + HABIT AUDIT ----------------
function IdentityView({ identities, setIdentities, habitAudit, setHabitAudit, tally, onBack }) {
  const [auditText, setAuditText] = useState("");
  const [auditTag, setAuditTag] = useState("neutral");

  const addAudit = () => {
    if (!auditText.trim()) return;
    setHabitAudit((h) => [...h, { id: Date.now(), text: auditText.trim(), verdict: auditTag }]);
    setAuditText("");
  };
  const removeAudit = (id) => setHabitAudit((h) => h.filter((x) => x.id !== id));

  return (
    <div style={{ padding: "22px 20px 16px" }}>
      <button onClick={onBack} style={styles.back}><ChevronLeft size={18} /> Map</button>
      <h1 style={styles.h1}>Identity</h1>
      <p style={{ color: C.muted, fontSize: 13, marginTop: -4, marginBottom: 18, lineHeight: 1.5 }}>
        Every task you finish is a small vote for the person you're becoming. Define who that is, pillar by pillar.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {PILLARS.map((p) => {
          const votes = tally[p.id] || 0;
          return (
            <div key={p.id} style={styles.softCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                <p.Icon size={16} color={p.color} />
                <span style={{ color: C.text, fontSize: 14, fontWeight: 500, flex: 1 }}>{p.name}</span>
                <span style={{ color: p.color, fontSize: 11.5 }}>{votes} vote{votes === 1 ? "" : "s"}</span>
              </div>
              <input value={identities[p.id] || ""} onChange={(e) => setIdentities((i) => ({ ...i, [p.id]: e.target.value }))}
                placeholder={`I am someone who…`} style={{ ...styles.input, marginTop: 0, fontSize: 13 }} />
            </div>
          );
        })}
      </div>

      <p style={styles.sectionLabel}>Habit audit</p>
      <p style={{ color: C.muted, fontSize: 12.5, marginTop: -6, marginBottom: 12, lineHeight: 1.5 }}>
        List habits you already have and mark each one honestly — this is Clear's starting point for change.
      </p>
      <div style={styles.softCard}>
        <div style={{ display: "flex", gap: 6 }}>
          <input value={auditText} onChange={(e) => setAuditText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addAudit()}
            placeholder="Name a current habit…" style={{ ...styles.input, marginTop: 0, flex: 1, fontSize: 13 }} />
          <button onClick={addAudit} style={styles.addBtn}><Plus size={18} /></button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {Object.entries(AUDIT_TAGS).map(([k, v]) => {
            const on = auditTag === k;
            return <button key={k} onClick={() => setAuditTag(k)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
              borderRadius: 12, cursor: "pointer", fontSize: 11, border: `1px solid ${on ? v.color : C.border}`,
              background: on ? v.color + "22" : "transparent", color: on ? v.color : C.muted }}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: v.color }} /> {v.label}
            </button>;
          })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {habitAudit.length === 0 && (
          <p style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: "18px", lineHeight: 1.55 }}>
            No habits listed yet.
          </p>
        )}
        {habitAudit.map((h) => {
          const tag = AUDIT_TAGS[h.verdict];
          return (
            <div key={h.id} style={styles.taskRow}>
              <span style={{ width: 6, height: 6, borderRadius: 3, background: tag.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: C.text, fontSize: 13.5 }}>{h.text}</span>
              <span style={{ ...styles.miniTag, color: tag.color, background: tag.color + "1a" }}>{tag.label}</span>
              <button onClick={() => removeAudit(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2 }}>
                <Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- CHECK IN — redesigned around Feel Good Productivity ----------------
const CHECKIN_STEPS = ["feel", "pillars", "energizers", "blockers", "reflect", "recharge", "summary"];

function CheckinView({ existing, onSave, onBack }) {
  const [step, setStep] = useState(0);
  const [feel, setFeel] = useState(existing?.feel ?? 3);
  const [scores, setScores] = useState(() => {
    const s = {}; PILLARS.forEach((p) => (s[p.id] = existing?.scores?.[p.id] ?? 3)); return s;
  });
  const [energizers, setEnergizers] = useState(existing?.energizers ?? []);
  const [blockers, setBlockers] = useState(existing?.blockers ?? []);
  const [note, setNote] = useState(existing?.note ?? "");
  const [deed, setDeed] = useState(existing?.deed ?? "");
  const [recharge, setRecharge] = useState(existing?.recharge ?? 3);

  const toggleEnergizer = (id) => setEnergizers((e) => e.includes(id) ? e.filter((x) => x !== id) : [...e, id]);
  const toggleBlocker = (id) => setBlockers((b) => b.includes(id) ? b.filter((x) => x !== id) : [...b, id]);

  const stepId = CHECKIN_STEPS[step];
  const next = () => setStep((s) => Math.min(s + 1, CHECKIN_STEPS.length - 1));
  const back = () => step === 0 ? onBack() : setStep((s) => s - 1);
  const save = () => onSave({ date: todayStr(), scores, note: note.trim(), deed: deed.trim(), feel, energizers, blockers, recharge });

  const avgScore = (() => {
    const vals = Object.values(scores);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  })();

  return (
    <div style={{ padding: "22px 20px 16px" }}>
      <button onClick={back} style={styles.back}><ChevronLeft size={18} /> {step === 0 ? "Map" : "Back"}</button>

      <div style={{ display: "flex", gap: 5, marginBottom: 20 }}>
        {CHECKIN_STEPS.map((s, i) => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? C.gold : C.border }} />
        ))}
      </div>

      {stepId === "feel" && (
        <div>
          <p style={styles.eyebrow}>Feel good, then do good work</p>
          <h1 style={styles.h1}>How do you feel right now?</h1>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, marginTop: -10, marginBottom: 22 }}>
            Feel Good Productivity starts here — your energy drives your output, not the other way around.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            {FEEL_LEVELS.map((f) => {
              const on = feel === f.v;
              return (
                <button key={f.v} onClick={() => setFeel(f.v)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  padding: "16px 4px", borderRadius: 16, cursor: "pointer", border: `1.5px solid ${on ? C.gold : C.border}`,
                  background: on ? C.gold + "1a" : C.surface }}>
                  <span style={{ fontSize: 26 }}>{f.emoji}</span>
                  <span style={{ color: on ? C.gold : C.muted, fontSize: 9.5, fontWeight: 600, textAlign: "center" }}>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stepId === "pillars" && (
        <div>
          <p style={styles.eyebrow}>{longDate(todayStr())}</p>
          <h1 style={styles.h1}>Rate your day</h1>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {PILLARS.map((p) => (
              <div key={p.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9 }}>
                  <p.Icon size={16} color={p.color} />
                  <span style={{ color: C.text, fontSize: 14.5, fontWeight: 500 }}>{p.name}</span>
                </div>
                <div style={{ display: "flex", gap: 7 }}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = scores[p.id] === n;
                    return (
                      <button key={n} onClick={() => setScores((s) => ({ ...s, [p.id]: n }))}
                        style={{ flex: 1, height: 42, borderRadius: 11, cursor: "pointer",
                          border: `1px solid ${on ? p.color : C.border}`, background: on ? p.color : "transparent",
                          color: on ? "#14131f" : C.muted, fontWeight: 600, fontSize: 15, transition: "all .12s" }}>{n}</button>
                    );
                  })}
                </div>
                <p style={{ color: C.faint, fontSize: 11.5, marginTop: 6 }}>{p.prompt}</p>
                {scores[p.id] && (
                  <p style={{ color: p.color, fontSize: 12, marginTop: 6, lineHeight: 1.5, fontStyle: "italic" }}>
                    {PILLAR_LEVELS[p.id][scores[p.id] - 1]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {stepId === "energizers" && (
        <div>
          <p style={styles.eyebrow}>Energize</p>
          <h1 style={styles.h1}>What gave you energy?</h1>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, marginTop: -10, marginBottom: 20 }}>
            Pick as many as fit. These three are the book's core fuel sources.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ENERGIZERS.map((e) => {
              const on = energizers.includes(e.id);
              return (
                <button key={e.id} onClick={() => toggleEnergizer(e.id)} style={{ display: "flex", alignItems: "center", gap: 13,
                  padding: "14px 15px", borderRadius: 16, cursor: "pointer", textAlign: "left",
                  border: `1.5px solid ${on ? e.color : C.border}`, background: on ? e.color + "18" : C.surface }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: e.color + "22", color: e.color,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <e.Icon size={19} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ color: on ? e.color : C.text, fontSize: 14.5, fontWeight: 600, margin: 0 }}>{e.label}</p>
                    <p style={{ color: C.muted, fontSize: 12, margin: "2px 0 0", lineHeight: 1.4 }}>{e.desc}</p>
                  </div>
                  {on && <Check size={18} color={e.color} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stepId === "blockers" && (
        <div>
          <p style={styles.eyebrow}>Unblock</p>
          <h1 style={styles.h1}>What held you back?</h1>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, marginTop: -10, marginBottom: 20 }}>
            The book calls these your Kryptonite. Naming it is most of the fix.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {BLOCKERS.map((b) => {
              const on = blockers.includes(b.id);
              return (
                <div key={b.id}>
                  <button onClick={() => toggleBlocker(b.id)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 13,
                    padding: "14px 15px", borderRadius: 16, cursor: "pointer", textAlign: "left",
                    border: `1.5px solid ${on ? b.color : C.border}`, background: on ? b.color + "18" : C.surface }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, background: b.color + "22", color: b.color,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <b.Icon size={19} />
                    </div>
                    <span style={{ flex: 1, color: on ? b.color : C.text, fontSize: 14.5, fontWeight: 600 }}>{b.label}</span>
                    {on && <Check size={18} color={b.color} />}
                  </button>
                  {on && (
                    <p style={{ color: C.muted, fontSize: 12, lineHeight: 1.5, margin: "8px 4px 0", fontStyle: "italic" }}>
                      💡 {b.tip}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {stepId === "reflect" && (
        <div>
          <p style={styles.eyebrow}>Journal</p>
          <h1 style={styles.h1}>A quick reflection</h1>
          <p style={styles.sectionLabel}>A good deed today</p>
          <input value={deed} onChange={(e) => setDeed(e.target.value)} placeholder="Something kind or right you did…" style={styles.input} />
          <p style={styles.sectionLabel}>Reflection</p>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4}
            placeholder="What moved you forward? What held you back?" style={{ ...styles.input, resize: "none", lineHeight: 1.5 }} />
        </div>
      )}

      {stepId === "recharge" && (
        <div>
          <p style={styles.eyebrow}>Sustain</p>
          <h1 style={styles.h1}>How recharged do you feel?</h1>
          <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, marginTop: -10, marginBottom: 22 }}>
            Burnout builds quietly. Checking in on this protects tomorrow's energy.
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
            {RECHARGE_LEVELS.map((r) => {
              const on = recharge === r.v;
              return (
                <button key={r.v} onClick={() => setRecharge(r.v)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
                  padding: "16px 4px", borderRadius: 16, cursor: "pointer", border: `1.5px solid ${on ? "#5FC7C0" : C.border}`,
                  background: on ? "#5FC7C022" : C.surface }}>
                  <span style={{ fontSize: 24 }}>{r.emoji}</span>
                  <span style={{ color: on ? "#5FC7C0" : C.muted, fontSize: 9, fontWeight: 600, textAlign: "center", lineHeight: 1.2 }}>{r.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {stepId === "summary" && (
        <div>
          <p style={styles.eyebrow}>{longDate(todayStr())}</p>
          <h1 style={styles.h1}>Today, in short</h1>
          <div style={styles.mantraCard}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", marginBottom: 16 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 30 }}>{FEEL_LEVELS.find((f) => f.v === feel)?.emoji}</div>
                <p style={{ color: C.muted, fontSize: 10, margin: "4px 0 0" }}>Felt {FEEL_LEVELS.find((f) => f.v === feel)?.label.toLowerCase()}</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ color: C.gold, fontSize: 26, fontFamily: "Fraunces, serif", fontWeight: 600 }}>{avgScore.toFixed(1)}</div>
                <p style={{ color: C.muted, fontSize: 10, margin: "4px 0 0" }}>Avg balance</p>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 30 }}>{RECHARGE_LEVELS.find((r) => r.v === recharge)?.emoji}</div>
                <p style={{ color: C.muted, fontSize: 10, margin: "4px 0 0" }}>Ending recharged</p>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${C.gold}33`, paddingTop: 13 }}>
              <p style={{ color: C.text, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                {energizers.length > 0 ? (
                  <>Fueled by <b style={{ color: C.gold }}>{energizers.map((id) => ENERGIZERS.find((e) => e.id === id).label).join(" + ")}</b>.</>
                ) : "No particular energizer today."}
                {" "}
                {blockers.length > 0 ? (
                  <>Held back by <b style={{ color: C.red }}>{blockers.map((id) => BLOCKERS.find((b) => b.id === id).label).join(" + ")}</b>.</>
                ) : "Nothing blocking you today 🎉"}
              </p>
            </div>
          </div>
          <button onClick={save} style={{ ...styles.premiumCta, marginTop: 6 }}>
            <Check size={18} /> Save today
          </button>
        </div>
      )}

      {stepId !== "summary" && (
        <button onClick={next} style={{ ...styles.cta, marginTop: 26 }}>
          Continue <ChevronLeft size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
      )}
    </div>
  );
}

// ---------------- JOURNAL / HISTORY — free writing, patched with check-in reflections ----------------
function JournalView({ sorted, onCheckin, journalEntries, setJournalEntries }) {
  const [open, setOpen] = useState(null);
  const [draft, setDraft] = useState("");

  const addEntry = () => {
    if (!draft.trim()) return;
    setJournalEntries((prev) => [...prev, { id: Date.now(), date: todayStr(), text: draft.trim(), createdAt: Date.now() }]);
    setDraft("");
  };
  const removeEntry = (id) => setJournalEntries((prev) => prev.filter((e) => e.id !== id));

  const unified = useMemo(() => {
    const map = {};
    sorted.forEach((c) => { map[c.date] = map[c.date] || { date: c.date, entries: [] }; map[c.date].checkin = c; });
    journalEntries.forEach((e) => { map[e.date] = map[e.date] || { date: e.date, entries: [] }; map[e.date].entries.push(e); });
    Object.values(map).forEach((d) => d.entries.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)));
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [sorted, journalEntries]);

  return (
    <div style={{ padding: "26px 20px 16px" }}>
      <p style={styles.eyebrow}>Your history</p>
      <h1 style={styles.h1}>Journal</h1>

      <div style={styles.softCard}>
        <p style={styles.miniLabel}>Write freely — today, {longDate(todayStr())}</p>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
          placeholder="Anything on your mind…" style={{ ...styles.input, marginTop: 4, resize: "none", lineHeight: 1.5, fontSize: 13.5 }} />
        <button onClick={addEntry} style={{ ...styles.cta, height: 42, marginTop: 8, fontSize: 13 }}>
          <PenLine size={15} /> Save entry
        </button>
        <p style={{ color: C.faint, fontSize: 10.5, marginTop: 8, marginBottom: 0, lineHeight: 1.4 }}>
          This patches together with that day's check-in reflection below.
        </p>
      </div>

      {unified.length === 0 ? (
        <div style={{ ...styles.softCard, textAlign: "center", padding: "40px 22px" }}>
          <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.55, marginBottom: 16 }}>
            No entries yet. Write above, or check in — either one lands here.
          </p>
          <button onClick={onCheckin} style={{ ...styles.cta, height: 46 }}><PenLine size={16} /> Start today</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {unified.map((item) => {
            const c = item.checkin;
            const vals = c ? PILLARS.map((p) => c.scores[p.id]).filter((v) => typeof v === "number") : [];
            const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
            const isOpen = open === item.date;
            return (
              <div key={item.date} style={styles.softCard}>
                <button onClick={() => setOpen(isOpen ? null : item.date)}
                  style={{ width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ color: C.text, fontSize: 14.5, fontWeight: 500, fontFamily: "Inter, sans-serif" }}>{longDate(item.date)}</span>
                      <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
                        {c ? PILLARS.map((p) => (
                          <span key={p.id} title={p.name} style={{ width: 9, height: 9, borderRadius: 5,
                            background: p.color, opacity: 0.25 + 0.15 * (c.scores[p.id] || 0) }} />
                        )) : <span style={{ color: C.faint, fontSize: 11 }}>{item.entries.length} journal entr{item.entries.length === 1 ? "y" : "ies"}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {avg !== null ? (
                        <span style={{ color: C.gold, fontSize: 16, fontFamily: "Fraunces, serif", fontWeight: 600 }}>{avg.toFixed(1)}</span>
                      ) : <BookOpen size={15} color={C.faint} />}
                      {isOpen ? <ChevronUp size={16} color={C.faint} /> : <ChevronDown size={16} color={C.faint} />}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                    {c && (c.feel || c.recharge) && (
                      <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                        {c.feel && <span style={{ fontSize: 12, color: C.muted }}>{FEEL_LEVELS.find((f) => f.v === c.feel)?.emoji} Felt {FEEL_LEVELS.find((f) => f.v === c.feel)?.label.toLowerCase()}</span>}
                        {c.recharge && <span style={{ fontSize: 12, color: C.muted }}>{RECHARGE_LEVELS.find((r) => r.v === c.recharge)?.emoji} {RECHARGE_LEVELS.find((r) => r.v === c.recharge)?.label}</span>}
                      </div>
                    )}
                    {c && PILLARS.map((p) => (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <p.Icon size={13} color={p.color} />
                        <span style={{ color: C.muted, fontSize: 12.5, flex: 1 }}>{p.name}</span>
                        <span style={{ color: C.text, fontSize: 12.5 }}>{c.scores[p.id] ?? "–"}</span>
                      </div>
                    ))}
                    {c && (c.energizers?.length > 0 || c.blockers?.length > 0) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                        {(c.energizers || []).map((id) => {
                          const e = ENERGIZERS.find((x) => x.id === id);
                          return e && <span key={id} style={{ ...styles.miniTag, color: e.color, background: e.color + "1a" }}><e.Icon size={9} /> {e.label}</span>;
                        })}
                        {(c.blockers || []).map((id) => {
                          const b = BLOCKERS.find((x) => x.id === id);
                          return b && <span key={id} style={{ ...styles.miniTag, color: b.color, background: b.color + "1a" }}><b.Icon size={9} /> {b.label}</span>;
                        })}
                      </div>
                    )}
                    {c && c.deed && <p style={{ color: C.text, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
                      <span style={{ color: P_BY_ID.deeds.color }}>Deed · </span>{c.deed}</p>}

                    {(c?.note || item.entries.length > 0) && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10 }}>
                        <p style={styles.miniLabel}>Journal</p>
                        {c?.note && (
                          <div>
                            <span style={{ color: C.faint, fontSize: 10 }}>From check-in</span>
                            <p style={{ color: C.muted, fontSize: 13, marginTop: 2, lineHeight: 1.55, fontStyle: "italic" }}>“{c.note}”</p>
                          </div>
                        )}
                        {item.entries.map((e) => (
                          <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ color: C.faint, fontSize: 10 }}>
                                {e.createdAt ? new Date(e.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : ""}
                              </span>
                              <p style={{ color: C.text, fontSize: 13, marginTop: 2, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{e.text}</p>
                            </div>
                            <button onClick={() => removeEntry(e.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2, flexShrink: 0 }}>
                              <X size={13} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------- MONEY — goals, playbook, and project ideas for building wealth ----------------
function MoneyView({ strategies, setStrategies, moneyPrinciples, setMoneyPrinciples, moneyIdeas, setMoneyIdeas, netWorth, setNetWorth,
  transactions, setTransactions, monthlyIncome, setMonthlyIncome, budgetSplit, setBudgetSplit }) {
  const [tab, setTab] = useState("flow");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");

  const add = () => {
    if (!name.trim() || !target) return;
    setStrategies((s) => [...s, { id: Date.now(), name: name.trim(), target: +target, current: 0, note: "" }]);
    setName(""); setTarget("");
  };
  const update = (id, patch) => setStrategies((s) => s.map((x) => x.id === id ? { ...x, ...patch } : x));
  const remove = (id) => setStrategies((s) => s.filter((x) => x.id !== id));

  const totalTarget = strategies.reduce((a, s) => a + (s.target || 0), 0);
  const totalCurrent = strategies.reduce((a, s) => a + (s.current || 0), 0);
  const pct = totalTarget ? Math.min(100, (totalCurrent / totalTarget) * 100) : 0;

  const togglePrinciple = (id) => setMoneyPrinciples((p) => ({ ...p, [id]: !p[id] }));
  const toggleIdea = (id) => setMoneyIdeas((p) => ({ ...p, [id]: !p[id] }));
  const adoptedCount = Object.values(moneyPrinciples).filter(Boolean).length;
  const principlesPct = Math.round((adoptedCount / MONEY_PRINCIPLES.length) * 100);

  const byCat = {};
  MONEY_PRINCIPLES.forEach((p) => { byCat[p.cat] = byCat[p.cat] || []; byCat[p.cat].push(p); });

  const assets = parseFloat(netWorth.assets) || 0;
  const liabilities = parseFloat(netWorth.liabilities) || 0;
  const nw = assets - liabilities;

  // ---- Cash flow ----
  const [txType, setTxType] = useState("expense");
  const [txCat, setTxCat] = useState("needs");
  const [txAmount, setTxAmount] = useState("");
  const [txNote, setTxNote] = useState("");

  const addTx = () => {
    if (!txAmount) return;
    setTransactions((prev) => [...prev, { id: Date.now(), type: txType, category: txType === "expense" ? txCat : null, amount: +txAmount, note: txNote.trim(), date: todayStr() }]);
    setTxAmount(""); setTxNote("");
  };
  const removeTx = (id) => setTransactions((prev) => prev.filter((t) => t.id !== id));

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

  return (
    <div style={{ padding: "26px 20px 16px" }}>
      <p style={styles.eyebrow}>Build wealth</p>
      <h1 style={styles.h1}>Money</h1>

      <div style={styles.mapCard}>
        <p style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, margin: 0 }}>Net worth snapshot</p>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <p style={styles.miniLabel}>Assets</p>
            <input value={netWorth.assets} onChange={(e) => setNetWorth((n) => ({ ...n, assets: e.target.value.replace(/[^0-9.]/g, "") }))}
              inputMode="decimal" placeholder="0" style={{ ...styles.input, marginTop: 0 }} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={styles.miniLabel}>Liabilities</p>
            <input value={netWorth.liabilities} onChange={(e) => setNetWorth((n) => ({ ...n, liabilities: e.target.value.replace(/[^0-9.]/g, "") }))}
              inputMode="decimal" placeholder="0" style={{ ...styles.input, marginTop: 0 }} />
          </div>
        </div>
        <p style={{ marginTop: 14, fontFamily: "Fraunces, serif", fontSize: 22, fontWeight: 600, color: nw >= 0 ? C.gold : C.red, marginBottom: 0 }}>
          {money(nw)} <span style={{ color: C.faint, fontSize: 12, fontFamily: "Inter, sans-serif" }}>net worth</span>
        </p>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {[["flow", "Flow"], ["goals", "Goals"], ["playbook", "Playbook"], ["ideas", "Ideas"]].map(([k, l]) => {
          const on = tab === k;
          return <button key={k} onClick={() => setTab(k)} style={{ ...styles.pill, flexShrink: 0,
            border: `1px solid ${on ? C.gold : C.border}`, background: on ? C.gold + "22" : "transparent",
            color: on ? C.gold : C.muted }}>{l}</button>;
        })}
      </div>

      {tab === "flow" && (
        <>
          <div style={styles.softCard}>
            <p style={styles.miniLabel}>Monthly income (estimate)</p>
            <input value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal" placeholder="0" style={{ ...styles.input, marginTop: 4 }} />
            <p style={{ ...styles.miniLabel, marginTop: 12 }}>Budget split — {splitSum}% {splitSum !== 100 && <span style={{ color: C.red }}>(should total 100%)</span>}</p>
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              {BUDGET_CATS.map((cat) => (
                <div key={cat.id} style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: cat.color }} />
                    <span style={{ color: C.muted, fontSize: 10.5 }}>{cat.label}</span>
                  </div>
                  <input value={budgetSplit[cat.id]} onChange={(e) => setBudgetSplit((b) => ({ ...b, [cat.id]: +e.target.value.replace(/[^0-9]/g, "") || 0 }))}
                    inputMode="numeric" style={{ ...styles.input, marginTop: 0, padding: "9px 10px", textAlign: "center", fontSize: 13 }} />
                </div>
              ))}
            </div>
          </div>

          <div style={styles.mapCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>This month</span>
              <span style={{ color: thisMonth.net >= 0 ? C.gold : C.red, fontSize: 13, fontWeight: 600 }}>{thisMonth.net >= 0 ? "+" : ""}{money(thisMonth.net)} net</span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
              <div style={{ flex: 1 }}>
                <p style={{ color: C.gold, fontSize: 18, fontFamily: "Fraunces, serif", fontWeight: 600, margin: 0 }}>{money(thisMonth.income)}</p>
                <p style={{ color: C.faint, fontSize: 10.5, margin: "2px 0 0" }}>Income logged</p>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ color: C.red, fontSize: 18, fontFamily: "Fraunces, serif", fontWeight: 600, margin: 0 }}>{money(thisMonth.totalExpense)}</p>
                <p style={{ color: C.faint, fontSize: 10.5, margin: "2px 0 0" }}>Spent</p>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              {BUDGET_CATS.map((cat) => {
                const spent = thisMonth.byCat[cat.id] || 0;
                const target = targets[cat.id];
                const p = target ? Math.min(100, (spent / target) * 100) : 0;
                return (
                  <div key={cat.id}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ color: C.text, fontSize: 12.5 }}>{cat.label}</span>
                      <span style={{ color: p > 100 ? C.red : C.muted, fontSize: 11.5 }}>{money(spent)} of {money(target)}</span>
                    </div>
                    <div style={styles.track}><div style={{ ...styles.fill, width: `${p}%`, background: p > 100 ? C.red : cat.color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <p style={styles.sectionLabel}>Money flow — last 6 months</p>
          <div style={{ ...styles.mapCard, height: 220, padding: "18px 8px 6px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={flowData} margin={{ top: 6, right: 10, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: C.faint, fontSize: 10.5 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Income" fill={C.gold} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill={C.red} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.softCard}>
            <p style={styles.miniLabel}>Log a transaction</p>
            <div style={{ display: "flex", gap: 6, marginTop: 4, marginBottom: 8 }}>
              {[["expense", "Expense"], ["income", "Income"]].map(([k, l]) => {
                const on = txType === k;
                return <button key={k} onClick={() => setTxType(k)} style={{ ...styles.pill, flex: 1, textAlign: "center",
                  border: `1px solid ${on ? C.gold : C.border}`, background: on ? C.gold + "22" : "transparent", color: on ? C.gold : C.muted }}>{l}</button>;
              })}
            </div>
            {txType === "expense" && (
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {BUDGET_CATS.map((cat) => {
                  const on = txCat === cat.id;
                  return <button key={cat.id} onClick={() => setTxCat(cat.id)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
                    padding: "7px 4px", borderRadius: 10, cursor: "pointer", fontSize: 11,
                    border: `1px solid ${on ? cat.color : C.border}`, background: on ? cat.color + "22" : "transparent", color: on ? cat.color : C.muted }}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: cat.color }} /> {cat.label}
                  </button>;
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={txAmount} onChange={(e) => setTxAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
                placeholder="Amount" style={{ ...styles.input, marginTop: 0, flex: 1 }} />
              <button onClick={addTx} style={styles.addBtn}><Plus size={20} /></button>
            </div>
            <input value={txNote} onChange={(e) => setTxNote(e.target.value)} placeholder="Note (optional)"
              style={{ ...styles.input, marginTop: 8, fontSize: 13 }} />
          </div>

          <p style={styles.sectionLabel}>Recent</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {recentTx.length === 0 && (
              <p style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "18px", lineHeight: 1.55 }}>No transactions logged yet.</p>
            )}
            {recentTx.map((t) => {
              const cat = t.category ? BUDGET_CATS.find((c) => c.id === t.category) : null;
              const color = t.type === "income" ? C.gold : (cat?.color || C.muted);
              return (
                <div key={t.id} style={styles.taskRow}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ color: C.text, fontSize: 13 }}>{t.note || (t.type === "income" ? "Income" : cat?.label || "Expense")}</span>
                    <span style={{ color: C.faint, fontSize: 10.5, marginLeft: 8 }}>{prettyDate(t.date)}</span>
                  </div>
                  <span style={{ color, fontSize: 13, fontWeight: 600 }}>{t.type === "income" ? "+" : "-"}{money(t.amount)}</span>
                  <button onClick={() => removeTx(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 2 }}>
                    <X size={13} /></button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "goals" && (
        <>
          {strategies.length > 0 && (
            <div style={styles.softCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>Total progress</span>
                <span style={{ color: C.gold, fontSize: 13 }}>{Math.round(pct)}%</span>
              </div>
              <div style={{ ...styles.track, height: 9, marginTop: 12 }}>
                <div style={{ ...styles.fill, width: `${pct}%`, background: C.gold }} /></div>
              <p style={{ color: C.text, fontSize: 15, marginTop: 12, fontFamily: "Fraunces, serif" }}>
                {money(totalCurrent)} <span style={{ color: C.faint }}>of {money(totalTarget)}</span></p>
            </div>
          )}

          <div style={styles.softCard}>
            <p style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 11 }}>New strategy</p>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency fund, Pay off card, Invest"
              style={{ ...styles.input, marginTop: 0 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
              <input value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal"
                placeholder="Target amount" style={{ ...styles.input, marginTop: 0, flex: 1 }} />
              <button onClick={add} style={styles.addBtn}><Plus size={20} /></button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 6 }}>
            {strategies.length === 0 && (
              <p style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: "26px 20px", lineHeight: 1.55 }}>
                Name a money goal and its target. Then log what you've set aside — the bar fills as you go.
              </p>
            )}
            {strategies.map((s) => {
              const p = s.target ? Math.min(100, (s.current / s.target) * 100) : 0;
              return (
                <div key={s.id} style={styles.softCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <span style={{ color: C.text, fontSize: 15, fontWeight: 500 }}>{s.name}</span>
                    <button onClick={() => remove(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 0 }}>
                      <Trash2 size={15} /></button>
                  </div>
                  <div style={{ ...styles.track, height: 8, marginTop: 11 }}>
                    <div style={{ ...styles.fill, width: `${p}%`, background: C.gold }} /></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
                    <span style={{ color: C.muted, fontSize: 12.5 }}>Saved</span>
                    <input value={s.current || ""} onChange={(e) => update(s.id, { current: +e.target.value.replace(/[^0-9.]/g, "") || 0 })}
                      inputMode="decimal" placeholder="0"
                      style={{ ...styles.input, marginTop: 0, width: 90, padding: "8px 11px", textAlign: "right" }} />
                    <span style={{ color: C.faint, fontSize: 12.5, marginLeft: "auto" }}>of {money(s.target)} · {Math.round(p)}%</span>
                  </div>
                  <input value={s.note || ""} onChange={(e) => update(s.id, { note: e.target.value })}
                    placeholder="Strategy note (e.g. 200/mo automatic)"
                    style={{ ...styles.input, marginTop: 10, fontSize: 13 }} />
                </div>
              );
            })}
          </div>
        </>
      )}

      {tab === "playbook" && (
        <>
          <div style={styles.softCard}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <span style={{ color: C.muted, fontSize: 12 }}>{adoptedCount} of {MONEY_PRINCIPLES.length} adopted</span>
              <span style={{ color: C.gold, fontSize: 12, fontWeight: 600 }}>{principlesPct}%</span>
            </div>
            <div style={{ ...styles.track, height: 6 }}><div style={{ ...styles.fill, width: `${principlesPct}%`, background: C.gold }} /></div>
          </div>
          {Object.entries(byCat).map(([cat, items]) => (
            <div key={cat}>
              <p style={styles.sectionLabel}>{cat}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {items.map((pr) => {
                  const on = !!moneyPrinciples[pr.id];
                  return (
                    <button key={pr.id} onClick={() => togglePrinciple(pr.id)} style={{ ...styles.softCard, width: "100%", textAlign: "left",
                      cursor: "pointer", border: `1px solid ${on ? C.gold + "44" : C.border}`, margin: 0 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 11 }}>
                        <div style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, marginTop: 1,
                          border: `1.6px solid ${on ? C.gold : C.faint}`, background: on ? C.gold : "transparent",
                          display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {on && <Check size={13} color="#14131f" strokeWidth={3} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ color: on ? C.gold : C.text, fontSize: 13.5, fontWeight: 600, margin: 0 }}>{pr.title}</p>
                          <p style={{ color: C.muted, fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{pr.desc}</p>
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
          <p style={{ color: C.muted, fontSize: 12.5, lineHeight: 1.5, marginTop: -4, marginBottom: 14 }}>
            Low-to-moderate barrier ways to build income on the side. Star the ones worth exploring.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {SIDE_HUSTLE_IDEAS.map((idea) => {
              const starred = !!moneyIdeas[idea.id];
              return (
                <div key={idea.id} style={styles.softCard}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <span style={{ color: C.text, fontSize: 14, fontWeight: 600 }}>{idea.title}</span>
                    <button onClick={() => toggleIdea(idea.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, flexShrink: 0 }}>
                      <Star size={17} color={starred ? C.gold : C.faint} fill={starred ? C.gold : "none"} />
                    </button>
                  </div>
                  <span style={{ ...styles.miniTag, marginTop: 8, display: "inline-flex" }}>{idea.level}</span>
                  <p style={{ color: C.muted, fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>{idea.desc}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      <p style={{ color: C.faint, fontSize: 10.5, marginTop: 22, lineHeight: 1.5 }}>
        General financial education, not personalized advice. Sanity-check big decisions with your own research or a professional.
      </p>
    </div>
  );
}

// ---------------- INSIGHTS: summary + trends + goals ----------------
function InsightsView({ sorted, streak, goals, setGoals }) {
  const [span, setSpan] = useState("week");
  const [pid, setPid] = useState("overall");
  const [gpid, setGpid] = useState(PILLARS[0].id);
  const [gtext, setGtext] = useState("");

  const period = useMemo(() => {
    const cut = new Date(); cut.setDate(cut.getDate() - (span === "week" ? 6 : 29));
    return summarize(sorted.filter((c) => parseD(c.date) >= cut));
  }, [sorted, span]);

  const trend = useMemo(() => sorted.map((c) => {
    const row = { date: prettyDate(c.date) };
    if (pid === "overall") {
      const vals = PILLARS.map((p) => c.scores[p.id]).filter((v) => typeof v === "number");
      row.value = vals.length ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : null;
    } else row.value = c.scores[pid] ?? null;
    return row;
  }), [sorted, pid]);
  const active = pid === "overall" ? { name: "Balance", color: C.gold } : P_BY_ID[pid];

  const addGoal = () => { if (!gtext.trim()) return;
    setGoals((g) => [...g, { id: Date.now(), pillar: gpid, text: gtext.trim(), done: false }]); setGtext(""); };
  const toggle = (id) => setGoals((g) => g.map((x) => x.id === id ? { ...x, done: !x.done } : x));
  const removeGoal = (id) => setGoals((g) => g.filter((x) => x.id !== id));

  return (
    <div style={{ padding: "26px 20px 16px" }}>
      <p style={styles.eyebrow}>Look back</p>
      <h1 style={styles.h1}>Insights</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        {[["week", "This week"], ["month", "This month"]].map(([k, label]) => {
          const on = span === k;
          return <button key={k} onClick={() => setSpan(k)} style={{ ...styles.pill,
            border: `1px solid ${on ? C.gold : C.border}`, background: on ? C.gold + "22" : "transparent",
            color: on ? C.gold : C.muted }}>{label}</button>;
        })}
      </div>

      <div style={styles.mapCard}>
        {period.entries === 0 ? (
          <p style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: "20px 10px", lineHeight: 1.55 }}>
            No check-ins in this window yet. Your reflection summary fills in as you log.
          </p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10 }}>
              <SummaryTile label="Balance" value={period.balance.toFixed(1)} sub="/ 5" />
              <SummaryTile label="Logged" value={period.entries} sub={span === "week" ? "/ 7" : "/ 30"} />
              <SummaryTile label="Deeds" value={period.deeds} sub="" />
              <SummaryTile label="Streak" value={streak} sub="d" />
            </div>
            {period.best && (
              <p style={{ color: C.text, fontSize: 13.5, lineHeight: 1.6, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
                Your strongest area was <b style={{ color: P_BY_ID[period.best].color }}>{P_BY_ID[period.best].name}</b>.
                {period.focus && period.focus !== period.best &&
                  <> The one asking for attention is <b style={{ color: P_BY_ID[period.focus].color }}>{P_BY_ID[period.focus].name}</b> — a small step there would even out your map.</>}
              </p>
            )}
          </>
        )}
      </div>

      <p style={styles.sectionLabel}>Trend</p>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 12, margin: "0 -20px", paddingLeft: 20, paddingRight: 20 }}>
        {[{ id: "overall", name: "Balance", color: C.gold }, ...PILLARS].map((p) => {
          const on = pid === p.id;
          return <button key={p.id} onClick={() => setPid(p.id)} style={{ ...styles.pill, flexShrink: 0,
            border: `1px solid ${on ? p.color : C.border}`, background: on ? p.color + "22" : "transparent",
            color: on ? p.color : C.muted }}>{p.name}</button>;
        })}
      </div>
      {sorted.length < 2 ? (
        <div style={{ ...styles.softCard, textAlign: "center", padding: "36px 20px" }}>
          <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.55 }}>Two check-ins and the lines start to grow. Keep going.</p>
        </div>
      ) : (
        <div style={{ ...styles.mapCard, height: 260, padding: "18px 8px 6px" }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 6, right: 12, bottom: 4, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fill: C.faint, fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 10, color: C.text, fontSize: 12 }} />
              <Line type="monotone" dataKey="value" stroke={active.color} strokeWidth={2.4}
                dot={{ r: 3, fill: active.color, strokeWidth: 0 }} connectNulls name={active.name} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <p style={styles.sectionLabel}>Intentions</p>
      <div style={styles.softCard}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 11 }}>
          {PILLARS.map((p) => {
            const on = gpid === p.id;
            return <button key={p.id} onClick={() => setGpid(p.id)} style={{ padding: "6px 11px", borderRadius: 16,
              cursor: "pointer", fontSize: 12, border: `1px solid ${on ? p.color : C.border}`,
              background: on ? p.color + "22" : "transparent", color: on ? p.color : C.muted, fontWeight: 500 }}>{p.name}</button>;
          })}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={gtext} onChange={(e) => setGtext(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addGoal()}
            placeholder="Set an intention…" style={{ ...styles.input, marginTop: 0, flex: 1 }} />
          <button onClick={addGoal} style={styles.addBtn}><Plus size={20} /></button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 6 }}>
        {goals.length === 0 && <p style={{ color: C.muted, fontSize: 13.5, textAlign: "center", padding: "22px", lineHeight: 1.55 }}>
          Name one thing you want to move on, in any pillar.</p>}
        {goals.map((g) => {
          const p = P_BY_ID[g.pillar];
          return (
            <div key={g.id} style={styles.goalRow}>
              <button onClick={() => toggle(g.id)} style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, cursor: "pointer",
                border: `1.6px solid ${g.done ? p.color : C.faint}`, background: g.done ? p.color : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center" }}>
                {g.done && <Check size={15} color="#14131f" strokeWidth={3} />}</button>
              <div style={{ flex: 1 }}>
                <span style={{ color: g.done ? C.faint : C.text, fontSize: 14, textDecoration: g.done ? "line-through" : "none" }}>{g.text}</span>
                <div style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: p.color }} />
                  <span style={{ color: C.faint, fontSize: 11 }}>{p.name}</span>
                </div>
              </div>
              <button onClick={() => removeGoal(g.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.faint, padding: 4 }}>
                <Trash2 size={16} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryTile({ label, value, sub }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2 }}>
        <span style={{ color: C.text, fontSize: 20, fontFamily: "Fraunces, serif", fontWeight: 600 }}>{value}</span>
        <span style={{ color: C.faint, fontSize: 10 }}>{sub}</span>
      </div>
      <p style={{ color: C.muted, fontSize: 9.5, marginTop: 2, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</p>
    </div>
  );
}

// ---------------- styles ----------------
const styles = {
  app: { minHeight: "100vh", background: `radial-gradient(120% 80% at 50% -10%, #201d38 0%, ${C.bg} 55%)`, color: C.text, fontFamily: "Inter, sans-serif" },
  phone: { maxWidth: 440, margin: "0 auto", minHeight: "100vh", position: "relative", display: "flex", flexDirection: "column" },
  scroll: { flex: 1, overflowY: "auto", paddingBottom: 78 },
  eyebrow: { color: C.muted, fontSize: 12, letterSpacing: 1.2, textTransform: "uppercase", margin: 0 },
  h1: { color: C.text, fontFamily: "Fraunces, serif", fontSize: 32, fontWeight: 600, margin: "4px 0 18px", letterSpacing: -0.5 },
  mapCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: 16, marginBottom: 16 },
  softCard: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 15, marginBottom: 12 },
  statRow: { display: "flex", alignItems: "center", marginTop: 8, paddingTop: 14, borderTop: `1px solid ${C.border}` },
  divider: { width: 1, height: 30, background: C.border },
  cta: { width: "100%", height: 52, borderRadius: 15, border: "none", cursor: "pointer", background: C.gold, color: "#14131f", fontWeight: 600, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "Inter, sans-serif" },
  premiumCta: { width: "100%", height: 52, borderRadius: 15, border: "none", cursor: "pointer",
    background: `linear-gradient(135deg, ${C.gold}, #E8946F)`, color: "#14131f", fontWeight: 700, fontSize: 14.5,
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "Inter, sans-serif",
    boxShadow: `0 6px 20px -6px ${C.gold}88`, marginBottom: 4 },
  mantraCard: { background: `linear-gradient(135deg, ${C.gold}14, ${C.surface})`, border: `1px solid ${C.gold}33`, borderRadius: 16, padding: "16px 15px", marginBottom: 4 },
  rerollBtn: { display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: C.gold, cursor: "pointer", fontSize: 11.5, marginTop: 10, padding: 0, fontFamily: "Inter, sans-serif" },
  proBadge: { display: "flex", alignItems: "center", gap: 3, background: `${C.gold}22`, color: C.gold, fontSize: 9, fontWeight: 700,
    padding: "3px 7px", borderRadius: 8, letterSpacing: 0.4 },
  iconBtn: { width: 32, height: 32, borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.muted,
    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  taskRow: { display: "flex", alignItems: "center", gap: 9, padding: "9px 2px" },
  taskRowOverdue: { background: "#E8746F0f", borderRadius: 10, padding: "9px 8px", margin: "0 -6px" },
  timeTag: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.muted, background: C.surface2, padding: "3px 7px", borderRadius: 7, flexShrink: 0, whiteSpace: "nowrap" },
  twoMinTag: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.gold, background: C.gold + "1a", border: "none",
    padding: "3px 7px", borderRadius: 7, flexShrink: 0, whiteSpace: "nowrap", cursor: "pointer", fontFamily: "Inter, sans-serif" },
  routineTag: { fontSize: 9.5, color: C.faint, background: C.surface2, padding: "2px 7px", borderRadius: 7, flexShrink: 0 },
  miniStreak: { display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: C.gold, background: C.gold + "1a", padding: "3px 6px", borderRadius: 7, flexShrink: 0 },
  avoidTag: { fontSize: 9.5, color: C.red, background: C.red + "1a", padding: "2px 7px", borderRadius: 7, flexShrink: 0 },
  miniTag: { display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: C.muted, background: C.surface2, padding: "3px 8px", borderRadius: 7, flexShrink: 0 },
  miniLabel: { color: C.muted, fontSize: 10.5, margin: "0 0 6px" },
  advToggle: { display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: C.muted, cursor: "pointer",
    fontSize: 11, marginTop: 10, padding: 0, fontFamily: "Inter, sans-serif" },
  streakCard: { display: "flex", alignItems: "center", gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: "14px 16px", marginTop: 16, marginBottom: 4 },
  warnBanner: { display: "flex", gap: 9, background: C.red + "12", border: `1px solid ${C.red}33`, borderRadius: 14, padding: "12px 14px", marginBottom: 14 },
  celebrate: { display: "flex", alignItems: "center", gap: 7, color: C.gold, fontSize: 12.5, fontWeight: 600, marginBottom: 12,
    background: C.gold + "14", padding: "8px 12px", borderRadius: 10 },
  voteCard: { width: "100%", display: "flex", alignItems: "center", gap: 10, background: C.surface, border: `1px solid ${C.border}`,
    borderRadius: 14, padding: "12px 14px", marginTop: 4, marginBottom: 16, cursor: "pointer", textAlign: "left" },
  sectionLabel: { color: C.muted, fontSize: 12, letterSpacing: 0.8, textTransform: "uppercase", margin: "26px 0 12px" },
  pillarRow: { display: "flex", alignItems: "center", gap: 13, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 15, padding: "13px 15px" },
  pIcon: { width: 38, height: 38, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  track: { height: 6, borderRadius: 4, background: "rgba(255,255,255,0.07)", overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, transition: "width .4s ease" },
  pill: { padding: "8px 15px", borderRadius: 20, cursor: "pointer", fontSize: 12.5, fontWeight: 500, fontFamily: "Inter, sans-serif" },
  nav: { position: "absolute", bottom: 0, left: 0, right: 0, height: 66, background: "rgba(20,19,31,0.92)", backdropFilter: "blur(12px)", borderTop: `1px solid ${C.border}`, display: "flex", zIndex: 3 },
  navBtn: { flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" },
  back: { background: "none", border: "none", color: C.muted, cursor: "pointer", display: "flex", alignItems: "center", gap: 2, fontSize: 13.5, marginBottom: 8, padding: 0, fontFamily: "Inter, sans-serif" },
  input: { width: "100%", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 13, padding: "13px 15px", color: C.text, fontSize: 14, fontFamily: "Inter, sans-serif", marginTop: 4, boxSizing: "border-box", outline: "none" },
  addBtn: { width: 46, flexShrink: 0, borderRadius: 13, border: "none", background: C.gold, color: "#14131f", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  goalRow: { display: "flex", alignItems: "flex-start", gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "13px 14px" },
};
