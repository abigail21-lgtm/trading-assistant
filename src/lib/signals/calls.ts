// Grades call strikes for a dip trade and picks one. Pure: takes an option
// chain (from lib/market/options.ts) and prices, returns rows for the UI.
//
// Estimates are Black-Scholes values using the at-the-money implied
// volatility for every strike (Yahoo's per-strike IV is unreliable deep in
// the money), with a quarter of the bid/ask spread paid on the way in and
// again on the way out. They're estimates, not quotes.

export interface OptionQuote {
  strike: number;
  bid: number;
  ask: number;
  impliedVolatility: number;
  openInterest: number;
  volume: number;
}

export type StrikeGrade = "good" | "caution" | "avoid";

export interface StrikeRow {
  strike: number;
  grade: StrikeGrade;
  /** 3-5 word reason. */
  tag: string;
  mid: number;
  /** Estimated cost of one contract ($), at a limit a little above the mid. */
  cost: number;
  bounceDollars: number;
  bouncePct: number;
  slideDollars: number;
  slidePct: number;
  spreadPct: number;
  openInterest: number;
  /** Suggested limit price per share, rounded to $0.05. */
  limitPrice: number;
}

export interface CallsForExpiry {
  expiration: number;
  daysToExpiry: number;
  rows: StrikeRow[];
  /** Index into rows of the suggested strike, or null when none fits. */
  pickIndex: number | null;
}

export interface Scenario {
  /** Underlying price now. */
  price: number;
  /** Where the stock is if the bounce plays out (the sell price). */
  bouncePrice: number;
  /** A further slide, as a bad case. */
  slidePrice: number;
  /** Calendar days the scenarios assume the call is held. */
  holdDays: number;
}

const RATE = 0.04;
/** In-the-money band that suits small, quick moves: enough delta, not the priciest strikes. */
const GOOD_ITM_MIN = 0.02;
const GOOD_ITM_MAX = 0.1;
const TARGET_ITM = 0.05;
const MAX_GOOD_SPREAD = 0.1;
const MIN_GOOD_OPEN_INTEREST = 100;
/** Strikes shown: from this far in the money... */
const BAND_ITM = 0.12;
/** ...to this far out of it. */
const BAND_OTM = 0.03;
const MAX_ROWS = 7;

/**
 * At most `max` rows spread evenly across the band (stocks with $1 or $2.50
 * strikes would otherwise list dozens), always keeping the pick.
 */
function thin(rows: StrikeRow[], pickIndex: number | null, max: number): { rows: StrikeRow[]; pickIndex: number | null } {
  if (rows.length <= max) return { rows, pickIndex };
  const keep = new Set<number>();
  for (let j = 0; j < max; j++) keep.add(Math.round((j * (rows.length - 1)) / (max - 1)));
  if (pickIndex != null && !keep.has(pickIndex)) {
    // Swap out the kept index nearest the pick so the count stays at `max`.
    const nearest = [...keep].reduce((a, b) => (Math.abs(b - pickIndex) < Math.abs(a - pickIndex) ? b : a));
    keep.delete(nearest);
    keep.add(pickIndex);
  }
  const idx = [...keep].sort((a, b) => a - b);
  return { rows: idx.map((i) => rows[i]), pickIndex: pickIndex == null ? null : idx.indexOf(pickIndex) };
}

