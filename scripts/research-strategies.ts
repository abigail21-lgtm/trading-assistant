// Tests a short, pre-registered list of bullish swing strategies against a
// random-entry baseline, on ~100 large US stocks and ETFs over 5 years of
// daily data. The rules below were written down before running this -- they
// are deliberately NOT tuned to the results (tuning them to fit this data and
// then reporting the fit would just be curve-fitting the past).
//
//   npx tsx scripts/research-strategies.ts
//
// For every strategy it reports, separately for the first ~3 years and the
// last ~2: trade count, % of winning trades, average stock return, the same
// for random entries with the same exit rule, the difference ("edge") with a
// t-stat, and a rough estimate of what a ~5-week, slightly in-the-money call
// would have returned (Black-Scholes with 20-day realized vol x1.1 as the
// implied vol, 1.5% of premium lost to the bid/ask on each side). The option
// numbers are estimates -- historical option prices aren't free.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candle } from "../src/lib/market/yahoo";
import { sma } from "../src/lib/market/indicators";

const SYMBOLS = (
  "SPY QQQ IWM AAPL MSFT NVDA AMD AMZN GOOGL META TSLA NFLX AVGO CRM ORCL ADBE INTC QCOM MU TXN " +
  "JPM BAC GS MS WFC V MA PYPL XOM CVX COP UNH JNJ PFE LLY MRK ABBV HD LOW WMT COST TGT NKE SBUX " +
  "MCD DIS BA CAT DE GE UBER SHOP COIN ABNB AMAT ANET BKNG BLK C CMCSA COF CSCO CVS DHR DUK F GM " +
  "GILD HON IBM INTU ISRG KO LIN LMT LRCX MDT MMM MO NEE NOW PANW PEP PG PM RTX SCHW SPGI T TMO UNP " +
  "UPS VZ KLAC MRVL SNPS CDNS"
).split(" ");

const cacheDir = join(tmpdir(), "marketdesk-eval-cache");
mkdirSync(cacheDir, { recursive: true });

async function dailyCandles(symbol: string): Promise<Candle[]> {
  const cacheFile = join(cacheDir, `${symbol}-5y.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1d`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const r = json.chart.result[0];
  const q = r.indicators.quote[0];
  const candles: Candle[] = r.timestamp
    .map((t: number, i: number) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] }))
    .filter((c: Candle) => c.open != null && c.high != null && c.low != null && c.close != null);
  writeFileSync(cacheFile, JSON.stringify(candles));
  return candles;
}

// ---------- indicators (all point-in-time: value at i uses bars <= i) ----------

function rsi(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null);
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = Math.max(d, 0);
    const l = Math.max(-d, 0);
    if (i <= period) {
      gain += g / period;
      loss += l / period;
      if (i === period) out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    } else {
      gain = (gain * (period - 1) + g) / period;
      loss = (loss * (period - 1) + l) / period;
      out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
    }
  }
  return out;
}

interface Series {
  symbol: string;
  c: Candle[];
  close: number[];
  sma5: (number | null)[];
  sma200: (number | null)[];
  rsi2: (number | null)[];
  avgVol20: (number | null)[]; // prior 20 bars
  high252: (number | null)[]; // highest close of the prior 251 bars
  ret63: (number | null)[];
  rv20: (number | null)[]; // annualized realized vol, prior 20 returns
  rank63: (number | null)[]; // percentile of ret63 across the universe that day (0..1)
  dayIndex: Map<string, number>;
}

const dayKey = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

function buildSeries(symbol: string, c: Candle[]): Series {
  const close = c.map((x) => x.close);
  const n = c.length;
  const avgVol20: (number | null)[] = new Array(n).fill(null);
  const high252: (number | null)[] = new Array(n).fill(null);
  const ret63: (number | null)[] = new Array(n).fill(null);
  const rv20: (number | null)[] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i >= 20) {
      let s = 0;
      for (let k = i - 20; k < i; k++) s += c[k].volume;
      avgVol20[i] = s / 20;
      const rets: number[] = [];
      for (let k = i - 19; k <= i; k++) rets.push(Math.log(close[k] / close[k - 1]));
      const m = rets.reduce((a, b) => a + b, 0) / rets.length;
      rv20[i] = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
    }
    if (i >= 251) {
      let h = -Infinity;
      for (let k = i - 251; k < i; k++) h = Math.max(h, close[k]);
      high252[i] = h;
    }
    if (i >= 63) ret63[i] = close[i] / close[i - 63] - 1;
  }
  return {
    symbol,
    c,
    close,
    sma5: sma(close, 5),
    sma200: sma(close, 200),
    rsi2: rsi(close, 2),
    avgVol20,
    high252,
    ret63,
    rv20,
    rank63: new Array(n).fill(null),
    dayIndex: new Map(c.map((x, i) => [dayKey(x.time), i])),
  };
}

