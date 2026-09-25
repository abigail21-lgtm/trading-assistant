import type { Candle } from "../market/yahoo";
import { sma } from "../market/indicators";
import { clusterPivots, type SupportResistanceLevel, type Trend } from "../market/analysis";

// Setup detection for the call-buying scanner.
//
// Everything here is point-in-time: evaluating bar `i` may only use
// candles[0..i]. That's what makes the track record (how often a setup hit
// its target afterwards) honest -- a detector that peeks at later bars would
// look great in hindsight and useless live. The one place that's easy to get
// wrong is pivots: a pivot high/low at bar j is only *known* once `lookback`
// bars after it have closed, so levels at bar i only include pivots with
// j + lookback <= i. engine.test.ts checks this against truncated histories.

export type SetupType = "bounce" | "breakout" | "retest" | "ma-pullback";

export interface Setup {
  type: SetupType;
  barIndex: number;
  time: number;
  close: number;
  /** The price the setup is built on: the support, the broken resistance, or the 20-bar average. */
  level: number;
  /** How many times price turned at `level` before (null for the moving average). */
  touches: number | null;
  /** Below this, the setup is wrong. */
  stop: number;
  target: number;
  /** "resistance" = next resistance above; "atr" = no resistance in view, so 2x average daily range. */
  targetSource: "resistance" | "atr";
  /** The resistance after the target, if any -- how much room there is past it. */
  nextResistance: number | null;
  upPct: number;
  downPct: number;
  /** upPct / downPct. */
  rewardRisk: number;
  trend: Trend;
}

export interface SetupParams {
  /** Bars on each side that make a pivot high/low. */
  pivotLookback: number;
  /** Only pivots from the last N bars form levels. */
  levelWindow: number;
  /** Pivots within this % of each other merge into one level. */
  clusterTolerancePct: number;
  /** A level needs at least this many turns to count. */
  minTouches: number;
  /** How close (%) a low must come to a level to count as a test of it. */
  touchTolerancePct: number;
  /** Breakout bar volume vs the prior 20-bar average. */
  breakoutVolumeMultiple: number;
  /** A retest must come this many bars after the breakout, at most. */
  retestMaxBars: number;
  /** Stop sits this % below the level. */
  stopBufferPct: number;
}

export const DAILY_PARAMS: SetupParams = {
  pivotLookback: 3,
  levelWindow: 250,
  clusterTolerancePct: 1.5,
  minTouches: 2,
  touchTolerancePct: 1.5,
  breakoutVolumeMultiple: 1.5,
  retestMaxBars: 10,
  stopBufferPct: 1,
};

interface Pivot {
  index: number;
  price: number;
  type: "low" | "high";
}

export interface SeriesContext {
  candles: Candle[];
  params: SetupParams;
  sma20: (number | null)[];
  sma50: (number | null)[];
  /** Average volume of the 20 bars *before* each bar (so a spike doesn't dilute its own baseline). */
  priorAvgVolume: (number | null)[];
  atr14: (number | null)[];
  pivots: Pivot[];
}

function computePivots(candles: Candle[], lookback: number): Pivot[] {
  const pivots: Pivot[] = [];
  for (let j = lookback; j < candles.length - lookback; j++) {
    let isLow = true;
    let isHigh = true;
    for (let k = j - lookback; k <= j + lookback; k++) {
      if (candles[k].low < candles[j].low) isLow = false;
      if (candles[k].high > candles[j].high) isHigh = false;
    }
    if (isLow) pivots.push({ index: j, price: candles[j].low, type: "low" });
    if (isHigh) pivots.push({ index: j, price: candles[j].high, type: "high" });
  }
  return pivots;
}

function computeAtr(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let atr = 0;
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
    if (i <= period) {
      atr += tr / period;
      if (i === period) out[i] = atr;
    } else {
      atr = (atr * (period - 1) + tr) / period;
      out[i] = atr;
    }
  }
  return out;
}

