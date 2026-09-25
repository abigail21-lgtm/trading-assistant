import { describe, expect, it } from "vitest";
import type { Candle } from "../market/yahoo";
import { STOCK_DIP } from "../signals/dip";
import { evaluateEntry } from "./evaluate";

// Daily bars starting 2025-01-01 (weekends included; only dates matter here).
const DAY = 86400;
const START = Date.parse("2025-01-01T14:30:00Z") / 1000;
const iso = (i: number) => new Date((START + i * DAY) * 1000).toISOString().slice(0, 10);
const toCandles = (closes: number[]): Candle[] =>
  closes.map((close, i) => ({ time: START + i * DAY, open: close, high: close, low: close, close, volume: 1 }));

// Climb, a sharp one-day dip on bar 260, then a bounce on bar 262.
const closes = Array.from({ length: 260 }, (_, i) => 100 + i * 0.3);
const top = closes.at(-1)!;
closes.push(top * 0.95, top * 0.945, top * 0.99, top, top);
const candles = toCandles(closes);

describe("evaluateEntry", () => {
  it("recognises a buy on the dip day and a sell on the plan's day", () => {
    const e = evaluateEntry(candles, iso(260), iso(262), STOCK_DIP);
    expect(e.entry).toBe("dip-day");
    expect(e.aboveTrend).toBe(true);
    expect(e.planExitDate).toBe(iso(262));
    expect(e.exit).toBe("on-plan");
  });

  it("treats a buy on the dip's second day as part of the same plan", () => {
    // Bar 261 closed lower again, so it's a dip day too; its plan is the one started on 260.
    expect(evaluateEntry(candles, iso(261), iso(261), STOCK_DIP)).toMatchObject({ entry: "dip-day", planExitDate: iso(262), exit: "early" });
  });

  it("recognises a buy the day after the dip, and a late sell", () => {
    expect(evaluateEntry(candles, iso(262), iso(264), STOCK_DIP)).toMatchObject({ entry: "day-after", planExitDate: iso(262), exit: "late" });
  });

  it("says none for a buy without a dip", () => {
    expect(evaluateEntry(candles, iso(250), iso(255), STOCK_DIP)).toMatchObject({ entry: "none", exit: null });
  });

  it("doesn't use prices after the buy to decide the entry", () => {
    // Same history, but the future after bar 260 is wildly different: the entry answer can't change.
    const other = toCandles([...closes.slice(0, 261), 1, 1, 1, 1]);
    expect(evaluateEntry(other, iso(260), null, STOCK_DIP).entry).toBe("dip-day");
  });

  it("calls a sale early when the plan hasn't said sell yet", () => {
    const stillDipping = toCandles(closes.slice(0, 262)); // data ends on the dip's second day
    expect(evaluateEntry(stillDipping, iso(260), iso(261), STOCK_DIP)).toMatchObject({ entry: "dip-day", planExitDate: null, exit: "early" });
  });
});