function fillRanks(all: Series[]) {
  const byDay = new Map<string, { s: Series; i: number; r: number }[]>();
  for (const s of all) {
    s.c.forEach((x, i) => {
      const r = s.ret63[i];
      if (r == null) return;
      const k = dayKey(x.time);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push({ s, i, r });
    });
  }
  for (const rows of byDay.values()) {
    if (rows.length < 20) continue;
    rows.sort((a, b) => a.r - b.r);
    rows.forEach((row, idx) => (row.s.rank63[row.i] = idx / (rows.length - 1)));
  }
}

// ---------- strategies ----------

type ExitRule = (s: Series, entryBar: number) => number; // returns exit bar index (exit at its close), or -1 if not resolved

const timeExit = (bars: number): ExitRule => (s, e) => (e + bars - 1 < s.c.length ? e + bars - 1 : -1);

const sma5Exit: ExitRule = (s, e) => {
  for (let k = e; k < Math.min(s.c.length, e + 5); k++) {
    if (s.sma5[k] != null && s.close[k] > s.sma5[k]!) return k;
  }
  return e + 4 < s.c.length ? e + 4 : -1;
};

interface Strategy {
  name: string;
  plain: string;
  signal: (s: Series, i: number) => boolean;
  exit: ExitRule;
}

const STRATEGIES: Strategy[] = [
  {
    name: "1. Dip in uptrend",
    plain: "Above 200-day avg, 2-day RSI < 10. Sell first close above 5-day avg (max 5 days).",
    signal: (s, i) => s.sma200[i] != null && s.rsi2[i] != null && s.close[i] > s.sma200[i]! && s.rsi2[i]! < 10,
    exit: sma5Exit,
  },
  {
    name: "2. 52-week high + volume",
    plain: "Close at a new 1-year high on 1.5x normal volume. Hold 10 days.",
    signal: (s, i) =>
      s.high252[i] != null && s.avgVol20[i] != null && s.close[i] > s.high252[i]! && s.c[i].volume > 1.5 * s.avgVol20[i]!,
    exit: timeExit(10),
  },
  {
    name: "3. Gap up that holds",
    plain: "Opens 4%+ above yesterday's close on 2x volume, closes in top half of the day. Hold 10 days.",
    signal: (s, i) => {
      if (i < 1 || s.avgVol20[i] == null) return false;
      const b = s.c[i];
      const gap = b.open / s.close[i - 1] - 1;
      const range = b.high - b.low;
      return gap >= 0.04 && b.volume > 2 * s.avgVol20[i]! && range > 0 && (b.close - b.low) / range >= 0.5;
    },
    exit: timeExit(10),
  },
  {
    name: "4. Leader pullback",
    plain: "Top-20% 3-month performer in this list, down 3 closes in a row. Hold 5 days.",
    signal: (s, i) =>
      i >= 3 &&
      s.rank63[i] != null &&
      s.rank63[i]! >= 0.8 &&
      s.close[i] < s.close[i - 1] &&
      s.close[i - 1] < s.close[i - 2] &&
      s.close[i - 2] < s.close[i - 3],
    exit: timeExit(5),
  },
];

// ---------- trade simulation ----------

function normCdf(x: number) {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function bsCall(S: number, K: number, T: number, vol: number, r = 0.04) {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + (r + (vol * vol) / 2) * T) / (vol * Math.sqrt(T));
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d1 - vol * Math.sqrt(T));
}

const HALF_SPREAD = 0.015;

interface Trade {
  stockRet: number;
  optionRet: number;
  time: number;
}

/** Signal on bar i's close; enter next bar's open; exit per rule at a close. */
function simulate(s: Series, i: number, exit: ExitRule): Trade | null {
  const e = i + 1;
  if (e >= s.c.length || s.rv20[i] == null) return null;
  const x = exit(s, e);
  if (x < 0) return null;
  const entry = s.c[e].open;
  const out = s.close[x];
  const vol = Math.max(0.15, s.rv20[i]! * 1.1);
  const K = entry * 0.95;
  const T0 = 35 / 365;
  const heldCalendarDays = ((x - e + 1) * 7) / 5;
  const buy = bsCall(entry, K, T0, vol) * (1 + HALF_SPREAD);
  const sell = bsCall(out, K, T0 - heldCalendarDays / 365, vol) * (1 - HALF_SPREAD);
  return { stockRet: out / entry - 1, optionRet: sell / buy - 1, time: s.c[i].time };
}

