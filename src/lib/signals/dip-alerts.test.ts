import { describe, expect, it } from "vitest";
import { STOCK_DIP, type DipEvaluation, type DipTrade } from "./dip";
import { DEFAULT_RULES, type TradingRules } from "./rules";
import { dueDipAlerts, easternClock, pruneSentLog } from "./dip-alerts";

// Tue Sep 22 2026, 3:30pm EDT = 19:30 UTC.
const at = (hhmm: string, day = "2026-09-22") => Date.parse(`${day}T${hhmm}:00-04:00`);
const signalTime = Date.parse("2026-09-21T13:30:00Z") / 1000; // Mon Sep 21 bar

const openTrade: DipTrade = { signalIndex: 300, exitIndex: null, entry: 100, exit: null, returnPct: null, bars: null, exitReason: null };
const base: DipEvaluation = {
  status: "holding",
  params: STOCK_DIP,
  price: 101,
  aboveTrend: true,
  avg200: 90,
  rsi2: 40,
  buyZone: { ceiling: 97, trendFloor: 90 },
  sellPrice: 100.5,
  trade: openTrade,
  holdDay: 2,
  signalTime,
  downDays: 0,
  dropPct: 0,
  lastBarIsLive: true,
};
const tracking = (r: TradingRules = DEFAULT_RULES): TradingRules => ({
  ...r,
  positions: [{ symbol: "AMD", signalTime, markedAt: Date.now() }],
});

describe("easternClock", () => {
  it("reads New York time", () => {
    expect(easternClock(at("15:30"))).toEqual({ date: "2026-09-22", minutes: 15 * 60 + 30 });
  });
});

describe("dueDipAlerts", () => {
  it("sends a sell alert near the close only for a tracked trade above its sell price", () => {
    expect(dueDipAlerts("AMD", base, tracking(), at("15:30")).map((a) => a.kind)).toEqual(["sell"]);
    expect(dueDipAlerts("AMD", base, DEFAULT_RULES, at("15:30"))).toEqual([]); // not marked as bought
    expect(dueDipAlerts("AMD", base, tracking(), at("14:00"))).toEqual([]); // too early
    expect(dueDipAlerts("AMD", { ...base, price: 99 }, tracking(), at("15:30"))).toEqual([]); // below sell price
  });

  it("reminds on the last day when the sell price wasn't reached", () => {
    const day5 = { ...base, price: 99, holdDay: 5 };
    const alerts = dueDipAlerts("AMD", day5, tracking(), at("15:30"));
    expect(alerts.map((a) => a.kind)).toEqual(["last-day"]);
    expect(alerts[0].key).toBe("AMD:last-day:2026-09-22");
  });

  it("sends a buy-zone alert from 3pm while live and in the zone", () => {
    const zone = { ...base, status: "in-buy-zone" as const, trade: null, price: 96.5 };
    const alerts = dueDipAlerts("AMD", zone, DEFAULT_RULES, at("15:05"));
    expect(alerts.map((a) => a.kind)).toEqual(["buy-zone"]);
    expect(alerts[0].body).toMatch(/at or below \$97\.00/);
    expect(dueDipAlerts("AMD", zone, { ...DEFAULT_RULES, alerts: { ...DEFAULT_RULES.alerts, buyZone: false } }, at("15:05"))).toEqual([]);
  });

  it("sends a closed-in-a-dip alert after the close, only when switched on", () => {
    const closed = { ...base, status: "signal" as const, lastBarIsLive: false, signalTime: Date.parse("2026-09-22T13:30:00Z") / 1000 };
    const on = { ...DEFAULT_RULES, alerts: { ...DEFAULT_RULES.alerts, newDip: true } };
    expect(dueDipAlerts("AMD", closed, on, at("16:20")).map((a) => a.kind)).toEqual(["new-dip"]);
    expect(dueDipAlerts("AMD", closed, DEFAULT_RULES, at("16:20"))).toEqual([]);
    expect(dueDipAlerts("AMD", closed, on, at("16:20", "2026-09-23"))).toEqual([]); // yesterday's dip
  });
});

describe("pruneSentLog", () => {
  it("keeps recent keys only", () => {
    const now = at("12:00");
    expect(pruneSentLog({ a: now - 1000, b: now - 11 * 86_400_000 }, now)).toEqual({ a: now - 1000 });
  });
});
