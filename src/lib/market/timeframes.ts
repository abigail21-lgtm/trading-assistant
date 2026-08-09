export interface Timeframe {
  key: string;
  label: string;
  range: string;
  interval: string;
  intraday: boolean;
}

// Candle-size presets, short-to-long, mirroring the standard TradingView-style
// resolution picker (1/5/15/30/60/D/W/M). Range values are chosen to stay
// within Yahoo's (undocumented but empirically verified) per-interval history
// limits: 1m ~7d, 2m/5m/15m/30m/90m ~60d, 60m ~2y, daily+ unlimited.
export const TIMEFRAMES: Timeframe[] = [
  { key: "1m", label: "1m", range: "1d", interval: "1m", intraday: true },
  { key: "5m", label: "5m", range: "5d", interval: "5m", intraday: true },
  { key: "15m", label: "15m", range: "1mo", interval: "15m", intraday: true },
  { key: "30m", label: "30m", range: "1mo", interval: "30m", intraday: true },
  { key: "1h", label: "1h", range: "6mo", interval: "60m", intraday: true },
  { key: "1d", label: "D", range: "1y", interval: "1d", intraday: false },
  { key: "1wk", label: "W", range: "5y", interval: "1wk", intraday: false },
  { key: "1mo", label: "M", range: "max", interval: "1mo", intraday: false },
];

export const DEFAULT_TIMEFRAME_KEY = "1d";

export function getTimeframe(key: string | undefined): Timeframe {
  return TIMEFRAMES.find((tf) => tf.key === key) ?? TIMEFRAMES.find((tf) => tf.key === DEFAULT_TIMEFRAME_KEY)!;
}

const RANGE_LABELS: Record<string, string> = {
  "1d": "1 day",
  "5d": "5 days",
  "1mo": "1 month",
  "3mo": "3 months",
  "6mo": "6 months",
  "1y": "1 year",
  "5y": "5 years",
  max: "max history",
};

/** Human label for how far back a timeframe's chart looks — distinct from
 * `label`, which names the candle size (e.g. "D"), not the lookback range. */
export function rangeLabel(range: string): string {
  return RANGE_LABELS[range] ?? range;
}
