// Grades call strikes for a dip trade and picks one. Pure: takes an option
// chain (from lib/market/options.ts) and prices, returns rows for the UI.
//
// Estimates are Black-Scholes values using the at-the-money implied
// volatility for every strike (Yahoo's per-strike IV is unreliable deep in
// the money), with a quarter of the bid/ask spread paid on the way in and
// again on the way out. They're estimates, not quotes.

import type { StrikeStyle } from "./rules";

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
  /** Estimated result per contract in the bad case (sizing uses this). */
  badDollars: number;
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
  /** A further 3% slide, shown on every strike. */
  slidePrice: number;
  /** A bad case for sizing, e.g. as far as this stock's worst past dip went. */
  badPrice: number;
  /** Calendar days the scenarios assume the call is held. */
  holdDays: number;
}

const RATE = 0.04;
/**
 * In-the-money bands that suit small, quick moves, per strike style: how far
 * in the money a GOOD strike can be, and where the pick aims.
 */
const STYLE_BANDS: Record<StrikeStyle, { min: number; max: number; target: number }> = {
  deeper: { min: 0.05, max: 0.14, target: 0.08 },
  balanced: { min: 0.02, max: 0.1, target: 0.05 },
  closer: { min: 0, max: 0.06, target: 0.02 },
};
const MAX_GOOD_SPREAD = 0.1;
const MIN_GOOD_OPEN_INTEREST = 100;
/** Strikes shown: from at least this far in the money... */
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

function gradeStrike(
  q: OptionQuote,
  price: number,
  spreadPct: number,
  band: { min: number; max: number },
): { grade: StrikeGrade; tag: string } {
  const itm = (price - q.strike) / price;
  if (q.bid <= 0 || q.openInterest < 10) return { grade: "avoid", tag: "Hardly trades" };
  if (q.strike > price) return { grade: "avoid", tag: "Out of the money; needs a bigger bounce" };
  if (spreadPct > MAX_GOOD_SPREAD) return { grade: "caution", tag: "Wide gap between buy and sell prices" };
  if (itm < band.min) return { grade: "caution", tag: itm < 0.02 ? "At the money, loses value faster" : "Less in the money than your rules prefer" };
  if (itm > band.max) return { grade: "caution", tag: "Deep in the money, costs the most" };
  if (q.openInterest < MIN_GOOD_OPEN_INTEREST) return { grade: "caution", tag: "Few open contracts" };
  return { grade: "good", tag: "Good balance" };
}

export function gradeCalls(
  chain: OptionQuote[],
  scenario: Scenario,
  expiration: number,
  now: number = Date.now() / 1000,
  style: StrikeStyle = "balanced",
): CallsForExpiry {
  const band = STYLE_BANDS[style];
  const bandItm = Math.max(BAND_ITM, band.max + 0.02);
  const daysToExpiry = Math.max(0, Math.round((expiration - now) / 86400));
  const vol = atTheMoneyVol(chain, scenario.price);
  const T1 = Math.max(0, daysToExpiry - scenario.holdDays) / 365;
  const rows: StrikeRow[] = [];
  if (vol == null) return { expiration, daysToExpiry, rows, pickIndex: null };

  for (const q of chain) {
    if (q.strike < scenario.price * (1 - bandItm) || q.strike > scenario.price * (1 + BAND_OTM)) continue;
    const mid = q.bid > 0 && q.ask > 0 ? (q.bid + q.ask) / 2 : q.ask > 0 ? q.ask : 0;
    if (mid <= 0) continue;
    const spread = Math.max(0, q.ask - q.bid);
    const spreadPct = spread / mid;
    const paid = mid + spread / 4;
    const exitValue = (S: number) => Math.max(0, bsCall(S, q.strike, T1, vol) - spread / 4);
    const bounce = exitValue(scenario.bouncePrice);
    const slide = exitValue(scenario.slidePrice);
    const bad = exitValue(scenario.badPrice);
    const { grade, tag } = gradeStrike(q, scenario.price, spreadPct, band);
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
      badDollars: (bad - paid) * 100,
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
      const d = (x: StrikeRow) => Math.abs((scenario.price - x.strike) / scenario.price - band.target);
      return d(cur.r) < d(best.r) ? cur : best;
    }).i;
    rows[pickIndex] = { ...rows[pickIndex], tag: "Best balance" };
  }
  return { expiration, daysToExpiry, ...thin(rows, pickIndex, MAX_ROWS) };
}

/**
 * Up to three expirations inside the user's range: near its start, middle
 * and end. Returns them in date order, without duplicates.
 */
export function chooseExpirations(
  expirations: number[],
  now: number = Date.now() / 1000,
  minWeeks = 3,
  maxWeeks = 8,
): number[] {
  const days = (e: number) => (e - now) / 86400;
  const inRange = expirations.filter((e) => days(e) >= minWeeks * 7 - 3 && days(e) <= maxWeeks * 7 + 3).sort((a, b) => a - b);
  const picks = new Set<number>();
  for (const targetDays of [minWeeks * 7, ((minWeeks + maxWeeks) / 2) * 7, maxWeeks * 7]) {
    const best = inRange.reduce<number | null>(
      (b, e) => (b == null || Math.abs(days(e) - targetDays) < Math.abs(days(b) - targetDays) ? e : b),
      null,
    );
    if (best != null) picks.add(best);
  }
  return [...picks].sort((a, b) => a - b);
}

/** How many contracts fit a max loss, given one contract's bad-case loss. */
export function contractsForMaxLoss(maxLoss: number, badDollars: number): number {
  const lossPerContract = Math.max(0, -badDollars);
  if (lossPerContract === 0) return 0;
  return Math.floor(maxLoss / lossPerContract);
}