// ---------- reporting ----------

function stats(xs: number[]) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1));
  return { n, mean, sd };
}

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;

function report(label: string, trades: Trade[], base: Trade[]) {
  if (trades.length < 5) return `  ${label.padEnd(10)} too few trades (${trades.length})`;
  const t = stats(trades.map((x) => x.stockRet));
  const b = stats(base.map((x) => x.stockRet));
  const edge = t.mean - b.mean;
  const tStat = edge / Math.sqrt((t.sd ** 2) / t.n + (b.sd ** 2) / b.n);
  const win = trades.filter((x) => x.stockRet > 0).length / trades.length;
  const bWin = base.filter((x) => x.stockRet > 0).length / base.length;
  const o = stats(trades.map((x) => x.optionRet));
  const bo = stats(base.map((x) => x.optionRet));
  const oWin = trades.filter((x) => x.optionRet > 0).length / trades.length;
  // Many stocks often signal on the same day (a market-wide dip), so trades
  // aren't independent. Averaging per signal day and testing across days
  // gives a more honest t-stat.
  const byDay = new Map<number, number[]>();
  for (const x of trades) {
    if (!byDay.has(x.time)) byDay.set(x.time, []);
    byDay.get(x.time)!.push(x.stockRet - b.mean);
  }
  const d = stats([...byDay.values()].map((v) => v.reduce((a, c) => a + c, 0) / v.length));
  const dayT = d.mean / (d.sd / Math.sqrt(d.n));
  return (
    `  ${label.padEnd(10)}${String(t.n).padStart(6)}${String(d.n).padStart(6)}` +
    `${pct(win, 0).padStart(8)}${pct(bWin, 0).padStart(8)}` +
    `${pct(t.mean).padStart(9)}${pct(b.mean).padStart(9)}${pct(edge).padStart(9)}${tStat.toFixed(1).padStart(7)}${dayT.toFixed(1).padStart(7)}` +
    `${pct(o.mean, 1).padStart(10)}${pct(bo.mean, 1).padStart(10)}${pct(oWin, 0).padStart(8)}`
  );
}

async function main() {
  const all: Series[] = [];
  for (const symbol of SYMBOLS) {
    try {
      all.push(buildSeries(symbol, await dailyCandles(symbol)));
    } catch (err) {
      console.error(`skip ${symbol}: ${(err as Error).message}`);
    }
  }
  fillRanks(all);

  const spy = all.find((s) => s.symbol === "SPY")!;
  const splitTime = spy.c[Math.floor(spy.c.length * 0.6)].time;
  console.log(
    `${all.length} symbols, ${dayKey(spy.c[0].time)} to ${dayKey(spy.c.at(-1)!.time)}. ` +
      `Period A = before ${dayKey(splitTime)}, period B = after.\n`,
  );
  console.log(
    "  " + "period".padEnd(10) + "trades".padStart(6) + "days".padStart(6) + "win%".padStart(8) + "rand".padStart(8) +
      "avg ret".padStart(9) + "rand".padStart(9) + "edge".padStart(9) + "t".padStart(7) + "day t".padStart(7) +
      "call ret".padStart(10) + "rand".padStart(10) + "call win".padStart(9),
  );

  for (const strat of STRATEGIES) {
    const trades: Trade[] = [];
    const base: Trade[] = [];
    for (const s of all) {
      for (let i = 252; i < s.c.length; i++) {
        const tr = simulate(s, i, strat.exit);
        if (!tr) continue;
        if (i % 3 === 0) base.push(tr); // random-day baseline, same exit rule
        if (strat.signal(s, i)) {
          trades.push(tr);
          // Don't stack overlapping trades in the same stock.
          i += 2;
        }
      }
    }
    console.log(`\n${strat.name}: ${strat.plain}`);
    console.log(report("A (older)", trades.filter((t) => t.time < splitTime), base.filter((t) => t.time < splitTime)));
    console.log(report("B (recent)", trades.filter((t) => t.time >= splitTime), base.filter((t) => t.time >= splitTime)));
  }
  console.log(
    "\nwin% = trades where the stock was up at exit. rand = same exit rule from random days in the same\n" +
      "stocks and period. edge = avg return minus random's. t above ~2 = unlikely to be luck;\n" +
      "day t = the same test counting each signal day once (the more honest number).\n" +
      "call ret / call win = estimated ~5-week call, strike 5% below entry, after bid/ask costs.",
  );
}

main();
