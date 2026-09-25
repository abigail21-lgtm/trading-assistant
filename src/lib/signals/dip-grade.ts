import type { DipEvaluation } from "./dip";
import type { StrikeRow } from "./calls";

// GO / CAUTION / PASS for a dip, with the plain-English reasons shown on the
// Signals tab and the Setup screen. Only things that tested as mattering
// affect the grade: the uptrend, earnings landing inside the hold, and
// whether a reasonable call exists. The overall market is shown for
// information only -- filtering on it didn't change results in testing.

export type DipGrade = "go" | "caution" | "pass";
export type CheckStatus = "pass" | "warn" | "fail" | "info";

export interface DipCheck {
  status: CheckStatus;
  title: string;
  detail: string;
}

export type EarningsRule = "warn" | "block" | "ignore";

export interface DipRules {
  earnings: EarningsRule;
}

export const DEFAULT_DIP_RULES: DipRules = { earnings: "warn" };

export interface EarningsInfo {
  daysAway: number;
  /** "Nov 4" style label. */
  label: string;
  /** Yahoo's estimate rather than a confirmed date. */
  estimated: boolean;
}

export interface DipGradeInput {
  symbol: string;
  evaluation: DipEvaluation;
  earnings: EarningsInfo | null;
  /** Selected expiry, when grading for a specific contract. */
  daysToExpiry?: number | null;
  /** Suggested strike at that expiry; null = none fits; undefined = options not checked. */
  pick?: StrikeRow | null;
  marketUp?: boolean | null;
  rules?: DipRules;
  /** How to refer to the session the plan applies to: "today" while the market is open, else e.g. "Mon". */
  session?: string;
}

export interface DipGradeResult {
  /** Null when there's no dip to grade. */
  grade: DipGrade | null;
  headline: string;
  reason: string;
  checks: DipCheck[];
}

/** A buy-zone price further than this below the current price isn't worth mentioning. */
const NEAR_ZONE_PCT = 5;

/** Calendar days a trade can last: up to 5 trading days, plus a weekend. */
const HOLD_CALENDAR_DAYS = 7;

const money = (x: number) => `$${x.toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function dipSentence(symbol: string, e: DipEvaluation): string {
  const drop = Math.abs(e.dropPct).toFixed(1);
  const streak = e.downDays > 1 ? `in ${e.downDays} days` : "in one day";
  return `${symbol} fell ${drop}% ${streak}, but it's still above its 200-day average, so the long-term trend is up.`;
}

function earningsCheck(input: DipGradeInput, rules: DipRules): DipCheck {
  const { earnings, daysToExpiry } = input;
  if (rules.earnings === "ignore") {
    return { status: "info", title: "Earnings check is off.", detail: "Turned off in your rules." };
  }
  if (!earnings) {
    return {
      status: "info",
      title: "No earnings date found.",
      detail: "Nothing on the calendar for the next few weeks. Double-check before buying.",
    };
  }
  const est = earnings.estimated ? " (estimated)" : "";
  if (earnings.daysAway <= HOLD_CALENDAR_DAYS) {
    return {
      status: rules.earnings === "block" ? "fail" : "warn",
      title: `Earnings in ${plural(earnings.daysAway, "day")}${est}.`,
      detail:
        "That's inside the few days you'd hold this. Earnings can move the stock sharply either way, and call prices usually drop right after the announcement. Use caution.",
    };
  }
  if (daysToExpiry != null && earnings.daysAway < daysToExpiry) {
    return {
      status: "pass",
      title: `Earnings ${earnings.label}${est}.`,
      detail: "That's before this contract expires, but well after you'd normally sell. If the trade drags on, sell before then.",
    };
  }
  return {
    status: "pass",
    title: "No earnings surprise.",
    detail: `Earnings are ${earnings.label}${est}, after you'd be out${daysToExpiry != null ? " and after this contract expires" : ""}.`,
  };
}

