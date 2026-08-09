import { BROWSER_HEADERS } from "./http";

export interface EarningsEvent {
  symbol: string;
  name: string;
  date: string; // "YYYY-MM-DD"
  time: "pre-market" | "after-hours" | "time-not-supplied" | string;
  epsForecast: number | null;
}

// How far ahead the calendar looks. Every caller uses this same constant so
// they all hit the same cached per-date fetches instead of each requesting
// their own window.
export const EARNINGS_WINDOW_DAYS = 30;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseEpsForecast(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const n = parseFloat(raw.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function fetchEarningsForDate(dateStr: string): Promise<EarningsEvent[]> {
  const url = `https://api.nasdaq.com/api/calendar/earnings?date=${dateStr}`;
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

  const rows: unknown[] = json?.data?.rows ?? [];
  return rows
    .map((raw): EarningsEvent | null => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = raw as any;
      if (!r.symbol) return null;
      return {
        symbol: String(r.symbol).toUpperCase(),
        name: r.name ?? r.symbol,
        date: dateStr,
        time: typeof r.time === "string" ? r.time.replace(/^time-/, "") : "unknown",
        epsForecast: parseEpsForecast(r.epsForecast),
      };
    })
    .filter((e): e is EarningsEvent => e !== null);
}

/** All earnings events over the next EARNINGS_WINDOW_DAYS days, chronological. */
export async function getEarningsCalendar(): Promise<EarningsEvent[]> {
  const today = new Date();
  const dates = Array.from({ length: EARNINGS_WINDOW_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() + i);
    return toDateStr(d);
  });

  const results = await Promise.allSettled(dates.map((d) => fetchEarningsForDate(d)));
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// Threshold for flagging earnings as "close" — options priced now can
// reprice sharply once IV crushes after the print, so this is meant to
// catch trades that would run into that.
export const EARNINGS_PROXIMITY_DAYS = 5;

export function earningsDateToUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

/** Integer calendar days from today (UTC) to the given date, ignoring
 * time-of-day so it doesn't drift as the current day progresses. */
export function daysUntil(dateStr: string): number {
  const msPerDay = 86_400_000;
  const now = new Date();
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetUTC = new Date(`${dateStr}T00:00:00Z`).getTime();
  return Math.round((targetUTC - todayUTC) / msPerDay);
}

export async function getNextEarnings(symbol: string): Promise<EarningsEvent | null> {
  const all = await getEarningsCalendar();
  const upper = symbol.toUpperCase();
  return all.find((e) => e.symbol === upper) ?? null;
}

/** Earliest upcoming earnings date per symbol, for a watchlist rollup. */
export async function getUpcomingEarningsForSymbols(
  symbols: string[],
): Promise<Map<string, EarningsEvent>> {
  const wanted = new Set(symbols.map((s) => s.toUpperCase()));
  const all = await getEarningsCalendar();
  const bySymbol = new Map<string, EarningsEvent>();
  for (const e of all) {
    if (wanted.has(e.symbol) && !bySymbol.has(e.symbol)) {
      bySymbol.set(e.symbol, e);
    }
  }
  return bySymbol;
}
