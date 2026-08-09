import type { Candle } from "./yahoo";
import { sma } from "./indicators";

export interface SupportResistanceLevel {
  price: number;
  type: "support" | "resistance";
  touches: number;
}

export type Trend = "uptrend" | "downtrend" | "range";

export interface PriceAnalysis {
  trend: Trend;
  trendSummary: string;
  levels: SupportResistanceLevel[];
  signal: string | null;
  hasEnoughHistory: boolean;
}

/** A bar is a pivot low/high if it's the extreme point within `lookback` bars on each side. */
function findPivots(candles: Candle[], lookback: number): { price: number; type: "low" | "high" }[] {
  const pivots: { price: number; type: "low" | "high" }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const window = candles.slice(i - lookback, i + lookback + 1);
    const low = candles[i].low;
    const high = candles[i].high;
    if (window.every((c) => c.low >= low)) pivots.push({ price: low, type: "low" });
    if (window.every((c) => c.high <= high)) pivots.push({ price: high, type: "high" });
  }
  return pivots;
}

/** Merges nearby pivots (within tolerancePercent of each other) into single levels. */
function clusterPivots(
  pivots: { price: number; type: "low" | "high" }[],
  tolerancePercent: number,
): SupportResistanceLevel[] {
  const levels: SupportResistanceLevel[] = [];

  for (const pivotType of ["low", "high"] as const) {
    const sorted = pivots.filter((p) => p.type === pivotType).map((p) => p.price).sort((a, b) => a - b);
    let cluster: number[] = [];

    const flush = () => {
      if (cluster.length === 0) return;
      const avg = cluster.reduce((s, v) => s + v, 0) / cluster.length;
      levels.push({
        price: avg,
        type: pivotType === "low" ? "support" : "resistance",
        touches: cluster.length,
      });
      cluster = [];
    };

    for (const price of sorted) {
      if (cluster.length === 0) {
        cluster.push(price);
        continue;
      }
      const clusterAvg = cluster.reduce((s, v) => s + v, 0) / cluster.length;
      if ((Math.abs(price - clusterAvg) / clusterAvg) * 100 <= tolerancePercent) {
        cluster.push(price);
      } else {
        flush();
        cluster.push(price);
      }
    }
    flush();
  }

  return levels;
}

function classifyTrend(closes: number[]): { trend: Trend; summary: string } {
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);
  const price = closes.at(-1)!;
  const curMa20 = ma20.at(-1);
  const curMa50 = ma50.at(-1);

  if (curMa20 == null || curMa50 == null) {
    return { trend: "range", summary: "Not enough price history yet for a trend read." };
  }

  const slopeLookback = Math.min(10, ma50.filter((v) => v != null).length - 1);
  const pastMa50 = slopeLookback > 0 ? ma50.at(-1 - slopeLookback) : null;
  const ma50Rising = pastMa50 != null && curMa50 > pastMa50;
  const ma50Falling = pastMa50 != null && curMa50 < pastMa50;

  if (price > curMa20 && curMa20 > curMa50 && ma50Rising) {
    return {
      trend: "uptrend",
      summary: "Trading above its 20- and 50-period moving averages, both trending up.",
    };
  }
  if (price < curMa20 && curMa20 < curMa50 && ma50Falling) {
    return {
      trend: "downtrend",
      summary: "Trading below its 20- and 50-period moving averages, both trending down.",
    };
  }
  return {
    trend: "range",
    summary: "No clear trend — price is chopping around its short-term moving averages.",
  };
}

function detectSignal(candles: Candle[], levels: SupportResistanceLevel[]): string | null {
  const price = candles.at(-1)!.close;
  const recentBars = candles.slice(-5);

  const supportsBelow = levels
    .filter((l) => l.type === "support" && l.price < price && l.touches >= 2)
    .sort((a, b) => b.price - a.price);

  for (const level of supportsBelow) {
    const touchedRecently = recentBars.some((c) => (Math.abs(c.low - level.price) / level.price) * 100 <= 1.5);
    if (touchedRecently && price > level.price * 1.008) {
      return `Bounced off support near $${level.price.toFixed(2)} and is moving higher — a bullish signal worth watching.`;
    }
  }

  const resistancesAbove = levels
    .filter((l) => l.type === "resistance" && l.price > price)
    .sort((a, b) => a.price - b.price);
  const nearestResistance = resistancesAbove[0];
  if (nearestResistance && ((nearestResistance.price - price) / price) * 100 <= 2) {
    return `Testing resistance near $${nearestResistance.price.toFixed(2)} — a break above could signal further upside.`;
  }

  const resistancesBelow = levels
    .filter((l) => l.type === "resistance" && l.price < price && l.touches >= 2)
    .sort((a, b) => b.price - a.price);
  for (const level of resistancesBelow) {
    const touchedRecently = recentBars.some((c) => (Math.abs(c.high - level.price) / level.price) * 100 <= 1.5);
    if (touchedRecently && price < level.price * 0.992) {
      return `Rejected at resistance near $${level.price.toFixed(2)} and is pulling back — worth watching for further downside.`;
    }
  }

  return null;
}

/**
 * Every clustered support/resistance level across the full history, not
 * filtered down to the handful nearest the current price. Alert evaluation
 * needs this unfiltered form -- `analyzePriceAction`'s `levels` only ever
 * contains resistance *above* and support *below* the current price (that's
 * what makes them useful to display), which means a level a price has just
 * broken through immediately drops out of that list -- exactly the moment a
 * "breaks resistance" alert needs to catch.
 */
export function findKeyLevels(candles: Candle[]): SupportResistanceLevel[] {
  if (candles.length < 25) return [];
  return clusterPivots(findPivots(candles, 3), 1.5);
}

export function analyzePriceAction(candles: Candle[]): PriceAnalysis {
  if (candles.length < 25) {
    return {
      trend: "range",
      trendSummary: "Not enough price history for this timeframe to analyze yet.",
      levels: [],
      signal: null,
      hasEnoughHistory: false,
    };
  }

  const closes = candles.map((c) => c.close);
  const { trend, summary } = classifyTrend(closes);

  const allLevels = findKeyLevels(candles);
  const price = closes.at(-1)!;

  // Keep only the levels nearest to the current price — most actionable.
  const levels = [
    ...allLevels.filter((l) => l.type === "support" && l.price < price).sort((a, b) => b.price - a.price).slice(0, 2),
    ...allLevels.filter((l) => l.type === "resistance" && l.price > price).sort((a, b) => a.price - b.price).slice(0, 2),
  ];

  return {
    trend,
    trendSummary: summary,
    levels,
    signal: detectSignal(candles, allLevels),
    hasEnoughHistory: true,
  };
}
