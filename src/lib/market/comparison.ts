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

/** Plain-language read on whether the stock is leading or lagging its
 * benchmarks over the currently selected period. */
export function compareInsights(
  stock: PeriodReturn,
  market: PeriodReturn,
  sector: PeriodReturn | null,
): string[] {
  const lines: string[] = [];

  if (stock.returnPercent != null && market.returnPercent != null) {
    const diff = stock.returnPercent - market.returnPercent;
    const verb = diff >= 0 ? "outperforming" : "underperforming";
    lines.push(
      `${stock.symbol} is ${verb} the market (${market.name}) by ${Math.abs(diff).toFixed(1)} points over this period.`,
    );
  }

  if (sector && stock.returnPercent != null && sector.returnPercent != null) {
    const diff = stock.returnPercent - sector.returnPercent;
    const verb = diff >= 0 ? "outperforming" : "underperforming";
    lines.push(
      `${stock.symbol} is ${verb} its sector (${sector.name}) by ${Math.abs(diff).toFixed(1)} points.`,
    );
  }

  return lines;
}
