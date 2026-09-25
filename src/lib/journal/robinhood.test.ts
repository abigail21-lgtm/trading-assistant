import { describe, expect, it } from "vitest";
import {
  buildOptionTrades,
  mergeTransactions,
  parseCsv,
  parseMoney,
  parseOptionDescription,
  parseQuantity,
  parseRobinhoodCsv,
} from "./robinhood";

// Built from the documented format: newest-first rows, an Account Type
// column, a two-line stock description, an expiry with "2S", and the
// disclaimer paragraph after the last row.
const SAMPLE = `"Activity Date","Process Date","Settle Date","Account Type","Instrument","Description","Trans Code","Quantity","Price","Amount"
"9/24/2026","9/24/2026","9/25/2026","Margin","AMD","AMD 10/31/2026 Call $140.00","STC","2","$13.25","$2,649.96"
"9/22/2026","9/22/2026","9/23/2026","Margin","AMD","AMD 10/31/2026 Call $140.00","BTO","2","$12.15","($2,430.04)"
"9/19/2026","9/19/2026","9/19/2026","Margin","LULU","Option Expiration for LULU 9/18/2026 Call $310.00","OEXP","2S","",""
"9/10/2026","9/10/2026","9/11/2026","Margin","LULU","LULU 9/18/2026 Call $310.00","BTO","2","$1.50","($300.08)"
"9/09/2026","9/09/2026","9/10/2026","Margin","IWM","IWM 9/12/2026 Put $232.00","STC","2","$3.37","$673.72"
"9/08/2026","9/08/2026","9/09/2026","Margin","IWM","IWM 9/12/2026 Put $232.00","STC","2","$1.00","$199.92"
"9/05/2026","9/05/2026","9/08/2026","Margin","IWM","IWM 9/12/2026 Put $232.00","BTO","4","$2.12","($848.27)"
"9/03/2026","9/03/2026","9/05/2026","Margin","AAPL","Apple
CUSIP: 037833100","Buy","1.5","$230.00","($345.00)"
"9/01/2026","9/01/2026","9/01/2026","Margin","","ACH Deposit","ACH","","","$5,000.00"



"The data provided is for informational purposes only. Please consult a professional tax service or personal tax advisor if you need instructions on how to calculate cost basis or questions regarding your specific tax situation. Reminder: This data does not include Robinhood Crypto or Robinhood Spending transactions."
`;

describe("CSV basics", () => {
  it("handles quoted commas, newlines and doubled quotes", () => {
    expect(parseCsv('a,"b,c","d\ne","f""g"\n1,2,3,4')).toEqual([
      ["a", "b,c", "d\ne", 'f"g'],
      ["1", "2", "3", "4"],
    ]);
  });

  it("reads Robinhood money and quantities", () => {
    expect(parseMoney("($2,430.04)")).toBe(-2430.04);
    expect(parseMoney("$2,649.96")).toBe(2649.96);
    expect(parseMoney("")).toBeNull();
    expect(parseQuantity("2S")).toBe(2);
    expect(parseQuantity("0.810399")).toBeCloseTo(0.810399);
  });

  it("reads option descriptions, including expirations", () => {
    expect(parseOptionDescription("IWM 6/12/2026 Put $232.00")).toEqual({ underlying: "IWM", expiry: "2026-06-12", type: "Put", strike: 232 });
    expect(parseOptionDescription("Option Expiration for LULU 4/16/2026 Call $1,310.00")?.strike).toBe(1310);
    expect(parseOptionDescription("Apple CUSIP: 037833100")).toBeNull();
  });
});

describe("parseRobinhoodCsv", () => {
  it("reads every transaction row and skips the disclaimer", () => {
    const res = parseRobinhoodCsv(SAMPLE);
    expect(res.error).toBeNull();
    expect(res.transactions).toHaveLength(9);
    expect(res.skippedRows).toBe(1);
    expect(res.transactions[7]).toMatchObject({ code: "BUY", instrument: "AAPL", description: "Apple CUSIP: 037833100", quantity: 1.5 });
  });

  it("explains a file that isn't a Robinhood report", () => {
    expect(parseRobinhoodCsv("Date,Symbol\n1/1/2026,AMD").error).toMatch(/Robinhood activity report/);
  });
});

describe("buildOptionTrades", () => {
  const { trades, otherCount } = buildOptionTrades(parseRobinhoodCsv(SAMPLE).transactions);
  const bySymbol = (s: string) => trades.find((t) => t.contract.underlying === s)!;

  it("rebuilds a simple round trip", () => {
    const amd = bySymbol("AMD");
    expect(amd).toMatchObject({ side: "long", openDate: "2026-09-22", closeDate: "2026-09-24", contracts: 2, closeReason: "sold", holdDays: 2 });
    expect(amd.pnl).toBeCloseTo(219.92);
    expect(amd.pnlPct).toBeCloseTo((219.92 / 2430.04) * 100);
    expect(amd.daysToExpiryAtOpen).toBe(39);
  });

  it("keeps partial sells in one trade", () => {
    const iwm = bySymbol("IWM");
    expect(iwm.contracts).toBe(4);
    expect(iwm.closeDate).toBe("2026-09-09");
    expect(iwm.pnl).toBeCloseTo(673.72 + 199.92 - 848.27);
  });

  it("treats an expiry as a total loss for a long call", () => {
    const lulu = bySymbol("LULU");
    expect(lulu.closeReason).toBe("expired");
    expect(lulu.pnl).toBeCloseTo(-300.08);
    expect(lulu.pnlPct).toBeCloseTo(-100);
  });

  it("counts non-option rows separately", () => {
    expect(trades).toHaveLength(3);
    expect(otherCount).toBe(2);
  });

  it("leaves a trade open until it's closed, and merges a later export without double counting", () => {
    const [openOnly] = [parseRobinhoodCsv(SAMPLE).transactions.filter((t) => !(t.code === "STC" && t.instrument === "AMD"))];
    expect(buildOptionTrades(openOnly).trades.find((t) => t.contract.underlying === "AMD")!.closeDate).toBeNull();
    const all = parseRobinhoodCsv(SAMPLE).transactions;
    const { merged, added } = mergeTransactions(openOnly, all);
    expect(added).toBe(1);
    expect(buildOptionTrades(merged).trades.find((t) => t.contract.underlying === "AMD")!.closeReason).toBe("sold");
  });
});
