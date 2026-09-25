// The user's own trading rules ("My rules"). Only choices that were tested,
// or that are about the contract rather than the signal, are adjustable --
// the 200-day trend filter and the exit rule stay fixed, since the track
// record only describes those.
//
// Stored as JSON in a cookie (so server-rendered pages can read it in local
// mode) and, with accounts on, in the user_settings table (so it follows the
// account across devices and the scheduled push job can read it).

export type EarningsRule = "warn" | "block" | "ignore";
export type StrikeStyle = "deeper" | "balanced" | "closer";

export interface TrackedPosition {
  symbol: string;
  /** Unix time of the dip (signal) bar the trade came from. */
  signalTime: number;
  /** When the user marked it as bought (ms). */
  markedAt: number;
}

export interface TradingRules {
  /** "deep" = 2-day RSI under 5 (tested best on stocks); "normal" = under 10. Index funds always use 10. */
  stockDipDepth: "deep" | "normal";
  scanIndexFunds: boolean;
  scanWatchlist: boolean;
  /** Expiry range for suggested calls, in weeks. */
  minWeeks: number;
  maxWeeks: number;
  earnings: EarningsRule;
  strikeStyle: StrikeStyle;
  /** Dollars you're willing to lose on one trade in a bad case; null = not set. */
  maxLossPerTrade: number | null;
  alerts: {
    /** Near the close, when a watched symbol is in the buy zone. */
    buyZone: boolean;
    /** For trades marked as bought: price above the day's sell price, or the last day. */
    sell: boolean;
    /** After the close, when a watched symbol closed in a dip. */
    newDip: boolean;
  };
  positions: TrackedPosition[];
}

export const DEFAULT_RULES: TradingRules = {
  stockDipDepth: "deep",
  scanIndexFunds: true,
  scanWatchlist: true,
  minWeeks: 3,
  maxWeeks: 8,
  earnings: "warn",
  strikeStyle: "balanced",
  maxLossPerTrade: null,
  alerts: { buyZone: true, sell: true, newDip: false },
  positions: [],
};

export const RULES_COOKIE = "md-rules";
export const MIN_WEEKS_CHOICES = [2, 3, 4, 5, 6];
export const MAX_WEEKS_CHOICES = [4, 5, 6, 8, 10, 12];
/** Tracked positions are dropped this long after being marked; the plan lasts at most a week. */
export const POSITION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);

/** Anything missing, malformed or out of range falls back to the default. Never throws. */
export function parseRules(raw: unknown, now: number = Date.now()): TradingRules {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r: any = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_RULES;
  const minWeeks = MIN_WEEKS_CHOICES.includes(r.minWeeks) ? r.minWeeks : d.minWeeks;
  const maxWeeks = MAX_WEEKS_CHOICES.includes(r.maxWeeks) && r.maxWeeks > minWeeks ? r.maxWeeks : Math.max(d.maxWeeks, minWeeks + 2);
  const maxLoss =
    typeof r.maxLossPerTrade === "number" && Number.isFinite(r.maxLossPerTrade) && r.maxLossPerTrade > 0
      ? Math.round(Math.min(r.maxLossPerTrade, 1_000_000))
      : null;
  const a = r.alerts && typeof r.alerts === "object" ? r.alerts : {};
  const positions: TrackedPosition[] = Array.isArray(r.positions)
    ? r.positions
        .filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) =>
            p &&
            typeof p.symbol === "string" &&
            /^[A-Z0-9.^-]{1,12}$/.test(p.symbol) &&
            Number.isFinite(p.signalTime) &&
            Number.isFinite(p.markedAt) &&
            now - p.markedAt < POSITION_TTL_MS,
        )
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => ({ symbol: p.symbol, signalTime: p.signalTime, markedAt: p.markedAt }))
        .slice(-20)
    : [];
  return {
    stockDipDepth: oneOf(r.stockDipDepth, ["deep", "normal"] as const, d.stockDipDepth),
    scanIndexFunds: bool(r.scanIndexFunds, d.scanIndexFunds),
    scanWatchlist: bool(r.scanWatchlist, d.scanWatchlist),
    minWeeks,
    maxWeeks,
    earnings: oneOf(r.earnings, ["warn", "block", "ignore"] as const, d.earnings),
    strikeStyle: oneOf(r.strikeStyle, ["deeper", "balanced", "closer"] as const, d.strikeStyle),
    maxLossPerTrade: maxLoss,
    alerts: {
      buyZone: bool(a.buyZone, d.alerts.buyZone),
      sell: bool(a.sell, d.alerts.sell),
      newDip: bool(a.newDip, d.alerts.newDip),
    },
    positions,
  };
}

export function serializeRules(rules: TradingRules): string {
  return encodeURIComponent(JSON.stringify(rules));
}

export function rulesFromCookie(value: string | undefined): TradingRules {
  if (!value) return DEFAULT_RULES;
  try {
    return parseRules(JSON.parse(decodeURIComponent(value)));
  } catch {
    return DEFAULT_RULES;
  }
}

/** New York trading date of a unix time, e.g. "2026-09-25". */
export function marketDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Matched by trading date rather than exact timestamp: Yahoo can stamp
 * today's still-forming daily bar differently from the finished one.
 */
export function isTracked(rules: TradingRules, symbol: string, signalTime: number | null): boolean {
  if (signalTime == null) return false;
  const day = marketDate(signalTime);
  return rules.positions.some((p) => p.symbol === symbol && marketDate(p.signalTime) === day);
}

/** Plain-English list of what differs from the tested defaults, for "your rules" notes. */
export function describeChanges(rules: TradingRules): string[] {
  const out: string[] = [];
  if (rules.stockDipDepth === "normal") out.push("Stocks use the normal dip depth (RSI under 10), which tested weaker than deep dips.");
  if (rules.earnings === "ignore") out.push("The earnings check is off.");
  if (rules.earnings === "block") out.push("Earnings inside the hold turn a setup red.");
  return out;
}
