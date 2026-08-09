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
