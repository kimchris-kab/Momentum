import {
  Sparkles, Coins, Sprout, Heart, HandHeart, HeartPulse, Users,
  Gamepad2, Zap, HelpCircle, AlertCircle, Anchor, Circle,
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
// Goals carried over from an older save can have no pillar at all. Rendering them against
// this is better than the undefined lookup, which used to take the whole screen down.
export const NO_PILLAR = { id: null, name: "No pillar", color: C.muted, Icon: Circle, prompt: "" };

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

// Original mantras — one surfaces per day, keyed off the date, and the refresh button
// re-rolls it. A deep deck matters: at one a day a short list starts repeating inside a
// month, and a line you've already dismissed twice stops landing. Grouped by what a day
// tends to need so the deck stays varied rather than twenty takes on discipline.
export const MANTRAS = [
  // — Starting, and starting again
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

  // — Starting, and starting again
  "The first five minutes are the whole negotiation. Win those.",
  "You can begin badly. You cannot begin later than now.",
  "Motivation follows motion, not the other way around.",
  "Lower the bar until you can step over it, then step over it.",
  "A messy start beats a perfect plan you never open.",
  "Begin with the smallest honest version of the thing.",
  "You've restarted before and it counted. It counts again.",
  "Day one is not wasted just because there were other day ones.",
  "The hardest rep is the one that gets you off the chair.",
  "Open the file. That's the whole task for now.",

  // — Consistency and identity
  "You are not behind. You are mid-build.",
  "Who you are is just what you did often enough to stop noticing.",
  "Skip once and it's a day. Skip twice and it's a direction.",
  "Be the kind of person who finishes small things.",
  "Identity is the argument your calendar makes on your behalf.",
  "Boring repetition is what mastery looks like from the inside.",
  "You don't need more willpower. You need fewer decisions.",
  "Make the good choice the easy one and you'll stop having to be brave.",
  "The habit is the point. The result is the side effect.",
  "Show up on the ordinary days — those are the ones that add up.",
  "Nobody sees the streak. You'll feel it anyway.",
  "Half-effort done today beats full effort scheduled forever.",
  "Do it again. That's the secret, and it's a dull one.",
  "Let today be unremarkable and honest.",

  // — Focus and attention
  "Your attention is the only currency you can't earn back.",
  "One thing, finished, changes more than five things, started.",
  "Close the tabs. Close the loops. Then decide.",
  "Busy is not the same as moving.",
  "Protect the hour that actually matters. Let the rest be noisy.",
  "Ask what makes everything else easier — then do that first.",
  "If it isn't today's priority, it's tomorrow's permission slip.",
  "Depth is a decision you make before you sit down.",
  "You can do anything, but not everything, and not all at once.",
  "Guard the first hour and the day tends to follow.",
  "Say no on purpose so your yes means something.",
  "Single-tasking is the rarest advantage left.",

  // — Discipline and desire
  "Feelings are information, not instructions.",
  "You don't have to want to. You just have to start.",
  "Comfort is expensive; it charges you later.",
  "The urge will pass whether or not you obey it.",
  "Choose the discomfort that builds over the one that erodes.",
  "Future you is a real person. Act like you'll meet them.",
  "Decide once, ahead of time, and stop renegotiating at midnight.",
  "Hard now, or hard later — pick which hard you'd rather carry.",
  "The craving is loud but it isn't in charge.",
  "You can feel resistance and move anyway. Both at once is allowed.",

  // — Setbacks, repair and self-compassion
  "Never miss twice. That's the whole recovery plan.",
  "A slip is data, not a verdict.",
  "Repair beats regret. Start the repair.",
  "You are allowed to have a bad day without becoming a bad story.",
  "Shame is a poor coach. Fire it and try curiosity.",
  "Get back on the same day if you can, the next day if you can't.",
  "The chain isn't broken; it's just got a gap you can close.",
  "Being gentle with yourself is not the same as letting yourself off.",
  "You've survived every worst day so far. The record is perfect.",
  "Judge the week, not the hour.",
  "Falling short of the plan is not falling out of the plan.",
  "Forgive the miss, keep the direction.",

  // — Rest, energy and the body
  "Rest is maintenance, not reward.",
  "Tired decisions are expensive. Sleep first, decide second.",
  "Your body keeps the schedule your mind keeps ignoring.",
  "Move a little. It fixes more moods than thinking does.",
  "Eat, drink water, step outside — then reassess the crisis.",
  "A rested hour outperforms three exhausted ones.",
  "Stopping on time is a skill worth practising.",
  "Recovery is where the work actually becomes strength.",
  "Slow is fine. Stopped and starting again is also fine.",
  "Burnout isn't proof you cared. It's proof the pace was wrong.",
  "Put the phone down before the day puts you down.",

  // — Patience and the long game
  "Growth is quiet long before it's obvious.",
  "Trust the interval between effort and evidence.",
  "Most overnight changes took a few unremarkable years.",
  "You're planting. It's supposed to look like nothing for a while.",
  "Compare yourself to last month, not to someone's highlight reel.",
  "Small and permanent beats big and temporary.",
  "The slow way is usually the only way that holds.",
  "Give it one more month before you call it a failure.",
  "Consistency has a long fuse and a large blast radius.",
  "Roots first. The visible part comes later.",

  // — Clarity and planning
  "A vague goal is just a wish with better posture.",
  "Write it down and it stops living rent-free in your head.",
  "Plan the week so the days don't have to be heroic.",
  "If it isn't scheduled, you've only agreed to want it.",
  "Name the next physical action. That's what unsticks things.",
  "Review honestly — the point isn't to feel good, it's to steer.",
  "Half of overwhelm is just unsorted.",
  "Fewer commitments, kept. That's the upgrade.",
  "Ask what you'd cut if the week were half as long, then cut it now.",
  "Make the plan simple enough to survive a bad mood.",

  // — Courage and change
  "Do the thing you're avoiding first; it's costing you all day.",
  "Discomfort is the entry fee for anything new.",
  "You'll never feel ready. Ready is a story you tell afterwards.",
  "The conversation you're dreading is shorter than the dread.",
  "Ask. The worst outcome is the situation you're already in.",
  "Let yourself be a beginner. It's the price of becoming good.",
  "Fear shrinks when you take one concrete step toward it.",
  "Bet on the version of you that keeps showing up.",
  "Change feels like loss before it feels like growth.",
  "If it scares you and it's yours to do, that's usually the sign.",

  // — Work and craft
  "Finished and imperfect beats perfect and imagined.",
  "Standards are for the edit, not the first draft.",
  "Do the unglamorous part well — that's where the edge is.",
  "Quality is just care, applied repeatedly.",
  "Ship it, learn from it, improve it. In that order.",
  "The work will teach you things thinking about it never will.",
  "Effort you can sustain beats intensity you can't.",
  "Study one thing deeply enough to become useful with it.",
  "Skill compounds faster than luck does.",

  // — Money and stewardship
  "Spend on purpose and the rest stops feeling like guilt.",
  "Every small saving is a future option you're buying.",
  "Wealth is quiet; the loud part is usually debt.",
  "Pay yourself first, then live on what's honestly left.",
  "A budget is permission, not punishment.",
  "The cheapest version of a want is usually waiting a week.",
  "Earning more matters less than keeping some of it.",
  "Track it and it stops running you.",

  // — People and connection
  "Send the message. The thought alone reaches no one.",
  "Be easy to be honest with.",
  "Attention is the most generous thing you own.",
  "People remember how reliably you showed up, not how impressively.",
  "Ask one real question today and actually wait for the answer.",
  "Repair small ruptures early; they cost almost nothing now.",
  "You can be kind and still say no.",
  "Let someone help you. That's part of the relationship too.",
  "The people who matter are a practice, not a given.",
  "Say the good thing out loud while it's still true.",

  // — Mind, gratitude and perspective
  "Not every thought deserves a hearing.",
  "Name what you're feeling and it loosens its grip.",
  "You can hold a hard truth and a kind tone at the same time.",
  "Count what's already working before you audit what isn't.",
  "Today will be a memory. Make one worth keeping.",
  "Most of what you worried about last month never arrived.",
  "Enough is a decision, not an amount.",
  "Zoom out. Very little is as permanent as it feels at 11pm.",
  "Notice one ordinary good thing. That's the whole exercise.",
  "Peace is often just the absence of an argument you chose not to have.",
  "Curiosity ages better than certainty.",
  "You don't have to earn your own patience.",

  // — Ending the day
  "Close the day deliberately, not just eventually.",
  "Ask what went well before you ask what went wrong.",
  "Tomorrow starts tonight — decide the first thing now.",
  "Put the day down. It's finished with you.",
  "You did more than you'll remember. Write one line of it down.",
  "An honest review is worth more than a flattering one.",
  "Leave one easy win set up for the morning.",
  "Let good enough be good enough, today.",
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

// The first three pin specific weekdays. The last three set a weekly quota instead — the
// week is the unit and which days you use is yours. "3× a week" used to be stored as
// Mon/Wed/Fri, which reported a kept habit as four missed days every week.
export const DAY_PRESETS = [
  { id: "daily", label: "Every day", days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] },
  { id: "weekdays", label: "Weekdays", days: ["mon", "tue", "wed", "thu", "fri"] },
  { id: "weekends", label: "Weekends", days: ["sat", "sun"] },
  { id: "thrice", label: "3× a week", days: [], times: 3 },
  { id: "twice", label: "2× a week", days: [], times: 2 },
  { id: "weekly", label: "Once a week", days: [], times: 1 },
];

// Prompts for the days the blank box wins. Deliberately concrete and a little pointed —
// "how was your day" produces nothing worth re-reading.
export const JOURNAL_PROMPTS = [
  "What's one thing you handled better today than you would have a year ago?",
  "What drained you today, and was it worth it?",
  "Who deserves your thanks that you haven't told?",
  "What are you avoiding, and what's the smallest version of facing it?",
  "What went right today that you'd otherwise forget by tomorrow?",
  "Where did you act like the person you're trying to become?",
  "What would you tell a friend in exactly your situation?",
  "What's taking up space in your head that you can't control?",
  "What did today teach you about how you actually work?",
  "If today repeated, what one thing would you change?",
  "What are you pretending not to know?",
  "Where did you show patience you didn't feel?",
  "What's the honest reason you didn't do the thing you planned?",
  "What's worth protecting about how you spent today?",
  "What would make tomorrow feel like a win by ten in the morning?",
  "What did you give today that cost you something?",
  "Which part of today would you happily live again?",
  "What's a belief about yourself that's overdue for retirement?",
  "What are you quietly proud of right now?",
  "What did you say yes to that you should have declined?",
  "Where is your energy going that nobody is asking for?",
  "What's one thing you know now that you'd have found useful a month ago?",
];

export const JOURNAL_MOODS = [
  { id: "grateful",  label: "Grateful",  emoji: "🙏" },
  { id: "proud",     label: "Proud",     emoji: "💪" },
  { id: "calm",      label: "Calm",      emoji: "🌊" },
  { id: "anxious",   label: "Anxious",   emoji: "😣" },
  { id: "frustrated",label: "Frustrated",emoji: "😤" },
  { id: "tired",     label: "Tired",     emoji: "🥱" },
];
