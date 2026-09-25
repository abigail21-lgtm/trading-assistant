import { detectSetupsAt, type SeriesContext, type Setup, type SetupType } from "./engine";

// What happened after each past setup: did the stock reach the target before
// the stop within the hold window? Measured on the stock, not the option --
// historical option prices aren't available for free.
//
// Fill rules are deliberately conservative:
// - Entry is the *next* bar's open, not the signal bar's close (you only see
//   the signal after the close).
// - If a bar touches both target and stop, it counts as a stop: daily bars
//   don't say which came first.
// - A gap open below the stop fills at that open, not at the stop.

export type OutcomeResult = "target" | "stop" | "neither";

export interface Outcome {
  setup: Setup;
  result: OutcomeResult;
  entry: number;
  exit: number;
  /** Bars from entry to exit (1 = exited on the entry bar). */
  bars: number;
  /** Stock return from entry to exit, %. */
  returnPct: number;
}

export interface TrackRecord {
  count: number;
  targets: number;
  stops: number;
  neither: number;
  /** targets / count, 0..1. */
  hitRate: number;
  medianBarsToTarget: number | null;
  avgReturnPct: number;
}

/** Walks forward from the bar after `signalIndex`. Null if there isn't a next bar to enter on yet. */
export function resolveOutcome(
  ctx: SeriesContext,
  setup: Setup,
  holdBars: number,
): Outcome | null {
  const { candles } = ctx;
  const start = setup.barIndex + 1;
  if (start >= candles.length) return null;
  const entry = candles[start].open;
  const last = Math.min(candles.length - 1, start + holdBars - 1);
  // A still-open window (recent setup) isn't an outcome yet.
  if (start + holdBars - 1 > candles.length - 1) return null;

  for (let k = start; k <= last; k++) {
    const bar = candles[k];
    if (bar.low <= setup.stop) {
      const exit = k > start && bar.open < setup.stop ? bar.open : Math.min(setup.stop, bar.open);
      return finish(setup, "stop", entry, exit, k - start + 1);
    }
    if (bar.high >= setup.target) {
      const exit = Math.max(setup.target, k === start ? entry : bar.open);
      return finish(setup, "target", entry, exit, k - start + 1);
    }
  }
  return finish(setup, "neither", entry, candles[last].close, last - start + 1);
}

function finish(setup: Setup, result: OutcomeResult, entry: number, exit: number, bars: number): Outcome {
  return { setup, result, entry, exit, bars, returnPct: ((exit - entry) / entry) * 100 };
}

/**
 * Every setup in the series, once each: a setup type that already fired in
 * the last `cooldownBars` bars isn't counted again (a bounce that keeps
 * qualifying for three days is one trade, not three wins).
 */
export function findHistoricalSetups(
  ctx: SeriesContext,
  cooldownBars = 5,
  filter: (setup: Setup, i: number) => boolean = () => true,
): Setup[] {
  const lastFired = new Map<SetupType, number>();
  const out: Setup[] = [];
  for (let i = 0; i < ctx.candles.length; i++) {
    for (const setup of detectSetupsAt(ctx, i)) {
      const prev = lastFired.get(setup.type);
      lastFired.set(setup.type, i);
      if (prev != null && i - prev <= cooldownBars) continue;
      if (filter(setup, i)) out.push(setup);
    }
  }
  return out;
}

export function summarize(outcomes: Outcome[]): TrackRecord {
  const targets = outcomes.filter((o) => o.result === "target");
  const stops = outcomes.filter((o) => o.result === "stop").length;
  const barsToTarget = targets.map((o) => o.bars).sort((a, b) => a - b);
  return {
    count: outcomes.length,
    targets: targets.length,
    stops,
    neither: outcomes.length - targets.length - stops,
    hitRate: outcomes.length ? targets.length / outcomes.length : 0,
    medianBarsToTarget: barsToTarget.length ? barsToTarget[Math.floor((barsToTarget.length - 1) / 2)] : null,
    avgReturnPct: outcomes.length ? outcomes.reduce((s, o) => s + o.returnPct, 0) / outcomes.length : 0,
  };
}

/**
 * The fair comparison for a setup: if you'd bought at a *random* bar's next
 * open, with a target and stop the same % distance away, how often would the
 * target have come first? A setup only has an edge if it beats this -- a
 * close target gets hit often no matter how you pick the entry.
 */
export function baselineHitRate(
  ctx: SeriesContext,
  upPct: number,
  downPct: number,
  holdBars: number,
  sampleEvery = 1,
): number | null {
  const { candles } = ctx;
  let hits = 0;
  let total = 0;
  for (let i = 50; i + holdBars < candles.length; i += sampleEvery) {
    const entry = candles[i + 1].open;
    const target = entry * (1 + upPct / 100);
    const stop = entry * (1 - downPct / 100);
    let result: OutcomeResult = "neither";
    for (let k = i + 1; k <= i + holdBars; k++) {
      if (candles[k].low <= stop) {
        result = "stop";
        break;
      }
      if (candles[k].high >= target) {
        result = "target";
        break;
      }
    }
    total++;
    if (result === "target") hits++;
  }
  return total ? hits / total : null;
}
