import {
  Award, Briefcase, Bus, Clapperboard, CreditCard, Gift, HeartPulse, Home, Laptop,
  MoreHorizontal, PiggyBank, Plane, RefreshCw, ShieldCheck, ShoppingBag, ShoppingCart,
  TrendingUp, Undo2, UtensilsCrossed, Zap,
} from "lucide-react";

// Kept out of constants.js so the category data stays plain serialisable values.
// A glyph is read far faster than a word at thumb speed, which is the whole point of
// the category grid in the entry sheet.
const TX_ICONS = {
  groceries: ShoppingCart,
  rent: Home,
  utilities: Zap,
  transport: Bus,
  health: HeartPulse,
  insurance: ShieldCheck,
  dining: UtensilsCrossed,
  shopping: ShoppingBag,
  entertainment: Clapperboard,
  travel: Plane,
  subscriptions: RefreshCw,
  saving: PiggyBank,
  investing: TrendingUp,
  debt: CreditCard,
  other_expense: MoreHorizontal,
  salary: Briefcase,
  freelance: Laptop,
  bonus: Award,
  refund: Undo2,
  gift: Gift,
  other_income: MoreHorizontal,
};

export const txIcon = (catId) => TX_ICONS[catId] || MoreHorizontal;
