import { describe, expect, it } from "vitest";
import type { OptionTrade } from "./robinhood";
import type { EntryEvaluation } from "./evaluate";
import { groupStats, takeaways } from "./stats";

let n = 0;
function trade(pnl: number | null, extra: Partial<OptionTrade> = {}): OptionTrade {
  n++;
  return {
    id: `t${n}`,
    contract: { underlying: "AMD", expiry: "2026-10-31", type: "Call", strike: 140 },
    side: "long",
    openDate: "2026-09-22",
    closeDate: pnl == null ? null : "2026-09-24",
    contracts: 1,
    paid: 1000,
    received: pnl == null ? 0 : 1000 + pnl,
    pnl,
    pnlPct: pnl == null ? null : pnl / 10,
    holdDays: pnl == null ? null : 2,
    closeReason: pnl == null ? null : "sold",
    daysToExpiryAtOpen: 35,
    ...extra,
  };
}
const ev = (entry: EntryEvaluation["entry"], extra: Partial<EntryEvaluation> = {}): EntryEvaluation => ({
  entry,
  aboveTrend: true,
  planExitDate: null,
  exit: null,
  ...extra,
});

describe("groupStats", () => {
  it("counts only closed trades", () => {
    const g = groupStats([trade(100), trade(-50), trade(null)]);
    expect(g).toMatchObject({ closed: 2, wins: 1, totalPnl: 50, avgPnl: 25, avgHoldDays: 2 });
  });
});

describe("takeaways", () => {
  it("compares dip and other calls only when both have enough trades", () => {
    const dips = [trade(100), trade(80), trade(-40)];
    const others = [trade(-100), trade(-60), trade(30)];
    const evals = new Map([...dips.map((t) => [t.id, ev("dip-day")] as const), ...others.map((t) => [t.id, ev("none")] as const)]);
    expect(takeaways([...dips, ...others], evals)[0]).toBe(
      "Calls bought on a dip signal: 2 of 3 made money (+$140 total). Other calls: 1 of 3 made money (−$130 total).",
    );
    const few = new Map([[dips[0].id, ev("dip-day")]]);
    expect(takeaways([dips[0]], few)[0]).toMatch(/Too few trades yet/);
  });

  it("notes late sells, expiries and buys below the 200-day average", () => {
    const dips = [trade(10), trade(20), trade(-5)];
    const below = [trade(-100), trade(-100), trade(50), trade(-1000, { closeReason: "expired" })];
    const evals = new Map([
      ...dips.map((t) => [t.id, ev("day-after", { exit: "late" })] as const),
      ...below.map((t) => [t.id, ev("none", { aboveTrend: false })] as const),
    ]);
    const out = takeaways([...dips, ...below], evals);
    expect(out).toContain("On dip trades you usually held past the plan's sell day (3 of 3).");
    expect(out).toContain("1 call expired worthless (−$1,000).");
    expect(out.some((s) => s.startsWith("4 closed calls were bought while the stock was below its 200-day average"))).toBe(true);
  });
});
