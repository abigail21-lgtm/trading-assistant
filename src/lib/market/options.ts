import { BROWSER_HEADERS, timeoutSignal } from "./http";
import type { OptionQuote } from "../signals/calls";

// Yahoo's options endpoint, unlike the chart endpoint, wants a session: a
// cookie (handed out by fc.yahoo.com) plus a matching "crumb" token. Both
// are free and keyless; we fetch them once and reuse them for an hour, and
// refresh once if Yahoo rejects them. Prices are delayed ~15 minutes.

const SESSION_TTL_MS = 60 * 60 * 1000;

interface Session {
  cookie: string;
  crumb: string;
  at: number;
}

let session: Session | null = null;

function readSetCookies(res: Response): string[] {
  const h = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === "function") return h.getSetCookie();
  const raw = res.headers.get("set-cookie");
  return raw ? raw.split(/,(?=\s*[A-Za-z0-9_-]+=)/) : [];
}

async function newSession(): Promise<Session> {
  const first = await fetch("https://fc.yahoo.com", {
    headers: BROWSER_HEADERS,
    redirect: "manual",
    cache: "no-store",
    signal: timeoutSignal(8000),
  });
  const cookie = readSetCookies(first)
    .map((c) => c.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
  if (!cookie) throw new Error("Yahoo did not return a session cookie");
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { ...BROWSER_HEADERS, Accept: "text/plain", Cookie: cookie },
    cache: "no-store",
    signal: timeoutSignal(8000),
  });
  const crumb = (await crumbRes.text()).trim();
  if (!crumbRes.ok || !crumb || crumb.includes("<")) throw new Error("Yahoo did not return a crumb");
  return { cookie, crumb, at: Date.now() };
}

async function getSession(forceNew = false): Promise<Session> {
  if (!forceNew && session && Date.now() - session.at < SESSION_TTL_MS) return session;
  session = await newSession();
  return session;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchOptions(symbol: string, expiration?: number): Promise<any> {
  for (const forceNew of [false, true]) {
    const s = await getSession(forceNew);
    const date = expiration ? `&date=${expiration}` : "";
    const url = `https://query2.finance.yahoo.com/v7/finance/options/${encodeURIComponent(symbol)}?crumb=${encodeURIComponent(s.crumb)}${date}`;
    const res = await fetch(url, {
      headers: { ...BROWSER_HEADERS, Cookie: s.cookie },
      // Live-ish data; see the note in yahoo.ts on why nothing here goes
      // through Next's fetch cache.
      cache: "no-store",
      signal: timeoutSignal(8000),
    });
    if (res.status === 401 || res.status === 403) continue; // stale session: retry once with a new one
    if (!res.ok) throw new Error(`Options request for ${symbol} failed (${res.status})`);
    const json = await res.json();
    const result = json?.optionChain?.result?.[0];
    if (!result) throw new Error(`No options data for ${symbol}`);
    return result;
  }
  throw new Error(`Yahoo rejected the options request for ${symbol}`);
}

export interface OptionsOverview {
  expirations: number[];
  /** Yahoo's next earnings date (unix seconds), when it has one. */
  earningsTime: number | null;
  earningsEstimated: boolean;
}

export async function getOptionsOverview(symbol: string): Promise<OptionsOverview> {
  const r = await fetchOptions(symbol);
  const q = r.quote ?? {};
  const now = Date.now() / 1000;
  const start: number | null = q.earningsTimestampStart ?? null;
  return {
    expirations: (r.expirationDates ?? []) as number[],
    earningsTime: start != null && start > now ? start : null,
    earningsEstimated: Boolean(q.isEarningsDateEstimate),
  };
}

export async function getCallChain(symbol: string, expiration: number): Promise<OptionQuote[]> {
  const r = await fetchOptions(symbol, expiration);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calls: any[] = r.options?.[0]?.calls ?? [];
  return calls.map((c) => ({
    strike: c.strike,
    bid: c.bid ?? 0,
    ask: c.ask ?? 0,
    impliedVolatility: c.impliedVolatility ?? 0,
    openInterest: c.openInterest ?? 0,
    volume: c.volume ?? 0,
  }));
}