function computePriorAvgVolume(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(candles.length).fill(null);
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i >= period) out[i] = sum / period;
    sum += candles[i].volume;
    if (i >= period) sum -= candles[i - period].volume;
  }
  return out;
}

export function createContext(candles: Candle[], params: SetupParams = DAILY_PARAMS): SeriesContext {
  const closes = candles.map((c) => c.close);
  return {
    candles,
    params,
    sma20: sma(closes, 20),
    sma50: sma(closes, 50),
    priorAvgVolume: computePriorAvgVolume(candles, 20),
    atr14: computeAtr(candles, 14),
    pivots: computePivots(candles, params.pivotLookback),
  };
}

/** Support/resistance levels as they were known at the close of bar i. */
export function levelsAt(ctx: SeriesContext, i: number): SupportResistanceLevel[] {
  const { pivotLookback, levelWindow, clusterTolerancePct } = ctx.params;
  const known = ctx.pivots.filter((p) => p.index + pivotLookback <= i && p.index >= i - levelWindow);
  return clusterPivots(known, clusterTolerancePct);
}

/**
 * Uptrend = 20-avg above a rising 50-avg, with price still above the 50-avg.
 * Looser than the Analysis card (which also wants price above the 20-avg):
 * a pullback to support in an uptrend usually dips under the 20-avg, and
 * that dip is exactly the entry the bounce setup is looking for.
 */
export function trendAt(ctx: SeriesContext, i: number): Trend {
  const price = ctx.candles[i].close;
  const ma20 = ctx.sma20[i];
  const ma50 = ctx.sma50[i];
  const pastMa50 = i >= 10 ? ctx.sma50[i - 10] : null;
  if (ma20 == null || ma50 == null || pastMa50 == null) return "range";
  if (price > ma50 && ma20 > ma50 && ma50 > pastMa50) return "uptrend";
  if (price < ma50 && ma20 < ma50 && ma50 < pastMa50) return "downtrend";
  return "range";
}

function resistancesAbove(levels: SupportResistanceLevel[], price: number, minTouches: number): number[] {
  return levels
    .filter((l) => l.type === "resistance" && l.touches >= minTouches && l.price > price * 1.003)
    .map((l) => l.price)
    .sort((a, b) => a - b);
}

function buildSetup(
  ctx: SeriesContext,
  i: number,
  type: SetupType,
  level: number,
  touches: number | null,
  stop: number,
  trend: Trend,
): Setup | null {
  const close = ctx.candles[i].close;
  if (stop >= close) return null;
  const above = resistancesAbove(levelsAt(ctx, i), close, ctx.params.minTouches);
  let target: number;
  let targetSource: Setup["targetSource"];
  let nextResistance: number | null;
  if (above.length > 0) {
    target = above[0];
    targetSource = "resistance";
    nextResistance = above[1] ?? null;
  } else {
    const atr = ctx.atr14[i];
    if (atr == null) return null;
    target = close + 2 * atr;
    targetSource = "atr";
    nextResistance = null;
  }
  const upPct = ((target - close) / close) * 100;
  const downPct = ((close - stop) / close) * 100;
  return {
    type,
    barIndex: i,
    time: ctx.candles[i].time,
    close,
    level,
    touches,
    stop,
    target,
    targetSource,
    nextResistance,
    upPct,
    downPct,
    rewardRisk: upPct / downPct,
    trend,
  };
}

/** A close through a resistance (with 2+ touches, known the bar before) on heavy volume. */
function breakoutLevelAt(ctx: SeriesContext, k: number): SupportResistanceLevel | null {
  if (k < 1) return null;
  const { candles, params } = ctx;
  const avgVol = ctx.priorAvgVolume[k];
  if (avgVol == null || avgVol === 0 || candles[k].volume < avgVol * params.breakoutVolumeMultiple) return null;
  const broken = levelsAt(ctx, k - 1)
    .filter(
      (l) =>
        l.type === "resistance" &&
        l.touches >= params.minTouches &&
        candles[k - 1].close <= l.price &&
        candles[k].close > l.price * 1.003,
    )
    .sort((a, b) => b.price - a.price);
  return broken[0] ?? null;
}

