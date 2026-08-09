import type { Candle } from "./yahoo";

export interface PeriodReturn {
  symbol: string;
  name: string;
  returnPercent: number | null;
}

export function computePeriodReturn(candles: Candle[], symbol: string, name: string): PeriodReturn {
  if (candles.length < 2) return { symbol, name, returnPercent: null };
  const first = candles[0].close;
  const last = candles[candles.length - 1].close;
  const returnPercent = first ? ((last - first) / first) * 100 : null;
  return { symbol, name, returnPercent };
}

export interface TrendReturns {
  oneWeekReturn: number | null;
  oneMonthReturn: number | null;
  threeMonthReturn: number | null;
}

// Trading-day approximations (~5/week, ~21/month, ~63/quarter) applied to a
// single daily-candle series, so multiple lookback windows come from one
// fetch instead of a separate request per period. A fetch for "the last 3
// months" can come back with exactly as many candles as the 3-month lookback
// itself (index would land one short) -- clamp to the earliest candle when
// within a few trading days of the target rather than dropping the whole
// period, but still bail out on genuinely insufficient history (e.g. a
// recently-listed symbol) rather than silently mislabeling a short return.
function returnOverTradingDays(candles: Candle[], tradingDays: number): number | null {
  const lastClose = candles.at(-1)?.close;
  const rawIndex = candles.length - 1 - tradingDays;
  if (lastClose == null || rawIndex < -5) return null;
  const pastIndex = Math.max(0, rawIndex);
  const pastClose = candles[pastIndex].close;
  return pastClose ? ((lastClose - pastClose) / pastClose) * 100 : null;
}

export function computeTrendReturns(candles: Candle[]): TrendReturns {
  return {
    oneWeekReturn: returnOverTradingDays(candles, 5),
    oneMonthReturn: returnOverTradingDays(candles, 21),
    threeMonthReturn: returnOverTradingDays(candles, 63),
  };
}
