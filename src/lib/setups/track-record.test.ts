import { describe, expect, it } from "vitest";
import type { Candle } from "../market/yahoo";
import { createContext, type Setup } from "./engine";
import { baselineHitRate, resolveOutcome } from "./track-record";

const bar = (open: number, high: number, low: number, close: number): Candle => ({ time: 0, open, high, low, close, volume: 1 });

/** 60 flat bars, then the given bars after a setup on bar 59. */
function scenario(after: Candle[]) {
  const candles = [...Array.from({ length: 60 }, () => bar(100, 100.5, 99.5, 100)), ...after];
  const setup = { barIndex: 59, stop: 98, target: 105 } as Setup;
  return { ctx: createContext(candles), setup };
}

describe("resolveOutcome", () => {
  it("enters at the next open and records a target hit", () => {
    const { ctx, setup } = scenario([bar(100.5, 102, 100, 101), bar(101, 105.5, 100.5, 105), bar(105, 106, 104, 105)]);
    const o = resolveOutcome(ctx, setup, 3)!;
    expect(o.entry).toBe(100.5);
    expect(o.result).toBe("target");
    expect(o.exit).toBe(105);
    expect(o.bars).toBe(2);
  });

  it("counts a bar that touches both target and stop as a stop", () => {
    const { ctx, setup } = scenario([bar(100, 106, 97, 100), bar(100, 101, 99, 100), bar(100, 101, 99, 100)]);
    expect(resolveOutcome(ctx, setup, 3)!.result).toBe("stop");
  });

  it("fills a gap below the stop at the open, not at the stop", () => {
    const { ctx, setup } = scenario([bar(100, 101, 99, 100), bar(95, 96, 94, 95), bar(95, 96, 94, 95)]);
    const o = resolveOutcome(ctx, setup, 3)!;
    expect(o.result).toBe("stop");
    expect(o.exit).toBe(95);
  });

  it("records neither when the window runs out, exiting at the last close", () => {
    const { ctx, setup } = scenario([bar(100, 101, 99, 100), bar(100, 102, 99, 101.5), bar(101.5, 103, 100, 102)]);
    const o = resolveOutcome(ctx, setup, 3)!;
    expect(o.result).toBe("neither");
    expect(o.exit).toBe(102);
  });

  it("returns null while the hold window is still open", () => {
    const { ctx, setup } = scenario([bar(100, 101, 99, 100)]);
    expect(resolveOutcome(ctx, setup, 3)).toBeNull();
  });
});

describe("baselineHitRate", () => {
  it("is 1 when every bar rises past a tiny target and 0 when the target is out of reach", () => {
    const candles = Array.from({ length: 120 }, (_, i) => bar(100 + i, 101.5 + i, 99.8 + i, 101 + i));
    const ctx = createContext(candles);
    expect(baselineHitRate(ctx, 0.5, 5, 3)).toBe(1);
    expect(baselineHitRate(ctx, 50, 5, 3)).toBe(0);
  });
});
