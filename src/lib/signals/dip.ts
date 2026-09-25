import type { Candle } from "../market/yahoo";

// "Dip in an uptrend" -- the one signal that beat random entries across
// every research run (scripts/research-strategies.ts, research-round2.ts):
//
//   Signal:  close above its 200-day average, and 2-day RSI below a threshold
//            (10 for index funds, 5 for single stocks -- deeper dips tested
//            better on stocks).
//   Buy:     near the signal day's close (tested slightly better than the
//            next open, which is the fallback).
//   Sell:    the first close above the 5-day average, or at the close of the
//            5th trading day after the signal, whichever comes first. No
//            stop-loss -- a 3% stop cut the average result by more than half.
//
// A close above the 5-day average is the same as a close above the average
// of the *previous 4* closes (c > (s4 + c)/5  <=>  4c > s4), so each day's
// sell trigger is a fixed price known before that day opens.
//
// Everything here is point-in-time: evaluating bar i reads bars <= i only.

export interface DipParams {
  rsiMax: number;
  maxHoldBars: number;
}

export const INDEX_FUNDS = ["SPY", "QQQ", "IWM", "DIA"];
export const INDEX_DIP: DipParams = { rsiMax: 10, maxHoldBars: 5 };
export const STOCK_DIP: DipParams = { rsiMax: 5, maxHoldBars: 5 };

/** Index funds always use RSI < 10; stocks use the user's depth (deep = RSI < 5, the tested default). */
export function paramsFor(symbol: string, stockDipDepth: "deep" | "normal" = "deep"): DipParams {
  if (INDEX_FUNDS.includes(symbol.toUpperCase())) return INDEX_DIP;
  return stockDipDepth === "normal" ? { ...STOCK_DIP, rsiMax: 10 } : STOCK_DIP;
}

const TREND_BARS = 200;
const RSI_PERIOD = 2;

interface Wilder {
  avgGain: (number | null)[];
  avgLoss: (number | null)[];
}

function wilder(closes: number[], period: number): Wilder {
  const avgGain: (number | null)[] = new Array(closes.length).fill(null);
  const avgLoss: (number | null)[] = new Array(closes.length).fill(null);
  let g = 0;
  let l = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const up = Math.max(d, 0);
    const down = Math.max(-d, 0);
    if (i <= period) {
      g += up / period;
      l += down / period;
      if (i === period) {
        avgGain[i] = g;
        avgLoss[i] = l;
      }
    } else {
      g = (g * (period - 1) + up) / period;
      l = (l * (period - 1) + down) / period;
      avgGain[i] = g;
      avgLoss[i] = l;
    }
  }
  return { avgGain, avgLoss };
}

const rsiFrom = (gain: number, loss: number) => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));

/** Wilder RSI; null until enough bars. */
export function rsi(closes: number[], period = RSI_PERIOD): (number | null)[] {
  const { avgGain, avgLoss } = wilder(closes, period);
  return avgGain.map((g, i) => (g == null || avgLoss[i] == null ? null : rsiFrom(g, avgLoss[i]!)));
}

/** Average of the `n` closes ending at index `end` (inclusive); null if not enough bars. */
function trailingMean(closes: number[], end: number, n: number): number | null {
  if (end - n + 1 < 0) return null;
  let s = 0;
  for (let k = end - n + 1; k <= end; k++) s += closes[k];
  return s / n;
}

/** The price bar `k` must close above to trigger the sell: mean of the 4 closes before it. */
export function sellPriceFor(closes: number[], k: number): number | null {
  return trailingMean(closes, k - 1, 4);
}

export function isSignalAt(closes: number[], rsiValues: (number | null)[], i: number, params: DipParams): boolean {
  const avg200 = trailingMean(closes, i, TREND_BARS);
  const r = rsiValues[i];
  return avg200 != null && r != null && closes[i] > avg200 && r < params.rsiMax;
}

