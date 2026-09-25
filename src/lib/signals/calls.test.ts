import { describe, expect, it } from "vitest";
import { bsCall, chooseExpirations, contractsForMaxLoss, gradeCalls, type OptionQuote } from "./calls";

const DAY = 86400;
const NOW = 1_800_000_000;

function chain(price: number, vol: number, days: number, opts: { spread?: number; oi?: number } = {}): OptionQuote[] {
  const out: OptionQuote[] = [];
  for (let k = Math.round((price * 0.75) / 5) * 5; k <= price * 1.1; k += 5) {
    const fair = bsCall(price, k, days / 365, vol);
    const half = (opts.spread ?? 0.04) * fair / 2;
    out.push({ strike: k, bid: fair - half, ask: fair + half, impliedVolatility: vol, openInterest: opts.oi ?? 500, volume: 50 });
  }
  return out;
}

describe("bsCall", () => {
  it("matches a textbook value and respects bounds", () => {
    // S=100, K=100, 1y, 20% vol, r=5%: 10.45
    expect(bsCall(100, 100, 1, 0.2, 0.05)).toBeCloseTo(10.45, 1);
    expect(bsCall(120, 100, 0, 0.3)).toBe(20);
    expect(bsCall(150, 100, 0.1, 0.3)).toBeGreaterThan(50);
  });
});

describe("gradeCalls", () => {
  const scenario = { price: 150, bouncePrice: 153, slidePrice: 145.5, badPrice: 135, holdDays: 3 };

  it("picks a liquid strike a few percent in the money, and never an out-of-the-money one", () => {
    const res = gradeCalls(chain(150, 0.4, 35), scenario, NOW + 35 * DAY, NOW);
    expect(res.pickIndex).not.toBeNull();
    const pick = res.rows[res.pickIndex!];
    expect(pick.strike).toBe(140);
    expect(pick.grade).toBe("good");
    expect(pick.tag).toBe("Best balance");
    for (const r of res.rows) if (r.strike > 150) expect(r.grade).toBe("avoid");
  });

  it("estimates a gain on the bounce and a loss on the slide", () => {
    const res = gradeCalls(chain(150, 0.4, 35), scenario, NOW + 35 * DAY, NOW);
    for (const r of res.rows) {
      expect(r.slideDollars).toBeLessThan(0);
      expect(r.bounceDollars).toBeLessThan(r.cost);
    }
    const pick = res.rows[res.pickIndex!];
    expect(pick.bounceDollars).toBeGreaterThan(0);
    expect(pick.bouncePct).toBeCloseTo((pick.bounceDollars / pick.cost) * 100);
  });

  it("downgrades wide spreads and thin contracts, and picks nothing when nothing fits", () => {
    const wide = gradeCalls(chain(150, 0.4, 35, { spread: 0.3 }), scenario, NOW + 35 * DAY, NOW);
    expect(wide.pickIndex).toBeNull();
    expect(wide.rows.filter((r) => r.strike <= 150).every((r) => r.grade === "caution")).toBe(true);
    const thin = gradeCalls(chain(150, 0.4, 35, { oi: 5 }), scenario, NOW + 35 * DAY, NOW);
    expect(thin.rows.every((r) => r.grade === "avoid")).toBe(true);
  });
});

describe("chooseExpirations", () => {
  it("picks dates near 3, 5 and 8 weeks, skipping anything under 2 weeks", () => {
    const weekly = Array.from({ length: 12 }, (_, i) => NOW + (i + 1) * 7 * DAY);
    const picked = chooseExpirations(weekly, NOW).map((e) => Math.round((e - NOW) / DAY));
    expect(picked).toEqual([21, 35, 56]);
  });

  it("dedupes when few dates exist", () => {
    const sparse = [NOW + 5 * DAY, NOW + 30 * DAY];
    expect(chooseExpirations(sparse, NOW).map((e) => Math.round((e - NOW) / DAY))).toEqual([30]);
  });
});

describe("row count", () => {
  it("shows at most 7 strikes across the band and keeps the pick", () => {
    // $1 strikes on a $600 stock: dozens in the band.
    const many: OptionQuote[] = [];
    for (let k = 500; k <= 640; k += 1) {
      const fair = bsCall(600, k, 35 / 365, 0.5);
      many.push({ strike: k, bid: fair * 0.99, ask: fair * 1.01, impliedVolatility: 0.5, openInterest: 500, volume: 10 });
    }
    const res = gradeCalls(many, { price: 600, bouncePrice: 612, slidePrice: 582, badPrice: 540, holdDays: 3 }, NOW + 35 * DAY, NOW);
    expect(res.rows.length).toBe(7);
    expect(res.pickIndex).not.toBeNull();
    expect(res.rows[res.pickIndex!].strike).toBe(570);
    expect(res.rows[0].strike).toBeLessThan(540);
    expect(res.rows.at(-1)!.strike).toBeGreaterThan(600);
  });
});

describe("user rules", () => {
  const scenario = { price: 150, bouncePrice: 153, slidePrice: 145.5, badPrice: 135, holdDays: 3 };

  it("moves the pick with the strike style", () => {
    // $300 stock with $5 strikes, so 2% / 5% / 8% in the money land on different strikes.
    const s300 = { price: 300, bouncePrice: 306, slidePrice: 291, badPrice: 270, holdDays: 3 };
    const pickFor = (style: "deeper" | "balanced" | "closer") => {
      const res = gradeCalls(chain(300, 0.4, 35), s300, NOW + 35 * DAY, NOW, style);
      return res.rows[res.pickIndex!].strike;
    };
    expect(pickFor("deeper")).toBe(275);
    expect(pickFor("balanced")).toBe(285);
    expect(pickFor("closer")).toBe(295);
  });

  it("sizes contracts from the bad-case loss", () => {
    const res = gradeCalls(chain(150, 0.4, 35), scenario, NOW + 35 * DAY, NOW);
    const pick = res.rows[res.pickIndex!];
    expect(pick.badDollars).toBeLessThan(pick.slideDollars);
    expect(contractsForMaxLoss(1000, -300)).toBe(3);
    expect(contractsForMaxLoss(200, -300)).toBe(0);
  });

  it("keeps expirations inside the chosen range", () => {
    const weekly = Array.from({ length: 16 }, (_, i) => NOW + (i + 1) * 7 * DAY);
    const picked = chooseExpirations(weekly, NOW, 2, 4).map((e) => Math.round((e - NOW) / DAY));
    expect(picked).toEqual([14, 21, 28]);
    expect(chooseExpirations(weekly, NOW, 5, 12).map((e) => Math.round((e - NOW) / DAY))).toEqual([35, 56, 84]); // 8.5 weeks is a tie between 8 and 9; the earlier wins
  });
});
