export interface SymbolInfo {
  symbol: string;
  name: string;
}

export const MAJOR_INDICES: SymbolInfo[] = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^DJI", name: "Dow Jones Industrial Average" },
  { symbol: "^IXIC", name: "Nasdaq Composite" },
  { symbol: "^RUT", name: "Russell 2000" },
];

// SPDR sector ETFs, used as free proxies for sector-level performance.
export const SECTORS: SymbolInfo[] = [
  { symbol: "XLK", name: "Technology" },
  { symbol: "XLF", name: "Financials" },
  { symbol: "XLV", name: "Health Care" },
  { symbol: "XLY", name: "Consumer Discretionary" },
  { symbol: "XLP", name: "Consumer Staples" },
  { symbol: "XLE", name: "Energy" },
  { symbol: "XLI", name: "Industrials" },
  { symbol: "XLB", name: "Materials" },
  { symbol: "XLU", name: "Utilities" },
  { symbol: "XLRE", name: "Real Estate" },
  { symbol: "XLC", name: "Communication Services" },
];

// Free stock-data sources (Nasdaq included) use their own, older sector
// taxonomy rather than GICS, so sector names don't line up exactly with the
// SPDR ETF names above (e.g. Nasdaq's "Finance" vs. "Financials"). This maps
// by keyword instead of exact match.
const SECTOR_ETF_KEYWORDS: { keywords: string[]; symbol: string }[] = [
  { keywords: ["technology"], symbol: "XLK" },
  { keywords: ["health"], symbol: "XLV" },
  { keywords: ["financ", "bank"], symbol: "XLF" },
  { keywords: ["consumer discretionary", "consumer services", "retail"], symbol: "XLY" },
  { keywords: ["consumer staples", "consumer durables", "consumer non-durables"], symbol: "XLP" },
  { keywords: ["energy"], symbol: "XLE" },
  { keywords: ["industrial", "capital goods", "transportation"], symbol: "XLI" },
  { keywords: ["material", "basic industries"], symbol: "XLB" },
  { keywords: ["utilit"], symbol: "XLU" },
  { keywords: ["real estate"], symbol: "XLRE" },
  { keywords: ["communication", "telecom"], symbol: "XLC" },
];

export function sectorNameToEtf(sectorName: string | null | undefined): SymbolInfo | null {
  if (!sectorName) return null;
  const lower = sectorName.toLowerCase();
  const match = SECTOR_ETF_KEYWORDS.find(({ keywords }) => keywords.some((k) => lower.includes(k)));
  if (!match) return null;
  return SECTORS.find((s) => s.symbol === match.symbol) ?? null;
}