export function gradeDip(input: DipGradeInput): DipGradeResult {
  const { symbol, evaluation: e } = input;
  const rules = input.rules ?? DEFAULT_DIP_RULES;
  const session = input.session ?? "today";
  const dipNow = e.rsi2 != null && e.rsi2 < e.params.rsiMax;

  if (e.status === "none") {
    if (dipNow && !e.aboveTrend) {
      return {
        grade: "pass",
        headline: "Dip in a downtrend",
        reason: `${symbol} fell hard, but it's below its 200-day average, so the long-term trend is down. Dips in downtrends didn't bounce reliably in testing.`,
        checks: [],
      };
    }
    // Only worth mentioning the trigger price when a normal day could reach it.
    const zone = e.buyZone && e.buyZone.ceiling >= e.price * (1 - NEAR_ZONE_PCT / 100) ? e.buyZone : null;
    return {
      grade: null,
      headline: "No dip right now",
      reason: !e.aboveTrend
        ? `${symbol} is below its 200-day average, so dips don't count until the long-term trend turns up.`
        : zone
          ? `Close to one: a close at or below ${money(zone.ceiling)} would count as a dip.`
          : `The long-term trend is up. Waiting for a sharp 1–3 day drop.`,
      checks: [],
    };
  }

  const checks: DipCheck[] = [
    {
      status: "pass",
      title: "Long-term trend is up.",
      detail: `Price ${money(e.price)} is above the 200-day average (${money(e.avg200 ?? NaN)}).`,
    },
    {
      status: "pass",
      title: "A real dip.",
      detail: `The 2-day RSI is ${(e.rsi2 ?? 0).toFixed(0)} (under ${e.params.rsiMax} is what tested best${
        e.params.rsiMax === 5 ? " for stocks" : " for index funds"
      }). It measures how hard the last two days fell.`,
    },
    earningsCheck(input, rules),
  ];
  if (input.pick !== undefined) {
    checks.push(
      input.pick
        ? { status: "pass", title: "Options are easy to trade.", detail: "Small gap between buy and sell prices on the suggested call." }
        : {
            status: "warn",
            title: "No call fits well at this expiry.",
            detail: "Strikes are thinly traded or have wide gaps between buy and sell prices. Try another expiry.",
          },
    );
  }
  if (input.marketUp != null) {
    checks.push({
      status: "info",
      title: input.marketUp ? "FYI: the S&P 500 is in an uptrend." : "FYI: the S&P 500 is below its 200-day average.",
      detail: "It didn't change results in testing, so it doesn't affect the grade.",
    });
  }

  const grade: DipGrade = checks.some((c) => c.status === "fail")
    ? "pass"
    : checks.some((c) => c.status === "warn")
      ? "caution"
      : "go";

  const earningsWarn = checks[2].status === "warn" || checks[2].status === "fail";
  let headline: string;
  let reason: string;
  switch (e.status) {
    case "in-buy-zone":
      headline = "In today's buy zone";
      reason = `${symbol} is at or below ${money(e.buyZone!.ceiling)}. If it closes there, it's a dip in an uptrend. Buy near the close (3:30–3:55pm).`;
      break;
    case "holding":
      headline = "Trade in progress";
      reason =
        e.holdDay === e.params.maxHoldBars
          ? `Last day of the plan: sell at ${session === "today" ? "today's" : `${session}'s`} close, whatever the price.`
          : `Sell if ${symbol} closes above ${money(e.sellPrice!)} ${session === "today" ? "today" : `on ${session}`}.`;
      break;
    case "sell-today":
      headline = "Time to sell";
      reason =
        e.trade?.exitReason === "day-limit"
          ? `Five trading days are up. The plan says sell.`
          : `${symbol} closed above its sell price. The plan says sell.`;
      break;
    default:
      headline = "Dip in an uptrend";
      reason = dipSentence(symbol, e);
  }
  if (earningsWarn && (e.status === "signal" || e.status === "in-buy-zone")) {
    reason = `A good dip, but earnings are in ${plural(input.earnings!.daysAway, "day")}. Earnings can move the stock sharply either way, and call prices usually drop right after the announcement. Use caution.`;
  }
  return { grade, headline, reason, checks };
}
