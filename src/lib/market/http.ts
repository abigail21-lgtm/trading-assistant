// Shared across all the free, keyless data sources this app scrapes
// (Yahoo Finance, Nasdaq, StockTwits). All of them are more reliable with a
// browser-like User-Agent than with fetch's default.
export const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "application/json",
};

// SEC EDGAR's fair-use policy requires a descriptive User-Agent identifying
// the application and a contact address, not a spoofed browser UA.
export const SEC_HEADERS = {
  "User-Agent": "MarketDesk (personal project; contact: abigailbowes21@gmail.com)",
  Accept: "application/json",
};

/**
 * An AbortSignal that fires after `ms` milliseconds, for bounding how long a
 * fetch to one of these free upstream sources can hang. Built from a plain
 * AbortController + setTimeout rather than the native `AbortSignal.timeout`
 * (Node 17.3+) -- this codebase can't confirm which Node version Netlify's
 * deployed function runtime actually uses, and this version works
 * identically everywhere with no compatibility risk.
 */
export function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}
