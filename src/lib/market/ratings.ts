import { BROWSER_HEADERS } from "./http";

// Best-effort, free consensus data from Nasdaq's public (keyless) site API.
// This is NOT a per-analyst ratings breakdown (buy/hold/sell counts, named
// analysts) — that data is paid-tier everywhere we could find a free option.
// It's a single consensus 1-year price target plus basic company facts.
export interface CompanyFacts {
  symbol: string;
  sector: string | null;
  industry: string | null;
  oneYearTargetPrice: number | null;
  marketCap: number | null;
  annualizedDividend: number | null;
  dividendYieldPercent: number | null;
  exDividendDate: string | null;
  dividendPaymentDate: string | null;
}

function parseNumber(raw: string | undefined): number | null {
  if (!raw || raw === "N/A") return null;
  const n = parseFloat(raw.replace(/[$,%]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseString(raw: string | undefined): string | null {
  return raw && raw !== "N/A" ? raw : null;
}

export async function getCompanyFacts(
  symbol: string,
  revalidateSeconds = 3600,
): Promise<CompanyFacts | null> {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/summary?assetclass=stocks`;

  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: revalidateSeconds } });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = await res.json();
  } catch {
    return null;
  }

  const s = json?.data?.summaryData;
  if (!s) return null;

  return {
    symbol: json.data.symbol ?? symbol,
    sector: parseString(s.Sector?.value),
    industry: parseString(s.Industry?.value),
    oneYearTargetPrice: parseNumber(s.OneYrTarget?.value),
    marketCap: parseNumber(s.MarketCap?.value),
    annualizedDividend: parseNumber(s.AnnualizedDividend?.value),
    dividendYieldPercent: parseNumber(s.Yield?.value),
    exDividendDate: parseString(s.ExDividendDate?.value),
    dividendPaymentDate: parseString(s.DividendPaymentDate?.value),
  };
}
