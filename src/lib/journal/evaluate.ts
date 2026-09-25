import type { Candle } from "../market/yahoo";
import { findDipTrades, isSignalAt, rsi, type DipParams } from "../signals/dip";

// What the dip signal said about a trade you actually made: did you buy on a
// dip day (or the day after), and if so, did you sell when the plan said to?
// Uses only prices up to each date, so it's the same answer the app would
// have given you at the time.

export type EntryMatch = "dip-day" | "day-after" | "none";
export type ExitMatch = "on-plan" | "early" | "late" | null;

export interface EntryEvaluation {
  entry: EntryMatch;
  /** Was the underlying above its 200-day average on the day you bought? */
  aboveTrend: boolean | null;
  /** The plan's sell date for the matched dip (ISO), if there was one. */
  planExitDate: string | null;
  exit: ExitMatch;
}

const isoDay = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

/** Index of the last bar on or before an ISO date, or -1. */
function barOnOrBefore(candles: Candle[], date: string): number {
  let idx = -1;
  for (let i = 0; i < candles.length; i++) {
    if (isoDay(candles[i].time) <= date) idx = i;
    else break;
  }
  return idx;
}

export function evaluateEntry(candles: Candle[], openDate: string, closeDate: string | null, params: DipParams): EntryEvaluation {
  const i = barOnOrBefore(candles, openDate);
  if (i < 200) return { entry: "none", aboveTrend: null, planExitDate: null, exit: null };
  // Only history up to the buy day: the same view you had then.
  const upTo = candles.slice(0, i + 1);
  const closes = upTo.map((c) => c.close);
  const r = rsi(closes);
  const sameDay = isoDay(candles[i].time) === openDate && isSignalAt(closes, r, i, params);
  const dayBefore = !sameDay && isSignalAt(closes, r, i - 1, params);
  const avg200 = closes.slice(-200).reduce((a, b) => a + b, 0) / 200;
  const aboveTrend = closes[i] > avg200;

  const signalIndex = sameDay ? i : dayBefore ? i - 1 : null;
  if (signalIndex == null) return { entry: "none", aboveTrend, planExitDate: null, exit: null };

  // The plan's exit needs the days after the signal; that's fine here because
  // it only judges your sell, not whether to buy. A buy on the second day of
  // a dip belongs to the dip trade that started the day before.
  const withExit = candles.slice(0, Math.min(candles.length, signalIndex + params.maxHoldBars + 1));
  const planned = findDipTrades(withExit, params).find(
    (t) => t.signalIndex === signalIndex || (t.signalIndex < signalIndex && (t.exitIndex == null || signalIndex < t.exitIndex)),
  );
  const planExitDate = planned?.exitIndex != null ? isoDay(candles[planned.exitIndex].time) : null;
  let exit: ExitMatch = null;
  if (planned && planned.exitIndex == null && closeDate) {
    // The plan hasn't said sell yet (the data ends first), so any sale so far came early.
    exit = "early";
  } else if (planExitDate && closeDate) {
    const planIdx = planned!.exitIndex!;
    const soldIdx = barOnOrBefore(candles, closeDate);
    exit = soldIdx < planIdx ? "early" : soldIdx > planIdx + 1 ? "late" : "on-plan";
  }
  return { entry: sameDay ? "dip-day" : "day-after", aboveTrend, planExitDate, exit };
}