function normCdf(x: number) {
  // Abramowitz-Stegun 7.1.26, |error| < 1.5e-7
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** Black-Scholes value of a European call (per share). */
export function bsCall(S: number, K: number, years: number, vol: number, r = RATE): number {
  if (years <= 0 || vol <= 0) return Math.max(S - K, 0);
  const sd = vol * Math.sqrt(years);
  const d1 = (Math.log(S / K) + (r + (vol * vol) / 2) * years) / sd;
  return S * normCdf(d1) - K * Math.exp(-r * years) * normCdf(d1 - sd);
}

const roundTo5c = (x: number) => Math.round(x * 20) / 20;

/** IV of the strike closest to the price, ignoring junk values. */
export function atTheMoneyVol(chain: OptionQuote[], price: number): number | null {
  const usable = chain.filter((q) => q.impliedVolatility > 0.03 && q.impliedVolatility < 3 && q.bid > 0);
  if (usable.length === 0) return null;
  return usable.reduce((best, q) => (Math.abs(q.strike - price) < Math.abs(best.strike - price) ? q : best)).impliedVolatility;
}

function gradeStrike(q: OptionQuote, price: number, spreadPct: number): { grade: StrikeGrade; tag: string } {
  const itm = (price - q.strike) / price;
  if (q.bid <= 0 || q.openInterest < 10) return { grade: "avoid", tag: "Hardly trades" };
  if (q.strike > price) return { grade: "avoid", tag: "Out of the money; needs a bigger bounce" };
  if (spreadPct > MAX_GOOD_SPREAD) return { grade: "caution", tag: "Wide gap between buy and sell prices" };
  if (itm < GOOD_ITM_MIN) return { grade: "caution", tag: "At the money, loses value faster" };
  if (itm > GOOD_ITM_MAX) return { grade: "caution", tag: "Deep in the money, costs the most" };
  if (q.openInterest < MIN_GOOD_OPEN_INTEREST) return { grade: "caution", tag: "Few open contracts" };
  return { grade: "good", tag: "Good balance" };
}

export function gradeCalls(
  chain: OptionQuote[],
  scenario: Scenario,
  expiration: number,
  now: number = Date.now() / 1000,
): CallsForExpiry {
  const daysToExpiry = Math.max(0, Math.round((expiration - now) / 86400));
  const vol = atTheMoneyVol(chain, scenario.price);
  const T1 = Math.max(0, daysToExpiry - scenario.holdDays) / 365;
  const rows: StrikeRow[] = [];
  if (vol == null) return { expiration, daysToExpiry, rows, pickIndex: null };

  for (const q of chain) {
    if (q.strike < scenario.price * (1 - BAND_ITM) || q.strike > scenario.price * (1 + BAND_OTM)) continue;
    const mid = q.bid > 0 && q.ask > 0 ? (q.bid + q.ask) / 2 : q.ask > 0 ? q.ask : 0;
    if (mid <= 0) continue;
    const spread = Math.max(0, q.ask - q.bid);
    const spreadPct = spread / mid;
    const paid = mid + spread / 4;
    const exitValue = (S: number) => Math.max(0, bsCall(S, q.strike, T1, vol) - spread / 4);
    const bounce = exitValue(scenario.bouncePrice);
    const slide = exitValue(scenario.slidePrice);
    const { grade, tag } = gradeStrike(q, scenario.price, spreadPct);
    rows.push({
      strike: q.strike,
      grade,
      tag,
      mid,
      cost: paid * 100,
      bounceDollars: (bounce - paid) * 100,
      bouncePct: ((bounce - paid) / paid) * 100,
      slideDollars: (slide - paid) * 100,
      slidePct: ((slide - paid) / paid) * 100,
      spreadPct,
      openInterest: q.openInterest,
      limitPrice: roundTo5c(mid),
    });
  }
  rows.sort((a, b) => a.strike - b.strike);

  const good = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.grade === "good");
  let pickIndex: number | null = null;
  if (good.length > 0) {
    pickIndex = good.reduce((best, cur) => {
      const d = (x: StrikeRow) => Math.abs((scenario.price - x.strike) / scenario.price - TARGET_ITM);
      return d(cur.r) < d(best.r) ? cur : best;
    }).i;
    rows[pickIndex] = { ...rows[pickIndex], tag: "Best balance" };
  }
  return { expiration, daysToExpiry, ...thin(rows, pickIndex, MAX_ROWS) };
}

/**
 * Up to three expirations near 3, 5 and 8 weeks out, each at least
 * `minDays` away. Returns them in date order, without duplicates.
 */
export function chooseExpirations(expirations: number[], now: number = Date.now() / 1000, minDays = 14): number[] {
  const future = expirations.filter((e) => (e - now) / 86400 >= minDays).sort((a, b) => a - b);
  const picks = new Set<number>();
  for (const targetDays of [21, 35, 56]) {
    const best = future.reduce<number | null>(
      (b, e) => (b == null || Math.abs((e - now) / 86400 - targetDays) < Math.abs((b - now) / 86400 - targetDays) ? e : b),
      null,
    );
    if (best != null) picks.add(best);
  }
  return [...picks].sort((a, b) => a - b);
}
