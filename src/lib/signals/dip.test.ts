import { describe, expect, it } from "vitest";
import type { Candle } from "../market/yahoo";
import { sma } from "../market/indicators";
import {
  STOCK_DIP,
  INDEX_DIP,
  buyZoneCeiling,
  evaluateDip,
  findDipTrades,
  isSignalAt,
  paramsFor,
  rsi,
  sellPriceFor,
  summarizeTrades,
} from "./dip";

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function walk(seed: number, n: number, drift = 0.0008): Candle[] {
  const rand = mulberry32(seed);
  let p = 100;
  return Array.from({ length: n }, (_, i) => {
    const open = p;
    const close = open * (1 + drift + (rand() - 0.5) * 0.04);
    p = close;
    return { time: 1_600_000_000 + i * 86400, open, high: Math.max(open, close) * 1.005, low: Math.min(open, close) * 0.995, close, volume: 1e6 };
  });
}

const withClose = (candles: Candle[], close: number): Candle[] => [
  ...candles,
  { time: candles.at(-1)!.time + 86400, open: close, high: close, low: close, close, volume: 1e6 },
];

describe("sell price", () => {
  it("a close above it is exactly a close above the 5-day average", () => {
    for (const seed of [1, 2, 3]) {
      const closes = walk(seed, 300).map((c) => c.close);
      const ma5 = sma(closes, 5);
      for (let k = 5; k < closes.length; k++) {
        expect(closes[k] > sellPriceFor(closes, k)!).toBe(closes[k] > ma5[k]!);
      }
    }
  });
});

describe("findDipTrades", () => {
  it("matches a straightforward re-implementation of the tested rules", () => {
    for (const seed of [4, 5, 6, 7]) {
      const candles = walk(seed, 900);
      const closes = candles.map((c) => c.close);
      const ma5 = sma(closes, 5);
      const ma200 = sma(closes, 200);
      const r = rsi(closes);
      const expected: { signal: number; exit: number }[] = [];
      for (let i = 199; i < closes.length; i++) {
        if (!(ma200[i] != null && closes[i] > ma200[i]! && r[i] != null && r[i]! < STOCK_DIP.rsiMax)) continue;
        let exit = -1;
        for (let k = i + 1; k <= i + 5 && k < closes.length; k++) {
          if (closes[k] > ma5[k]! || k === i + 5) {
            exit = k;
            break;
          }
        }
        if (exit < 0) break;
        expected.push({ signal: i, exit });
        i = exit;
      }
      const got = findDipTrades(candles, STOCK_DIP).filter((t) => t.exitIndex != null);
      expect(got.map((t) => ({ signal: t.signalIndex, exit: t.exitIndex }))).toEqual(expected);
      expect(expected.length).toBeGreaterThan(3); // not a vacuous pass
    }
  });

  it("summarizes closed trades", () => {
    const candles = walk(8, 900);
    const trades = findDipTrades(candles, INDEX_DIP);
    const s = summarizeTrades(trades, candles);
    const closed = trades.filter((t) => t.returnPct != null);
    expect(s.count).toBe(closed.length);
    expect(s.upCount).toBe(closed.filter((t) => t.returnPct! > 0).length);
    expect(s.worstReturnPct).toBe(Math.min(...closed.map((t) => t.returnPct!)));
  });
});

describe("buy zone", () => {
  it("a close just under the ceiling is a signal and just over it is not", () => {
    let checked = 0;
    for (let seed = 10; seed < 40; seed++) {
      const candles = walk(seed, 320);
      const zone = buyZoneCeiling(candles.map((c) => c.close), STOCK_DIP);
      if (!zone) continue;
      checked++;
      const under = withClose(candles, zone.ceiling * 0.999).map((c) => c.close);
      const over = withClose(candles, zone.ceiling * 1.001).map((c) => c.close);
      expect(isSignalAt(under, rsi(under), under.length - 1, STOCK_DIP)).toBe(true);
      expect(isSignalAt(over, rsi(over), over.length - 1, STOCK_DIP)).toBe(false);
    }
    expect(checked).toBeGreaterThan(5);
  });
});

describe("evaluateDip", () => {
  // Steady climb, then one sharp down close. After a smooth climb a single 5%
  // drop already takes the 2-day RSI near zero: a deep dip well above the
  // 200-day average.
  const climb = Array.from({ length: 260 }, (_, i) => 100 + i * 0.3);
  const dipCloses = [...climb, climb.at(-1)! * 0.95];
  const toCandles = (closes: number[]): Candle[] =>
    closes.map((close, i) => ({ time: 1_600_000_000 + i * 86400, open: close, high: close, low: close, close, volume: 1e6 }));

  it("reports a signal on the dip day, with the next day's sell price", () => {
    const e = evaluateDip(toCandles(dipCloses), STOCK_DIP, false);
    expect(e.status).toBe("signal");
    expect(e.holdDay).toBe(1);
    const c = dipCloses;
    const n = c.length;
    expect(e.sellPrice).toBeCloseTo((c[n - 1] + c[n - 2] + c[n - 3] + c[n - 4]) / 4);
  });

  it("reports holding while below the sell price, then sell-today once above it", () => {
    const still = [...dipCloses, dipCloses.at(-1)! * 0.995];
    const holding = evaluateDip(toCandles(still), STOCK_DIP, false);
    expect(holding.status).toBe("holding");
    expect(holding.holdDay).toBe(2);
    const bounced = [...still, holding.sellPrice! * 1.01];
    expect(evaluateDip(toCandles(bounced), STOCK_DIP, false).status).toBe("sell-today");
  });

  it("forces the sell on day 5", () => {
    const flat = [...dipCloses];
    for (let d = 0; d < 5; d++) flat.push(flat.at(-1)! * 0.999);
    expect(evaluateDip(toCandles(flat), STOCK_DIP, false).status).toBe("sell-today");
    expect(findDipTrades(toCandles(flat), STOCK_DIP).at(-1)!.exitReason).toBe("day-limit");
  });

  it("judges a live bar against the completed bars", () => {
    const beforeDip = dipCloses.slice(0, -1);
    const zone = buyZoneCeiling(beforeDip, STOCK_DIP)!;
    expect(zone).not.toBeNull();
    const live = evaluateDip(toCandles([...beforeDip, zone.ceiling * 0.99]), STOCK_DIP, true);
    expect(live.status).toBe("in-buy-zone");
    const notYet = evaluateDip(toCandles([...beforeDip, zone.ceiling * 1.02]), STOCK_DIP, true);
    expect(notYet.status).toBe("none");
  });

  it("uses the index-fund threshold only for index funds", () => {
    expect(paramsFor("spy")).toBe(INDEX_DIP);
    expect(paramsFor("AMD")).toBe(STOCK_DIP);
  });
});
