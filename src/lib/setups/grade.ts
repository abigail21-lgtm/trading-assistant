import type { Trend } from "../market/analysis";
import type { Setup } from "./engine";

// Turns a detected setup into GO / CAUTION / PASS with a plain-English
// reason per check. The thresholds come from the user's rules (with the
// defaults below), so the same setup can grade differently for different
// people -- the detection itself (engine.ts) never changes per user.

export type Grade = "go" | "caution" | "pass";
export type CheckStatus = "pass" | "warn" | "fail" | "off";

export interface Check {
  key: "trend" | "room" | "market" | "earnings";
  status: CheckStatus;
  title: string;
  detail: string;
}

export interface GradedSetup {
  grade: Grade;
  checks: Check[];
}

export type EarningsRule = "warn" | "block" | "ignore";

export interface TradingRules {
  minRewardRisk: number;
  earnings: EarningsRule;
  checkMarket: boolean;
}

export const DEFAULT_RULES: TradingRules = {
  minRewardRisk: 2,
  earnings: "warn",
  checkMarket: true,
};

export interface GradeContext {
  /** Trend of the overall market (SPY) at the same bar. Null = unknown. */
  marketTrend: Trend | null;
  /** Days until the next earnings report; null = unknown or none scheduled. */
  daysToEarnings: number | null;
  /** Days until the option expiry being considered. */
  daysToExpiry: number | null;
}

const pct = (n: number) => `${n.toFixed(1)}%`;

function trendCheck(setup: Setup): Check {
  if (setup.trend === "uptrend") {
    return { key: "trend", status: "pass", title: "Trend is up.", detail: "The stock has been making higher highs and higher lows." };
  }
  if (setup.trend === "downtrend") {
    return { key: "trend", status: "fail", title: "Trend is down.", detail: "The stock has been falling. Buying calls fights the trend." };
  }
  return {
    key: "trend",
    status: "warn",
    title: "No clear trend.",
    detail: "The stock has been moving sideways, so the move is less likely to follow through.",
  };
}

function roomCheck(setup: Setup, rules: TradingRules): Check {
  const ratio = setup.rewardRisk;
  const detail = `${pct(setup.upPct)} up to the target vs ${pct(setup.downPct)} down to the stop.`;
  if (ratio >= rules.minRewardRisk) return { key: "room", status: "pass", title: "Room to run.", detail };
  if (ratio >= 1) {
    return {
      key: "room",
      status: "warn",
      title: "Not much room.",
      detail: `${detail} Your rules ask for at least ${rules.minRewardRisk} to 1.`,
    };
  }
  return {
    key: "room",
    status: "fail",
    title: "Not enough room.",
    detail: `${detail} You'd risk more than you could make.`,
  };
}

function marketCheck(ctx: GradeContext, rules: TradingRules): Check {
  if (!rules.checkMarket) {
    return { key: "market", status: "off", title: "Market check is off.", detail: "Turned off in your rules." };
  }
  if (ctx.marketTrend === "uptrend") {
    return { key: "market", status: "pass", title: "Market is healthy.", detail: "The S&P 500 is in an uptrend." };
  }
  if (ctx.marketTrend === "downtrend") {
    return {
      key: "market",
      status: "warn",
      title: "Market is falling.",
      detail: "The S&P 500 is in a downtrend. Most stocks struggle to rise when the whole market is dropping.",
    };
  }
  return {
    key: "market",
    status: "warn",
    title: "Market is choppy.",
    detail: "The S&P 500 has no clear direction, so moves are less reliable.",
  };
}

function earningsCheck(ctx: GradeContext, rules: TradingRules): Check {
  if (rules.earnings === "ignore") {
    return { key: "earnings", status: "off", title: "Earnings check is off.", detail: "Turned off in your rules." };
  }
  if (ctx.daysToEarnings == null || ctx.daysToExpiry == null) {
    return { key: "earnings", status: "off", title: "Earnings date unknown.", detail: "Check the date yourself before buying." };
  }
  if (ctx.daysToEarnings > ctx.daysToExpiry) {
    return {
      key: "earnings",
      status: "pass",
      title: "No earnings surprise.",
      detail: `Earnings are in ${ctx.daysToEarnings} days, after your contract expires.`,
    };
  }
  return {
    key: "earnings",
    status: rules.earnings === "block" ? "fail" : "warn",
    title: `Earnings in ${ctx.daysToEarnings} day${ctx.daysToEarnings === 1 ? "" : "s"}.`,
    detail:
      "That's before your contract expires. Earnings can move the stock sharply either way, and call prices usually drop right after the announcement.",
  };
}

export function gradeSetup(setup: Setup, ctx: GradeContext, rules: TradingRules = DEFAULT_RULES): GradedSetup {
  const checks = [trendCheck(setup), roomCheck(setup, rules), marketCheck(ctx, rules), earningsCheck(ctx, rules)];
  const grade: Grade = checks.some((c) => c.status === "fail")
    ? "pass"
    : checks.some((c) => c.status === "warn")
      ? "caution"
      : "go";
  return { grade, checks };
}