function detectBounce(ctx: SeriesContext, i: number, trend: Trend): Setup | null {
  if (trend !== "uptrend" || i < 1) return null;
  const { candles, params } = ctx;
  const bar = candles[i];
  if (bar.close <= bar.open) return null;
  const tol = params.touchTolerancePct / 100;
  const recentLow = Math.min(bar.low, candles[i - 1].low);
  const support = levelsAt(ctx, i)
    .filter(
      (l) =>
        l.type === "support" &&
        l.touches >= params.minTouches &&
        bar.close > l.price * 1.003 &&
        // Still near the level -- once price has run away from support it's
        // no longer an entry "at support", and the stop is too far off.
        bar.close <= l.price * (1 + 2 * tol) &&
        recentLow <= l.price * (1 + tol) &&
        recentLow >= l.price * (1 - tol),
    )
    .sort((a, b) => b.price - a.price)[0];
  if (!support) return null;
  return buildSetup(ctx, i, "bounce", support.price, support.touches, support.price * (1 - params.stopBufferPct / 100), trend);
}

function detectBreakout(ctx: SeriesContext, i: number, trend: Trend): Setup | null {
  if (trend === "downtrend") return null;
  const level = breakoutLevelAt(ctx, i);
  if (!level) return null;
  return buildSetup(ctx, i, "breakout", level.price, level.touches, level.price * (1 - ctx.params.stopBufferPct / 100), trend);
}

function detectRetest(ctx: SeriesContext, i: number, trend: Trend): Setup | null {
  if (trend === "downtrend") return null;
  const { candles, params } = ctx;
  const bar = candles[i];
  if (bar.close <= bar.open) return null;
  const tol = params.touchTolerancePct / 100;
  for (let k = i - 2; k >= Math.max(1, i - params.retestMaxBars); k--) {
    const level = breakoutLevelAt(ctx, k);
    if (!level) continue;
    // The breakout must not have failed in between: no close back below the level.
    let held = true;
    for (let m = k + 1; m <= i; m++) {
      if (candles[m].close < level.price * (1 - params.stopBufferPct / 100)) held = false;
    }
    if (!held) return null;
    if (bar.low <= level.price * (1 + tol) && bar.close > level.price && bar.close <= level.price * (1 + 2 * tol)) {
      return buildSetup(ctx, i, "retest", level.price, level.touches, level.price * (1 - params.stopBufferPct / 100), trend);
    }
    return null;
  }
  return null;
}

function detectMaPullback(ctx: SeriesContext, i: number, trend: Trend): Setup | null {
  if (trend !== "uptrend" || i < 6) return null;
  const { candles, params } = ctx;
  const bar = candles[i];
  const ma = ctx.sma20[i];
  if (ma == null || bar.close <= bar.open) return null;
  if (!(bar.low <= ma * 1.005 && bar.close > ma)) return null;
  // First touch after a run above the average -- not chop sitting on it.
  for (let k = i - 5; k < i; k++) {
    const m = ctx.sma20[k];
    if (m == null || candles[k].low <= m) return null;
  }
  const swingLow = Math.min(candles[i].low, candles[i - 1].low, candles[i - 2].low);
  return buildSetup(ctx, i, "ma-pullback", ma, null, swingLow * (1 - params.stopBufferPct / 100 / 2), trend);
}

/** Every setup that triggered on the close of bar i. Uses only candles[0..i]. */
export function detectSetupsAt(ctx: SeriesContext, i: number): Setup[] {
  if (i < 50 || i >= ctx.candles.length) return [];
  const trend = trendAt(ctx, i);
  return [
    detectBounce(ctx, i, trend),
    detectBreakout(ctx, i, trend),
    detectRetest(ctx, i, trend),
    detectMaPullback(ctx, i, trend),
  ].filter((s): s is Setup => s !== null);
}
