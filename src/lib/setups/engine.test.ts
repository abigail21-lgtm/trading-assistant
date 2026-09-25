import { describe, expect, it } from "vitest";
import type { Candle } from "../market/yahoo";
import { createContext, detectSetupsAt, levelsAt, trendAt, type SetupType } from "./engine";

/** Deterministic PRNG so failures reproduce. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A drifting random walk with realistic-ish candles and occasional volume spikes. */
function randomCandles(seed: number, n: number, drift = 0.0006): Candle[] {
  const rand = mulberry32(seed);
  const out: Candle[] = [];
  let price = 100;
  for (let i = 0; i < n; i++) {
    const open = price;
    const close = open * (1 + drift + (rand() - 0.5) * 0.04);
    const high = Math.max(open, close) * (1 + rand() * 0.012);
    const low = Math.min(open, close) * (1 - rand() * 0.012);
    const volume = 1_000_000 * (rand() < 0.12 ? 2 + rand() * 2 : 0.6 + rand() * 0.8);
    out.push({ time: 1_600_000_000 + i * 86_400, open, high, low, close, volume });
    price = close;
  }
  return out;
}

/** Candles from a list of closes; each bar opens at the previous close. */
function fromCloses(closes: number[], opts: { volume?: (i: number) => number; wick?: number } = {}): Candle[] {
  const wick = opts.wick ?? 0.003;
  return closes.map((close, i) => {
    const open = i === 0 ? close : closes[i - 1];
    return {
      time: 1_600_000_000 + i * 86_400,
      open,
      high: Math.max(open, close) * (1 + wick),
      low: Math.min(open, close) * (1 - wick),
      close,
      volume: opts.volume?.(i) ?? 1_000_000,
    };
  });
}

describe("no lookahead", () => {
  it("gives identical results whether or not later bars exist", () => {
    let totalSetups = 0;
    const typesSeen = new Set<SetupType>();
    for (const seed of [1, 2, 3, 4]) {
      const candles = randomCandles(seed, 400);
      const full = createContext(candles);
      for (let i = 50; i < candles.length; i++) {
        const truncated = createContext(candles.slice(0, i + 1));
        const a = detectSetupsAt(full, i);
        expect(a).toEqual(detectSetupsAt(truncated, i));
        expect(levelsAt(full, i)).toEqual(levelsAt(truncated, i));
        expect(trendAt(full, i)).toEqual(trendAt(truncated, i));
        totalSetups += a.length;
        a.forEach((s) => typesSeen.add(s.type));
      }
    }
    // Guard against a vacuous pass: the walks must actually produce setups.
    expect(totalSetups).toBeGreaterThan(20);
    expect(typesSeen.size).toBeGreaterThanOrEqual(3);
  });

  it("ignores a pivot until enough bars have closed after it", () => {
    // A sharp V bottom at bar 60: not a known support until bar 63.
    const closes = Array.from({ length: 70 }, (_, i) => (i <= 60 ? 120 - i * 0.3 : 102 + (i - 60) * 0.5));
    const ctx = createContext(fromCloses(closes));
    const hasLowNear = (i: number) => levelsAt(ctx, i).some((l) => l.type === "support" && Math.abs(l.price - ctx.candles[60].low) < 0.01);
    expect(hasLowNear(62)).toBe(false);
    expect(hasLowNear(63)).toBe(true);
  });
});

describe("setup rules", () => {
  it("every setup has stop below close and target above it", () => {
    for (const seed of [5, 6, 7]) {
      const candles = randomCandles(seed, 500);
      const ctx = createContext(candles);
      for (let i = 0; i < candles.length; i++) {
        for (const s of detectSetupsAt(ctx, i)) {
          expect(s.stop).toBeLessThan(s.close);
          expect(s.target).toBeGreaterThan(s.close);
          expect(s.rewardRisk).toBeCloseTo(s.upPct / s.downPct);
        }
      }
    }
  });

  it("flags a breakout through a twice-tested resistance on heavy volume", () => {
    // Rise to ~110, get rejected twice at 110, then close through it on 2x volume.
    const closes: number[] = [];
    for (let i = 0; i < 60; i++) closes.push(90 + i * 0.25); // 90 -> ~105
    const leg = [106, 108, 110, 108, 106, 105, 106, 108, 110, 108, 106, 105, 106, 107, 108, 109];
    closes.push(...leg);
    const breakoutBar = closes.length;
    closes.push(112);
    const candles = fromCloses(closes, { volume: (i) => (i === breakoutBar ? 2_500_000 : 1_000_000) });
    const setups = detectSetupsAt(createContext(candles), breakoutBar);
    const breakout = setups.find((s) => s.type === "breakout");
    expect(breakout).toBeDefined();
    expect(breakout!.level).toBeGreaterThan(109);
    expect(breakout!.level).toBeLessThan(111.5);
    expect(breakout!.touches).toBeGreaterThanOrEqual(2);
    expect(breakout!.stop).toBeLessThan(breakout!.level);
  });

  it("does not flag the same breakout on normal volume", () => {
    const closes: number[] = [];
    for (let i = 0; i < 60; i++) closes.push(90 + i * 0.25);
    closes.push(106, 108, 110, 108, 106, 105, 106, 108, 110, 108, 106, 105, 106, 107, 108, 109, 112);
    const setups = detectSetupsAt(createContext(fromCloses(closes)), closes.length - 1);
    expect(setups.find((s) => s.type === "breakout")).toBeUndefined();
  });
});

describe("bounce", () => {
  it("flags a green close off a twice-tested support in an uptrend, but not once price has run away from it", () => {
    // Steady uptrend with two dips to ~120 (support), then a third dip and a green bounce.
    const closes: number[] = [];
    for (let i = 0; i < 80; i++) closes.push(80 + i * 0.5); // 80 -> 119.5
    closes.push(122, 125, 127, 124, 121, 120, 122, 125, 128, 130, 127, 123, 120.5, 122, 126, 129, 131, 133, 134);
    closes.push(131, 128, 125, 122); // pull back toward support...
    const bounceBar = closes.length;
    closes.push(122.8); // ...and close green just above it
    const ctx = createContext(fromCloses(closes, { wick: 0.006 }));
    const bounce = detectSetupsAt(ctx, bounceBar).find((s) => s.type === "bounce");
    expect(bounce).toBeDefined();
    expect(bounce!.level).toBeGreaterThan(118);
    expect(bounce!.level).toBeLessThan(122);
    expect(bounce!.stop).toBeLessThan(bounce!.level);
    expect(bounce!.target).toBeGreaterThan(bounce!.close);

    // Same history, but the bounce bar rips 6% -- too far from support to be an entry.
    const farCloses = [...closes.slice(0, bounceBar), 129];
    const far = detectSetupsAt(createContext(fromCloses(farCloses, { wick: 0.006 })), bounceBar);
    expect(far.find((s) => s.type === "bounce")).toBeUndefined();
  });
});
