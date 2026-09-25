import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, POSITION_TTL_MS, isTracked, parseRules, rulesFromCookie, serializeRules } from "./rules";

describe("parseRules", () => {
  it("returns the defaults for junk", () => {
    for (const junk of [null, undefined, 42, "x", [], { minWeeks: "3" }]) {
      expect(parseRules(junk)).toEqual(DEFAULT_RULES);
    }
  });

  it("keeps valid choices and rejects out-of-range ones", () => {
    const r = parseRules({ minWeeks: 4, maxWeeks: 6, earnings: "block", strikeStyle: "deeper", maxLossPerTrade: 250.4, stockDipDepth: "normal" });
    expect(r).toMatchObject({ minWeeks: 4, maxWeeks: 6, earnings: "block", strikeStyle: "deeper", maxLossPerTrade: 250, stockDipDepth: "normal" });
    expect(parseRules({ minWeeks: 6, maxWeeks: 4 }).maxWeeks).toBeGreaterThan(6);
    expect(parseRules({ maxLossPerTrade: -5 }).maxLossPerTrade).toBeNull();
    expect(parseRules({ earnings: "sometimes" }).earnings).toBe("warn");
  });

  it("drops stale or malformed tracked positions", () => {
    const now = 1_800_000_000_000;
    const r = parseRules(
      {
        positions: [
          { symbol: "AMD", signalTime: 1, markedAt: now - 1000 },
          { symbol: "OLD", signalTime: 1, markedAt: now - POSITION_TTL_MS - 1 },
          { symbol: "<script>", signalTime: 1, markedAt: now },
          { symbol: "MSFT" },
        ],
      },
      now,
    );
    expect(r.positions.map((p) => p.symbol)).toEqual(["AMD"]);
    expect(isTracked(r, "AMD", 1)).toBe(true);
    expect(isTracked(r, "AMD", 2)).toBe(true); // same New York trading day as 1
    expect(isTracked(r, "AMD", 1 + 3 * 86400)).toBe(false);
  });

  it("round-trips through the cookie format and survives a corrupt cookie", () => {
    const r = parseRules({ maxLossPerTrade: 500, alerts: { newDip: true } });
    expect(rulesFromCookie(serializeRules(r))).toEqual(r);
    expect(rulesFromCookie("%E0%A4%A")).toEqual(DEFAULT_RULES);
  });
});