export interface DipTrade {
  signalIndex: number;
  /** Index of the bar whose close is the exit; null while the trade is still open. */
  exitIndex: number | null;
  entry: number;
  exit: number | null;
  returnPct: number | null;
  /** Trading days from signal to exit. */
  bars: number | null;
  exitReason: "sell-price" | "day-limit" | null;
}

/**
 * Every signal in the history and what happened after it, entering at the
 * signal day's close. A new signal isn't taken while a trade is still open.
 */
export function findDipTrades(candles: Candle[], params: DipParams): DipTrade[] {
  const closes = candles.map((c) => c.close);
  const r = rsi(closes);
  const trades: DipTrade[] = [];
  for (let i = TREND_BARS - 1; i < closes.length; i++) {
    if (!isSignalAt(closes, r, i, params)) continue;
    let exitIndex: number | null = null;
    let exitReason: DipTrade["exitReason"] = null;
    for (let k = i + 1; k <= i + params.maxHoldBars && k < closes.length; k++) {
      const line = sellPriceFor(closes, k);
      if (line != null && closes[k] > line) {
        exitIndex = k;
        exitReason = "sell-price";
        break;
      }
      if (k === i + params.maxHoldBars) {
        exitIndex = k;
        exitReason = "day-limit";
      }
    }
    const entry = closes[i];
    const exit = exitIndex != null ? closes[exitIndex] : null;
    trades.push({
      signalIndex: i,
      exitIndex,
      entry,
      exit,
      returnPct: exit != null ? ((exit - entry) / entry) * 100 : null,
      bars: exitIndex != null ? exitIndex - i : null,
      exitReason,
    });
    if (exitIndex == null) break; // still open: nothing after it can be a new trade
    i = exitIndex; // no overlapping trades
  }
  return trades;
}

export interface DipTrackRecord {
  count: number;
  upCount: number;
  avgReturnPct: number;
  medianBars: number | null;
  worstReturnPct: number | null;
  bestReturnPct: number | null;
  /** Years of history the record covers. */
  years: number;
}

export function summarizeTrades(trades: DipTrade[], candles: Candle[]): DipTrackRecord {
  const closed = trades.filter((t) => t.returnPct != null);
  const rets = closed.map((t) => t.returnPct!);
  const bars = closed.map((t) => t.bars!).sort((a, b) => a - b);
  const years = candles.length > 1 ? (candles.at(-1)!.time - candles[0].time) / (365.25 * 86400) : 0;
  return {
    count: closed.length,
    upCount: rets.filter((x) => x > 0).length,
    avgReturnPct: rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0,
    medianBars: bars.length ? bars[Math.floor((bars.length - 1) / 2)] : null,
    worstReturnPct: rets.length ? Math.min(...rets) : null,
    bestReturnPct: rets.length ? Math.max(...rets) : null,
    years: Math.round(years * 10) / 10,
  };
}

/**
 * The highest close for the *next* bar that would still be a signal, or null
 * when no such price exists (a close deep enough to count as a dip would also
 * break the uptrend). The RSI is increasing in the close, so the dip limit is
 * found by bisection; the trend floor is exact: P > (sum of last 199 + P)/200
 * <=> P > sum/199.
 */
export function buyZoneCeiling(closes: number[], params: DipParams): { ceiling: number; trendFloor: number } | null {
  const n = closes.length;
  if (n < TREND_BARS) return null;
  const { avgGain, avgLoss } = wilder(closes, RSI_PERIOD);
  const g0 = avgGain[n - 1];
  const l0 = avgLoss[n - 1];
  if (g0 == null || l0 == null) return null;
  const last = closes[n - 1];
  const nextRsi = (p: number) => {
    const d = p - last;
    const g = (g0 * (RSI_PERIOD - 1) + Math.max(d, 0)) / RSI_PERIOD;
    const l = (l0 * (RSI_PERIOD - 1) + Math.max(-d, 0)) / RSI_PERIOD;
    return rsiFrom(g, l);
  };
  let lo = last * 0.5;
  let hi = last * 1.5;
  if (nextRsi(lo) >= params.rsiMax) return null;
  for (let it = 0; it < 60; it++) {
    const mid = (lo + hi) / 2;
    if (nextRsi(mid) < params.rsiMax) lo = mid;
    else hi = mid;
  }
  let sum199 = 0;
  for (let k = n - (TREND_BARS - 1); k < n; k++) sum199 += closes[k];
  const trendFloor = sum199 / (TREND_BARS - 1);
  if (lo <= trendFloor) return null;
  return { ceiling: lo, trendFloor };
}

