import { SEC_HEADERS } from "./http";

export interface InsiderFiling {
  filingDate: string; // "YYYY-MM-DD"
  accessionNumber: string;
  documentUrl: string;
}

export interface InsiderActivitySummary {
  windowDays: number;
  count: number;
  filings: InsiderFiling[]; // most recent first, capped
  browseUrl: string;
}

const MAX_FILINGS_SHOWN = 5;

async function getCik(symbol: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch("https://www.sec.gov/files/company_tickers.json", {
      headers: SEC_HEADERS,
      // This file covers every ticker and barely changes day to day.
      next: { revalidate: 86_400 },
      // Larger file than the other endpoints here, hence the longer budget.
      signal: AbortSignal.timeout(10000),
    });
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

  const upper = symbol.toUpperCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entry = Object.values(json ?? {}).find((e: any) => e?.ticker === upper) as
    | { cik_str: number }
    | undefined;
  return entry ? String(entry.cik_str).padStart(10, "0") : null;
}

/** Form 4 filing count + dates over the trailing `windowDays` — deliberately
 * NOT parsed buy/sell/share/price detail. SEC renders that as XSLT-templated
 * HTML rather than clean data, so reliably extracting direction and size
 * would mean fragile scraping of a government template; this sticks to what
 * the submissions API gives cleanly (filing dates + links to the source). */
export async function getInsiderActivity(symbol: string, windowDays = 90): Promise<InsiderActivitySummary | null> {
  const cik = await getCik(symbol);
  if (!cik) return null;

  let res: Response;
  try {
    res = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: SEC_HEADERS,
      next: { revalidate: 21_600 },
      signal: AbortSignal.timeout(8000),
    });
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

  const recent = json?.filings?.recent;
  const forms: string[] = recent?.form ?? [];
  const dates: string[] = recent?.filingDate ?? [];
  const accessions: string[] = recent?.accessionNumber ?? [];
  const primaryDocs: string[] = recent?.primaryDocument ?? [];

  const cutoff = Date.now() - windowDays * 86_400_000;
  const cikNumeric = String(Number(cik));

  const filings: InsiderFiling[] = forms
    .map((form, i): InsiderFiling | null => {
      if (form !== "4") return null;
      const filingDate = dates[i];
      const accessionNumber = accessions[i];
      const primaryDocument = primaryDocs[i];
      if (!filingDate || !accessionNumber || !primaryDocument) return null;
      if (new Date(`${filingDate}T00:00:00Z`).getTime() < cutoff) return null;
      const accessionNoDashes = accessionNumber.replace(/-/g, "");
      return {
        filingDate,
        accessionNumber,
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${cikNumeric}/${accessionNoDashes}/${primaryDocument}`,
      };
    })
    .filter((f): f is InsiderFiling => f !== null)
    .sort((a, b) => b.filingDate.localeCompare(a.filingDate));

  return {
    windowDays,
    count: filings.length,
    filings: filings.slice(0, MAX_FILINGS_SHOWN),
    browseUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=40`,
  };
}
