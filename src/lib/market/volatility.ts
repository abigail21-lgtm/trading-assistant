import type { Candle } from "./yahoo";

export interface VolatilityWindow {
  days: number;
  annualizedPercent: number | null;
}

const TRADING_DAYS_PER_YEAR = 252;
const WINDOWS = [20, 60] as const;

function stdev(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Annualized historical (realized) volatility from daily log returns over
 * the trailing `days` trading days, as a percent (e.g. 42.3 for 42.3%). This
 * is what actually happened to the price — distinct from options-implied
 * volatility, which is the market's forward-looking estimate. */
function volatilityForWindow(closes: number[], days: number): number | null {
  if (closes.length < days + 1) return null;
  const windowCloses = closes.slice(-(days + 1));
  const returns: number[] = [];
  for (let i = 1; i < windowCloses.length; i++) {
    const prev = windowCloses[i - 1];
    const cur = windowCloses[i];
    if (prev > 0 && cur > 0) returns.push(Math.log(cur / prev));
  }
  if (returns.length < 2) return null;
  return stdev(returns) * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
}

/** Expects daily candles regardless of what candle size is shown on the
 * chart — annualizing from anything other than daily returns would be
 * meaningless, so callers should fetch a dedicated daily series for this. */
export function computeHistoricalVolatility(dailyCandles: Candle[]): VolatilityWindow[] {
  const closes = dailyCandles.map((c) => c.close);
  return WINDOWS.map((days) => ({ days, annualizedPercent: volatilityForWindow(closes, days) }));
}
