import {
  Sparkles, Coins, Sprout, Heart, HandHeart, HeartPulse, Users,
  Gamepad2, Zap, HelpCircle, AlertCircle, Anchor,
} from "lucide-react";
import { C } from "../theme.js";

// ---- The seven areas you track ----
export const PILLARS = [
  { id: "spiritual",     name: "Spiritual",     color: C.purple, Icon: Sparkles,   prompt: "Prayer, reflection, gratitude, presence" },
  { id: "financial",     name: "Financial",     color: C.gold,   Icon: Coins,      prompt: "Discipline with money, sticking to plan" },
  { id: "growth",        name: "Self-growth",   color: C.green,  Icon: Sprout,     prompt: "Learning, discipline, habits, progress" },
  { id: "personality",   name: "Personality",   color: C.orange, Icon: Heart,      prompt: "Patience, honesty, character, temper" },
  { id: "deeds",         name: "Deeds",         color: C.pink,   Icon: HandHeart,  prompt: "Kindness, help, good actions today" },
  { id: "health",        name: "Health",        color: C.teal,   Icon: HeartPulse, prompt: "Sleep, movement, eating, energy" },
  { id: "relationships", name: "Relationships", color: C.blue,   Icon: Users,      prompt: "Family, friends, presence with others" },
];
export const P_BY_ID = Object.fromEntries(PILLARS.map((p) => [p.id, p]));

export const WEEKDAYS = [
  { key: "mon", label: "Monday",    short: "Mon", letter: "M" },
  { key: "tue", label: "Tuesday",   short: "Tue", letter: "T" },
  { key: "wed", label: "Wednesday", short: "Wed", letter: "W" },
  { key: "thu", label: "Thursday",  short: "Thu", letter: "T" },
  { key: "fri", label: "Friday",    short: "Fri", letter: "F" },
  { key: "sat", label: "Saturday",  short: "Sat", letter: "S" },
  { key: "sun", label: "Sunday",    short: "Sun", letter: "S" },
];
export const WK_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export const PRIORITY = {
  high: { label: "High", color: C.red },
  med:  { label: "Med",  color: C.gold },
  low:  { label: "Low",  color: C.blue },
};

export const AUDIT_TAGS = {
  good:    { label: "Good",    color: C.green },
  bad:     { label: "Bad",     color: C.red },
  neutral: { label: "Neutral", color: C.muted },
};

export const LIST_COLORS = [C.gold, C.blue, C.green, C.purple, C.pink, C.teal, C.orange, C.red];

// From Feel Good Productivity: the three energizers and the three "Kryptonite" blockers
export const ENERGIZERS = [
  { id: "play",   label: "Play",   Icon: Gamepad2, color: C.gold,   desc: "Approached something with curiosity or fun" },
  { id: "power",  label: "Power",  Icon: Zap,      color: C.purple, desc: "Felt capable, skilled, or in control" },
  { id: "people", label: "People", Icon: Users,    color: C.blue,   desc: "Connected with, or helped, someone" },
];
export const BLOCKERS = [
  { id: "uncertainty", label: "Uncertainty", Icon: HelpCircle,  color: C.muted, tip: "Get clear on just the next tiny step — you don't need the whole plan." },
  { id: "fear",        label: "Fear",        Icon: AlertCircle, color: C.red,   tip: "Ask yourself: what's the worst that could realistically happen?" },
  { id: "inertia",     label: "Inertia",     Icon: Anchor,      color: C.teal,  tip: "Shrink it down. Commit to just two minutes." },
];
export const FEEL_LEVELS = [
  { v: 1, emoji: "😴", label: "Drained" },
  { v: 2, emoji: "😕", label: "Low" },
  { v: 3, emoji: "😐", label: "Okay" },
  { v: 4, emoji: "🙂", label: "Good" },
  { v: 5, emoji: "🤩", label: "Energized" },
];
export const RECHARGE_LEVELS = [
  { v: 1, emoji: "🪫", label: "Running on empty" },
  { v: 2, emoji: "😮‍💨", label: "Tired" },
  { v: 3, emoji: "😌", label: "Steady" },
  { v: 4, emoji: "🌱", label: "Replenished" },
  { v: 5, emoji: "✨", label: "Fully recharged" },
];

