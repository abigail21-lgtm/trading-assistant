import { describe, expect, it } from "vitest";
import { STOCK_DIP, type DipEvaluation } from "./dip";
import { gradeDip } from "./dip-grade";
import type { StrikeRow } from "./calls";

const base: DipEvaluation = {
  status: "signal",
  params: STOCK_DIP,
  price: 146.2,
  aboveTrend: true,
  avg200: 128.4,
  rsi2: 4,
  buyZone: null,
  sellPrice: 149.61,
  trade: null,
  holdDay: 1,
  signalTime: 0,
  downDays: 3,
  dropPct: -4.5,
  lastBarIsLive: false,
};
const earnings = (daysAway: number) => ({ daysAway, label: "Nov 4", estimated: false });
const pick = { strike: 140 } as StrikeRow;

describe("gradeDip", () => {
  it("is GO for a dip in an uptrend with earnings well away and a good call", () => {
    const g = gradeDip({ symbol: "AMD", evaluation: base, earnings: earnings(40), daysToExpiry: 36, pick });
    expect(g.grade).toBe("go");
    expect(g.reason).toBe("AMD fell 4.5% in 3 days, but it's still above its 200-day average, so the long-term trend is up.");
  });

  it("spells out an earnings warning inside the hold window", () => {
    const g = gradeDip({ symbol: "MSFT", evaluation: base, earnings: earnings(3) });
    expect(g.grade).toBe("caution");
    expect(g.reason).toMatch(/^A good dip, but earnings are in 3 days\. .*Use caution\.$/);
  });

  it("follows the user's earnings rule", () => {
    expect(gradeDip({ symbol: "X", evaluation: base, earnings: earnings(3), rules: { earnings: "block" } }).grade).toBe("pass");
    expect(gradeDip({ symbol: "X", evaluation: base, earnings: earnings(3), rules: { earnings: "ignore" } }).grade).toBe("go");
  });

  it("notes earnings before expiry but after the hold without downgrading", () => {
    const g = gradeDip({ symbol: "X", evaluation: base, earnings: earnings(20), daysToExpiry: 36, pick });
    expect(g.grade).toBe("go");
    expect(g.checks.find((c) => c.title.startsWith("Earnings"))!.detail).toMatch(/sell before then/);
  });

  it("warns when no call fits", () => {
    expect(gradeDip({ symbol: "X", evaluation: base, earnings: earnings(40), pick: null }).grade).toBe("caution");
  });

  it("is PASS for a hard drop below the 200-day average, and ungraded with no dip", () => {
    const down = gradeDip({ symbol: "INTC", evaluation: { ...base, status: "none", aboveTrend: false }, earnings: null });
    expect(down.grade).toBe("pass");
    expect(down.reason).toMatch(/below its 200-day average/);
    const near = gradeDip({
      symbol: "NVDA",
      evaluation: { ...base, status: "none", price: 185, rsi2: 60, buyZone: { ceiling: 180.5, trendFloor: 150 } },
      earnings: null,
    });
    expect(near.grade).toBeNull();
    expect(near.reason).toBe("Close to one: a close at or below $180.50 would count as a dip.");
    const far = gradeDip({
      symbol: "NVDA",
      evaluation: { ...base, status: "none", price: 220, rsi2: 60, buyZone: { ceiling: 180.5, trendFloor: 150 } },
      earnings: null,
    });
    expect(far.reason).toBe("The long-term trend is up. Waiting for a sharp 1–3 day drop.");
  });

  it("tells a holder today's sell price, and to sell on the last day", () => {
    const day2 = gradeDip({ symbol: "AMD", evaluation: { ...base, status: "holding", holdDay: 2 }, earnings: null });
    expect(day2.reason).toBe("Sell if AMD closes above $149.61 today.");
    const day5 = gradeDip({ symbol: "AMD", evaluation: { ...base, status: "holding", holdDay: 5 }, earnings: null });
    expect(day5.reason).toMatch(/sell at today's close/);
  });
});

describe("session wording", () => {
  it("names the next trading day when the market is closed", () => {
    const g = gradeDip({ symbol: "MDT", evaluation: { ...base, status: "holding", holdDay: 2 }, earnings: null, session: "Mon" });
    expect(g.reason).toBe("Sell if MDT closes above $149.61 on Mon.");
  });
});
