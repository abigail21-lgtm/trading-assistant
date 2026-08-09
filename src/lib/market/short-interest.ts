import { BROWSER_HEADERS } from "./http";

export interface ShortInterestEntry {
  settlementDate: number; // unix seconds
  interest: number;
  avgDailyShareVolume: number;
  daysToCover: number;
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const n = parseFloat(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseSettlementDate(raw: string): number | null {
  const [month, day, year] = raw.split("/").map(Number);
  if (!month || !day || !year) return null;
  return Math.floor(Date.UTC(year, month - 1, day) / 1000);
}

/** Bi-monthly short-interest settlement history, most recent first. */
export async function getShortInterestHistory(symbol: string): Promise<ShortInterestEntry[]> {
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol)}/short-interest?assetclass=stocks`;
  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS, next: { revalidate: 21600 } });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any;
  try {
    json = await res.json();
  } catch {
    return [];
  }

  const rows: unknown[] = json?.data?.shortInterestTable?.rows ?? [];
  return rows
    .map((raw): ShortInterestEntry | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      const settlementDate = typeof r.settlementDate === "string" ? parseSettlementDate(r.settlementDate) : null;
      const interest = parseNumber(r.interest);
      const avgDailyShareVolume = parseNumber(r.avgDailyShareVolume);
      const daysToCover = parseNumber(r.daysToCover);
      if (settlementDate == null || interest == null || avgDailyShareVolume == null || daysToCover == null) {
        return null;
      }
      return { settlementDate, interest, avgDailyShareVolume, daysToCover };
    })
    .filter((e): e is ShortInterestEntry => e !== null);
}

// Days-to-cover (aka short interest ratio) above this is the common
// convention for "elevated" — it'd take this many days of average volume to
// unwind every short position, which is what drives squeeze risk.
export const NOTABLE_DAYS_TO_COVER = 3;

// How many recent settlement periods (roughly semi-monthly) to look back
// across when deciding whether elevated interest is fresh or has persisted.
const LOOKBACK_PERIODS = 4;

export type ShortInterestStatus = "new" | "established";

export interface ShortInterestSummary {
  status: ShortInterestStatus;
  latest: ShortInterestEntry;
  history: ShortInterestEntry[];
}

/** Only returns a summary when short interest is actually notable — this is
 * meant to be a flag surfaced occasionally, not an always-on stat. */
export function summarizeShortInterest(rows: ShortInterestEntry[]): ShortInterestSummary | null {
  if (rows.length === 0) return null;
  const [latest, ...rest] = rows;
  if (latest.daysToCover < NOTABLE_DAYS_TO_COVER) return null;

  const priorWindow = rest.slice(0, LOOKBACK_PERIODS - 1);
  const priorElevatedCount = priorWindow.filter((r) => r.daysToCover >= NOTABLE_DAYS_TO_COVER).length;
  const status: ShortInterestStatus =
    priorWindow.length > 0 && priorElevatedCount >= Math.ceil(priorWindow.length / 2) ? "established" : "new";

  return { status, latest, history: rows.slice(0, LOOKBACK_PERIODS) };
}
