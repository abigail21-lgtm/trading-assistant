import type { Candle } from "./yahoo";

export interface ComparePoint {
  time: number; // unix seconds
  value: number; // % change from the first candle in the requested range
}

export interface CompareSeries {
  symbol: string;
  name: string;
  ok: boolean;
  points: ComparePoint[];
  returnPercent: number | null;
}

export function normalizeToPercent(candles: Candle[]): ComparePoint[] {
  if (candles.length === 0) return [];
  const first = candles[0].close;
  return candles.map((c) => ({
    time: c.time,
    value: first ? ((c.close - first) / first) * 100 : 0,
  }));
}

export const COMPARE_RANGES = [
  { key: "1mo", label: "1M", range: "1mo", interval: "1d" },
  { key: "3mo", label: "3M", range: "3mo", interval: "1d" },
  { key: "6mo", label: "6M", range: "6mo", interval: "1d" },
  { key: "1y", label: "1Y", range: "1y", interval: "1d" },
  { key: "5y", label: "5Y", range: "5y", interval: "1wk" },
] as const;

export type CompareRangeKey = (typeof COMPARE_RANGES)[number]["key"];
export const DEFAULT_COMPARE_RANGE: CompareRangeKey = "6mo";

export function isCompareRangeKey(value: string): value is CompareRangeKey {
  return COMPARE_RANGES.some((r) => r.key === value);
}

export const MAX_COMPARE_SYMBOLS = 4;

// Reuses accent colors already used elsewhere in the chart (MA lines, drawn
// trendlines) so the palette feels consistent rather than inventing a new one.
export const COMPARE_COLORS = ["#10b981", "#38bdf8", "#f59e0b", "#f472b6"];

export function compareColorFor(index: number): string {
  return COMPARE_COLORS[index % COMPARE_COLORS.length];
}
