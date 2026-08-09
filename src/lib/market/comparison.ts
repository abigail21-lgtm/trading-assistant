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