export type DipStatus =
  /** Today's (completed) close was a signal. */
  | "signal"
  /** Market is open and the live price is inside today's buy zone. */
  | "in-buy-zone"
  /** A signal fired in the last few days and hasn't hit its exit yet. */
  | "holding"
  /** The latest close triggered the sell for a recent signal. */
  | "sell-today"
  | "none";

export interface DipEvaluation {
  status: DipStatus;
  params: DipParams;
  /** Latest price used (live price during market hours, else the last close). */
  price: number;
  aboveTrend: boolean;
  avg200: number | null;
  rsi2: number | null;
  /** For the next (or current, if live) session: buy if the close is at or below this. */
  buyZone: { ceiling: number; trendFloor: number } | null;
  /** For the next (or current, if live) session: sell if the close is above this. */
  sellPrice: number | null;
  /** The active trade, when status is signal / holding / sell-today. */
  trade: DipTrade | null;
  /** Trading day of the hold (1..maxHoldBars) for the next/current session. */
  holdDay: number | null;
  /** Unix time of the signal bar. */
  signalTime: number | null;
  /** Consecutive lower closes ending at the latest completed bar. */
  downDays: number;
  /** % change from the close before that down streak to the latest completed close. */
  dropPct: number;
  lastBarIsLive: boolean;
}

/**
 * Where a symbol stands today. `lastBarIsLive` = the last candle is today's
 * still-forming bar (market open); rules are then judged on the completed
 * bars, with the live price compared against today's buy zone / sell price.
 */
export function evaluateDip(candles: Candle[], params: DipParams, lastBarIsLive: boolean): DipEvaluation {
  const completed = lastBarIsLive ? candles.slice(0, -1) : candles;
  const closes = completed.map((c) => c.close);
  const n = closes.length;
  const price = candles.at(-1)?.close ?? NaN;
  const r = rsi(closes);
  const avg200 = trailingMean(closes, n - 1, TREND_BARS);
  let downDays = 0;
  while (n - 2 - downDays >= 0 && closes[n - 1 - downDays] < closes[n - 2 - downDays]) downDays++;
  const streakStart = closes[n - 1 - downDays];
  const base: DipEvaluation = {
    status: "none",
    params,
    price,
    aboveTrend: avg200 != null && closes[n - 1] > avg200,
    avg200,
    rsi2: r[n - 1] ?? null,
    buyZone: buyZoneCeiling(closes, params),
    sellPrice: n >= 4 ? trailingMean(closes, n - 1, 4) : null,
    trade: null,
    holdDay: null,
    signalTime: null,
    downDays,
    dropPct: n > 0 ? ((closes[n - 1] - streakStart) / streakStart) * 100 : 0,
    lastBarIsLive,
  };
  if (n < TREND_BARS) return base;

  const lastTrade = findDipTrades(completed, params).at(-1);
  if (lastTrade) {
    const withTrade = { ...base, trade: lastTrade, signalTime: completed[lastTrade.signalIndex].time };
    if (lastTrade.exitIndex == null) {
      const holdDay = n - lastTrade.signalIndex; // next/current session's day number
      const status: DipStatus = lastTrade.signalIndex === n - 1 ? "signal" : "holding";
      return { ...withTrade, status, holdDay };
    }
    if (lastTrade.exitIndex === n - 1) return { ...withTrade, status: "sell-today" };
  }

  if (lastBarIsLive && base.buyZone && price <= base.buyZone.ceiling && price > base.buyZone.trendFloor) {
    return { ...base, status: "in-buy-zone" };
  }
  return base;
}