// What each 1–5 score actually means, per pillar — shown live as you tap a number
export const PILLAR_LEVELS = {
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
export const MANTRAS = [
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
export const MONEY_PRINCIPLES = [
  { id: "emergency",   cat: "Foundation", title: "Build a starter emergency fund",      desc: "Aim for $1,000 first, then 3–6 months of expenses. This is what keeps a bad month from becoming a bad year." },
  { id: "budget",      cat: "Foundation", title: "Run a simple budget",                 desc: "A common split: 50% needs, 30% wants, 20% savings/debt. Doesn't have to be exact — just tracked." },
  { id: "highinterest",cat: "Foundation", title: "Kill high-interest debt first",       desc: "Credit card debt often runs 20%+ APR — paying it off usually beats almost any investment return." },
  { id: "credit",      cat: "Foundation", title: "Build credit early and carefully",    desc: "Pay in full, on time, every time. A strong score quietly saves you money for decades." },
  { id: "automate",    cat: "Foundation", title: "Pay yourself first",                  desc: "Automate a transfer to savings/investing the day you get paid, before you can spend it." },
  { id: "compound",    cat: "Growth",     title: "Start investing early",               desc: "Compound growth rewards time in the market more than timing it. Starting at 22 vs 32 can roughly double the outcome." },
  { id: "match",       cat: "Growth",     title: "Take any employer match",             desc: "If a job offers a retirement match, that's an instant guaranteed return — leaving it unclaimed is leaving pay on the table." },
  { id: "diversify",   cat: "Growth",     title: "Diversify, don't gamble",             desc: "Broad, low-fee index funds spread risk. Concentrated bets on single stocks or coins can wipe out years of saving fast." },
  { id: "skills",      cat: "Income",     title: "Invest in a sellable skill",          desc: "Your income potential is the biggest lever you have early on — a skill upgrade often outperforms any investment return." },
  { id: "negotiate",   cat: "Income",     title: "Negotiate, don't just accept",        desc: "Asking for more — a raise, a rate, a price — costs nothing and is where a lot of people leave money unclaimed." },
  { id: "lifestyle",   cat: "Protection", title: "Watch lifestyle inflation",           desc: "When income rises, let savings rise with it — not just spending. This is the single biggest wealth killer at every income level." },
  { id: "scams",       cat: "Protection", title: "Be skeptical of 'guaranteed' returns", desc: "Anything promising fast, certain, outsized returns is the biggest red flag in finance. If it sounds too good, it usually is." },
];

// Money — side income / project ideas, low to moderate barrier to entry
export const SIDE_HUSTLE_IDEAS = [
  { id: "freelance", title: "Freelance a skill you have",       level: "Beginner",     desc: "Writing, design, code, editing, video — sell what you already know on a freelance platform or direct outreach." },
  { id: "tutoring",  title: "Tutor or coach",                   level: "Beginner",     desc: "Academic subjects, a language, or a sport you're solid at. Low startup cost, direct pay." },
  { id: "reselling", title: "Flip or resell",                   level: "Beginner",     desc: "Thrift, clearance, or bulk finds resold online. Teaches margins and negotiation fast." },
  { id: "content",   title: "Build one piece of content weekly", level: "Intermediate", desc: "A niche you actually know — consistency compounds into an audience, then income, over months." },
  { id: "service",   title: "Local service hustle",             level: "Beginner",     desc: "Lawn care, moving help, pressure washing, cleaning — low barrier, fast cash, easy to test." },
  { id: "digital",   title: "Build a small digital product",    level: "Intermediate", desc: "A template, guide, or tool solving one specific problem. Sell it once, earn from it repeatedly." },
  { id: "trade",     title: "Learn a trade skill",              level: "Long-term",    desc: "Electrical, plumbing, HVAC — real demand, real pay, and far less competition than most online hustles." },
  { id: "network",   title: "Build in public",                  level: "Intermediate", desc: "Share what you're learning or building — network and opportunities tend to follow visible effort." },
];

// Cash-flow tracking: 50/30/20-style budget categories
export const BUDGET_CATS = [
  { id: "needs",   label: "Needs",   color: C.teal,   hint: "Rent, bills, groceries, transport" },
  { id: "wants",   label: "Wants",   color: C.orange, hint: "Eating out, hobbies, subscriptions" },
  { id: "savings", label: "Savings", color: C.green,  hint: "Saved, invested, or debt paydown" },
];

// Fine-grained categories for the ledger. Each expense category rolls up into one of the
// three budget buckets above, so the 50/30/20 maths keeps working while records stay specific.
export const TX_CATEGORIES = [
  { id: "groceries",     label: "Groceries",     type: "expense", bucket: "needs",   color: C.teal },
  { id: "rent",          label: "Rent / housing", type: "expense", bucket: "needs",   color: C.teal },
  { id: "utilities",     label: "Utilities",     type: "expense", bucket: "needs",   color: C.teal },
  { id: "transport",     label: "Transport",     type: "expense", bucket: "needs",   color: C.teal },
  { id: "health",        label: "Health",        type: "expense", bucket: "needs",   color: C.teal },
  { id: "insurance",     label: "Insurance",     type: "expense", bucket: "needs",   color: C.teal },
  { id: "dining",        label: "Eating out",    type: "expense", bucket: "wants",   color: C.orange },
  { id: "shopping",      label: "Shopping",      type: "expense", bucket: "wants",   color: C.orange },
  { id: "entertainment", label: "Entertainment", type: "expense", bucket: "wants",   color: C.orange },
  { id: "travel",        label: "Travel",        type: "expense", bucket: "wants",   color: C.orange },
  { id: "subscriptions", label: "Subscriptions", type: "expense", bucket: "wants",   color: C.orange },
  { id: "saving",        label: "Saving",        type: "expense", bucket: "savings", color: C.green },
  { id: "investing",     label: "Investing",     type: "expense", bucket: "savings", color: C.green },
  { id: "debt",          label: "Debt paydown",  type: "expense", bucket: "savings", color: C.green },
  { id: "other_expense", label: "Other",         type: "expense", bucket: "wants",   color: C.muted },
  { id: "salary",        label: "Salary",        type: "income",  bucket: null,      color: C.gold },
  { id: "freelance",     label: "Freelance",     type: "income",  bucket: null,      color: C.gold },
  { id: "bonus",         label: "Bonus",         type: "income",  bucket: null,      color: C.gold },
  { id: "refund",        label: "Refund",        type: "income",  bucket: null,      color: C.gold },
  { id: "gift",          label: "Gift",          type: "income",  bucket: null,      color: C.gold },
  { id: "other_income",  label: "Other",         type: "income",  bucket: null,      color: C.gold },
];
export const TX_CAT_BY_ID = Object.fromEntries(TX_CATEGORIES.map((c) => [c.id, c]));

export const RECUR_FREQ = [
  { id: "monthly", label: "Monthly" },
  { id: "weekly", label: "Weekly" },
];

// Starter habits: each arrives with a schedule, a pillar and — crucially — a two-minute
// version already written, since that's the part people skip and then wonder why it didn't stick.
export const HABIT_TEMPLATES = [
  { text: "Drink a glass of water", preset: "daily", pillarId: "health", twoMin: "Fill the glass and drink it", time: "08:00" },
  { text: "10-minute walk", preset: "daily", pillarId: "health", twoMin: "Put your shoes on and step outside", timerMinutes: 10 },
  { text: "Read 10 pages", preset: "daily", pillarId: "growth", twoMin: "Read one page" },
  { text: "Morning prayer", preset: "daily", pillarId: "spiritual", twoMin: "One minute of stillness", time: "07:00" },
  { text: "Gym", preset: "thrice", pillarId: "health", twoMin: "Change into your gym clothes", timerMinutes: 45 },
  { text: "Journal", preset: "daily", pillarId: "growth", twoMin: "Write one sentence", time: "21:00" },
  { text: "Stretch", preset: "daily", pillarId: "health", twoMin: "One stretch, thirty seconds", timerMinutes: 5 },
  { text: "Review spending", preset: "weekly", pillarId: "financial", twoMin: "Open the ledger and look" },
  { text: "Call someone you love", preset: "weekly", pillarId: "relationships", twoMin: "Send one message" },
  { text: "Tidy for five minutes", preset: "daily", pillarId: "personality", twoMin: "Clear one surface", timerMinutes: 5 },
  { text: "Do one kind thing", preset: "daily", pillarId: "deeds", twoMin: "Send one kind message" },
  { text: "Lights out by 11", preset: "daily", pillarId: "health", twoMin: "Put the phone on the charger" },
];

export const BREAK_TEMPLATES = [
  { text: "Doomscrolling", preset: "daily", trigger: "Boredom or waiting" },
  { text: "Late-night snacking", preset: "daily", trigger: "Watching TV" },
  { text: "Phone in bed", preset: "daily", trigger: "Charging it beside the bed" },
  { text: "Energy drinks", preset: "daily", trigger: "The afternoon slump" },
  { text: "Skipping breakfast", preset: "weekdays", trigger: "Running late" },
  { text: "Impulse buying", preset: "daily", trigger: "Adverts and sales emails" },
];

export const DAY_PRESETS = [
  { id: "daily", label: "Every day", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
  { id: "weekdays", label: "Weekdays", days: ["mon", "tue", "wed", "thu", "fri"] },
  { id: "weekends", label: "Weekends", days: ["sat", "sun"] },
  { id: "thrice", label: "3× a week", days: ["mon", "wed", "fri"] },
  { id: "weekly", label: "Once a week", days: ["sun"] },
];

export const JOURNAL_MOODS = [
  { id: "grateful",  label: "Grateful",  emoji: "🙏" },
  { id: "proud",     label: "Proud",     emoji: "💪" },
  { id: "calm",      label: "Calm",      emoji: "🌊" },
  { id: "anxious",   label: "Anxious",   emoji: "😣" },
  { id: "frustrated",label: "Frustrated",emoji: "😤" },
  { id: "tired",     label: "Tired",     emoji: "🥱" },
];
