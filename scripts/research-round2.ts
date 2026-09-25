// Second round of strategy research. Same method as research-strategies.ts:
// the rules below were fixed before looking at any results and are not tuned
// afterwards. Each strategy is compared with random entries (same symbols,
// same period, same exit rule), with a t-stat that counts each signal day
// once. Longer history than round 1: ~10 years for stocks, back to 2000 for
// the index ETFs.
//
//   npx tsx scripts/research-round2.ts
//
// Option columns are Black-Scholes estimates for a ~5-week call bought at the
// entry and sold at the exit, with implied vol = 20-day realized vol x1.1
// (stocks) or x1.25 (index ETFs, whose options usually price in more), and a
// half-spread of 1.5% (stocks) / 0.5% (ETFs) of the premium on each side.
// Survivorship bias applies to the stock list (today's large caps).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candle } from "../src/lib/market/yahoo";
import { sma } from "../src/lib/market/indicators";

const STOCKS = (
  "AAPL MSFT NVDA AMD AMZN GOOGL META TSLA NFLX AVGO CRM ORCL ADBE INTC QCOM MU TXN " +
  "JPM BAC GS MS WFC V MA PYPL XOM CVX COP UNH JNJ PFE LLY MRK ABBV HD LOW WMT COST TGT NKE SBUX " +
  "MCD DIS BA CAT DE GE UBER SHOP COIN ABNB AMAT ANET BKNG BLK C CMCSA COF CSCO CVS DHR DUK F GM " +
  "GILD HON IBM INTU ISRG KO LIN LMT LRCX MDT MMM MO NEE NOW PANW PEP PG PM RTX SCHW SPGI T TMO UNP " +
  "UPS VZ KLAC MRVL SNPS CDNS"
).split(" ");
const ETFS = ["SPY", "QQQ", "IWM", "DIA"];

const cacheDir = join(tmpdir(), "marketdesk-eval-cache");
mkdirSync(cacheDir, { recursive: true });

async function dailyCandles(symbol: string, range: string): Promise<Candle[]> {
  const cacheFile = join(cacheDir, `${symbol.replace("^", "_")}-${range}.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  // Yahoo silently downgrades `range=max` to monthly bars, so long histories
  // are requested by explicit dates, which keeps them daily.
  const span = range === "since2000" ? `period1=946684800&period2=${Math.floor(Date.now() / 1000)}` : `range=${range}`;
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${span}&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0" } },
  );
  if (!res.ok) throw new Error(`${symbol}: HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const r = json.chart.result[0];
  if (r.meta?.dataGranularity && r.meta.dataGranularity !== "1d") throw new Error(`${symbol}: got ${r.meta.dataGranularity} bars`);
  const q = r.indicators.quote[0];
  const candles: Candle[] = r.timestamp
    .map((t: number, i: number) => ({ time: t, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume[i] ?? 0 }))
    .filter((c: Candle) => c.open != null && c.high != null && c.low != null && c.close != null && c.open > 0);
  writeFileSync(cacheFile, JSON.stringify(candles));
  return candles;
}

const dayKey = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

// ---------- indicators (value at i uses bars <= i only) ----------

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
  isEtf: boolean;
  c: Candle[];
  close: number[];
  sma5: (number | null)[];
  sma200: (number | null)[];
  rsi2: (number | null)[];
  rv20: (number | null)[];
  ret5: (number | null)[];
  mom12_1: (number | null)[];
  rank5: (number | null)[];
  rankMom: (number | null)[];
  /** SPY above its 200-day average on the same date. */
  marketUp: (boolean | null)[];
  /** VIX close / its 10-day average on the same date. */
  vixRatio: (number | null)[];
}

function buildSeries(symbol: string, c: Candle[], isEtf: boolean): Series {
  const close = c.map((x) => x.close);
  const n = c.length;
  const rv20: (number | null)[] = new Array(n).fill(null);
  const ret5: (number | null)[] = new Array(n).fill(null);
  const mom12_1: (number | null)[] = new Array(n).fill(null);
  for (let i = 20; i < n; i++) {
    const rets: number[] = [];
    for (let k = i - 19; k <= i; k++) rets.push(Math.log(close[k] / close[k - 1]));
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    rv20[i] = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1)) * Math.sqrt(252);
    if (i >= 5) ret5[i] = close[i] / close[i - 5] - 1;
    if (i >= 252) mom12_1[i] = close[i - 21] / close[i - 252] - 1;
  }
  return {
    symbol,
    isEtf,
    c,
    close,
    sma5: sma(close, 5),
    sma200: sma(close, 200),
    rsi2: rsi(close, 2),
    rv20,
    ret5,
    mom12_1,
    rank5: new Array(n).fill(null),
    rankMom: new Array(n).fill(null),
    marketUp: new Array(n).fill(null),
    vixRatio: new Array(n).fill(null),
  };
}

function fillCrossSection(stocks: Series[], field: "ret5" | "mom12_1", into: "rank5" | "rankMom") {
  const byDay = new Map<string, { s: Series; i: number; v: number }[]>();
  for (const s of stocks) {
    s.c.forEach((x, i) => {
      const v = s[field][i];
      if (v == null) return;
      const k = dayKey(x.time);
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push({ s, i, v });
    });
  }
  for (const rows of byDay.values()) {
    if (rows.length < 30) continue;
    rows.sort((a, b) => a.v - b.v);
    rows.forEach((row, idx) => (row.s[into][row.i] = idx / (rows.length - 1)));
  }
}

function fillMarketContext(all: Series[], spy: Series, vix: Candle[]) {
  const spyUp = new Map<string, boolean>();
  spy.c.forEach((x, i) => {
    if (spy.sma200[i] != null) spyUp.set(dayKey(x.time), spy.close[i] > spy.sma200[i]!);
  });
  const vixClose = vix.map((x) => x.close);
  const vix10 = sma(vixClose, 10);
  const vixR = new Map<string, number>();
  vix.forEach((x, i) => {
    if (vix10[i] != null) vixR.set(dayKey(x.time), vixClose[i] / vix10[i]!);
  });
  for (const s of all) {
    s.c.forEach((x, i) => {
      const k = dayKey(x.time);
      s.marketUp[i] = spyUp.get(k) ?? null;
      s.vixRatio[i] = vixR.get(k) ?? null;
    });
  }
}

// ---------- exits: return the bar whose close is the exit, or -1 if unresolved ----------

type ExitRule = (s: Series, entryBar: number) => number;

const timeExit = (bars: number): ExitRule => (s, e) => (e + bars - 1 < s.c.length ? e + bars - 1 : -1);

const sma5Exit: ExitRule = (s, e) => {
  for (let k = e; k < Math.min(s.c.length, e + 5); k++) {
    if (s.sma5[k] != null && s.close[k] > s.sma5[k]!) return k;
  }
  return e + 4 < s.c.length ? e + 4 : -1;
};

const aboveYesterdaysHighExit: ExitRule = (s, e) => {
  for (let k = e; k < Math.min(s.c.length, e + 3); k++) {
    if (k > 0 && s.close[k] > s.c[k - 1].high) return k;
  }
  return e + 2 < s.c.length ? e + 2 : -1;
};

// ---------- strategies (fixed before testing) ----------

interface Strategy {
  id: string;
  plain: string;
  universe: "stocks" | "etfs";
  signal: (s: Series, i: number) => boolean;
  exit: ExitRule;
}

const upTrend = (s: Series, i: number) => s.sma200[i] != null && s.close[i] > s.sma200[i]!;
const ibs = (b: Candle) => (b.high > b.low ? (b.close - b.low) / (b.high - b.low) : 0.5);
const isMonth = (t: number) => new Date(t * 1000).getUTCMonth();

/** True when bar i+1 is the last trading day of its month (so entry lands on it). */
function nextIsLastOfMonth(s: Series, i: number) {
  return i + 2 < s.c.length && isMonth(s.c[i + 1].time) !== isMonth(s.c[i + 2].time);
}

/** True when the trading day after bar i+1 is more than one weekday later (a holiday follows bar i+1). */
function nextIsPreHoliday(s: Series, i: number) {
  if (i + 2 >= s.c.length) return false;
  const a = new Date(s.c[i + 1].time * 1000);
  const b = new Date(s.c[i + 2].time * 1000);
  let weekdays = 0;
  for (const d = new Date(a); d < b; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) weekdays++;
  }
  return weekdays > 1;
}

const STRATEGIES: Strategy[] = [
  { id: "S1", universe: "stocks", plain: "Dip in uptrend: above 200-day, 2-day RSI < 10. Sell above 5-day avg (max 5 days).",
    signal: (s, i) => upTrend(s, i) && s.rsi2[i] != null && s.rsi2[i]! < 10, exit: sma5Exit },
  { id: "S2", universe: "stocks", plain: "S1, only when SPY is also above its 200-day.",
    signal: (s, i) => upTrend(s, i) && s.marketUp[i] === true && s.rsi2[i] != null && s.rsi2[i]! < 10, exit: sma5Exit },
  { id: "S3", universe: "stocks", plain: "Deeper dip: above 200-day, 2-day RSI < 5. Same exit.",
    signal: (s, i) => upTrend(s, i) && s.rsi2[i] != null && s.rsi2[i]! < 5, exit: sma5Exit },
  { id: "S4", universe: "stocks", plain: "3 lower closes in a row, above 200-day. Same exit.",
    signal: (s, i) => i >= 3 && upTrend(s, i) && s.close[i] < s.close[i - 1] && s.close[i - 1] < s.close[i - 2] && s.close[i - 2] < s.close[i - 3],
    exit: sma5Exit },
  { id: "S5", universe: "stocks", plain: "Weekly loser: above 200-day, worst 10% 5-day return in the list. Hold 5 days.",
    signal: (s, i) => upTrend(s, i) && s.rank5[i] != null && s.rank5[i]! <= 0.1, exit: timeExit(5) },
  { id: "S6", universe: "stocks", plain: "12-month leaders (skip last month), top 10%, bought at month start. Hold 20 days.",
    signal: (s, i) => i >= 1 && isMonth(s.c[i].time) !== isMonth(s.c[i - 1].time) && s.rankMom[i] != null && s.rankMom[i]! >= 0.9,
    exit: timeExit(20) },
  { id: "E1", universe: "etfs", plain: "Dip in uptrend on SPY/QQQ/IWM/DIA. Same rules as S1.",
    signal: (s, i) => upTrend(s, i) && s.rsi2[i] != null && s.rsi2[i]! < 10, exit: sma5Exit },
  { id: "E2", universe: "etfs", plain: "Weak close in uptrend: closed in bottom 20% of day's range. Sell first close above prior high (max 3 days).",
    signal: (s, i) => upTrend(s, i) && ibs(s.c[i]) < 0.2, exit: aboveYesterdaysHighExit },
  { id: "E3", universe: "etfs", plain: "Turn of month: buy the last trading day's open, hold 4 days.",
    signal: nextIsLastOfMonth, exit: timeExit(4) },
  { id: "E4", universe: "etfs", plain: "Fear spike in uptrend: VIX 20%+ above its 10-day avg, SPY above 200-day. Hold 5 days.",
    signal: (s, i) => s.marketUp[i] === true && s.vixRatio[i] != null && s.vixRatio[i]! >= 1.2, exit: timeExit(5) },
  { id: "E5", universe: "etfs", plain: "Day before a market holiday: buy that day's open, sell its close.",
    signal: nextIsPreHoliday, exit: timeExit(1) },
];

// ---------- simulation ----------

function normCdf(x: number) {
  const t = 1 / (1 + (0.3275911 * Math.abs(x)) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

function bsCall(S: number, K: number, T: number, vol: number, r = 0.04) {
  if (T <= 0) return Math.max(S - K, 0);
  const d1 = (Math.log(S / K) + (r + (vol * vol) / 2) * T) / (vol * Math.sqrt(T));
  return S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d1 - vol * Math.sqrt(T));
}

interface Trade {
  time: number;
  stockRet: number;
  call5: number;
  call10: number;
}

function callReturn(s: Series, entry: number, exit: number, heldBars: number, rv: number, itm: number) {
  const vol = Math.max(0.12, rv * (s.isEtf ? 1.25 : 1.1));
  const half = s.isEtf ? 0.005 : 0.015;
  const K = entry * (1 - itm);
  const T0 = 35 / 365;
  const heldDays = (heldBars * 7) / 5;
  const buy = bsCall(entry, K, T0, vol) * (1 + half);
  const sell = bsCall(exit, K, T0 - heldDays / 365, vol) * (1 - half);
  return sell / buy - 1;
}

function simulate(s: Series, i: number, exitRule: ExitRule): Trade | null {
  const e = i + 1;
  if (e >= s.c.length || s.rv20[i] == null) return null;
  const x = exitRule(s, e);
  if (x < 0) return null;
  const entry = s.c[e].open;
  const out = s.close[x];
  const held = x - e + 1;
  return {
    time: s.c[i].time,
    stockRet: out / entry - 1,
    call5: callReturn(s, entry, out, held, s.rv20[i]!, 0.05),
    call10: callReturn(s, entry, out, held, s.rv20[i]!, 0.1),
  };
}

// ---------- reporting ----------

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
};
const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;

function row(label: string, trades: Trade[], base: Trade[]) {
  if (trades.length < 10) return `  ${label.padEnd(11)}too few trades (${trades.length})`;
  const bMean = mean(base.map((b) => b.stockRet));
  const byDay = new Map<number, number[]>();
  for (const t of trades) {
    if (!byDay.has(t.time)) byDay.set(t.time, []);
    byDay.get(t.time)!.push(t.stockRet - bMean);
  }
  const dayEdges = [...byDay.values()].map(mean);
  const dayT = mean(dayEdges) / (sd(dayEdges) / Math.sqrt(dayEdges.length));
  const win = trades.filter((t) => t.stockRet > 0).length / trades.length;
  const bWin = base.filter((t) => t.stockRet > 0).length / base.length;
  const w = (xs: Trade[], k: "call5" | "call10") => xs.filter((t) => t[k] > 0).length / xs.length;
  return (
    `  ${label.padEnd(11)}${String(trades.length).padStart(6)}${String(byDay.size).padStart(6)}` +
    `${pct(win, 0).padStart(7)}${pct(bWin, 0).padStart(7)}` +
    `${pct(mean(trades.map((t) => t.stockRet))).padStart(8)}${pct(bMean).padStart(8)}` +
    `${dayT.toFixed(1).padStart(7)}` +
    `${pct(mean(trades.map((t) => t.call5)), 1).padStart(9)}${pct(w(trades, "call5"), 0).padStart(6)}` +
    `${pct(mean(trades.map((t) => t.call10)), 1).padStart(9)}${pct(w(trades, "call10"), 0).padStart(6)}` +
    `${pct(mean(base.map((t) => t.call10)), 1).padStart(9)}`
  );
}

async function main() {
  const load = async (symbols: string[], range: string, isEtf: boolean) => {
    const out: Series[] = [];
    for (const sym of symbols) {
      try {
        out.push(buildSeries(sym, await dailyCandles(sym, range), isEtf));
      } catch (err) {
        console.error(`skip ${sym}: ${(err as Error).message}`);
      }
    }
    return out;
  };
  const stocks = await load(STOCKS, "10y", false);
  const etfs = await load(ETFS, "since2000", true);
  const vix = await dailyCandles("^VIX", "since2000");
  const spy = etfs.find((s) => s.symbol === "SPY")!;
  fillCrossSection(stocks, "ret5", "rank5");
  fillCrossSection(stocks, "mom12_1", "rankMom");
  fillMarketContext([...stocks, ...etfs], spy, vix);

  const t = (d: string) => Date.parse(d) / 1000;
  const periods = {
    stocks: [
      ["2016-21", t("2016-01-01"), t("2021-09-25")],
      ["2021-26", t("2021-09-25"), t("2030-01-01")],
    ],
    etfs: [
      ["2000-09", t("2000-01-01"), t("2010-01-01")],
      ["2010-19", t("2010-01-01"), t("2020-01-01")],
      ["2020-26", t("2020-01-01"), t("2030-01-01")],
    ],
  } as const;

  console.log(`${stocks.length} stocks (10y), ${etfs.length} index ETFs (since ${dayKey(spy.c[0].time)}).\n`);
  console.log(
    "  " + "period".padEnd(11) + "trades".padStart(6) + "days".padStart(6) + "win%".padStart(7) + "rand".padStart(7) +
      "avg".padStart(8) + "rand".padStart(8) + "day t".padStart(7) + "call5%".padStart(9) + "win".padStart(6) +
      "call10%".padStart(9) + "win".padStart(6) + "rand c10".padStart(9),
  );

  for (const strat of STRATEGIES) {
    const universe = strat.universe === "stocks" ? stocks : etfs;
    const trades: Trade[] = [];
    const base: Trade[] = [];
    for (const s of universe) {
      for (let i = 252; i < s.c.length; i++) {
        const tr = simulate(s, i, strat.exit);
        if (!tr) continue;
        if (i % 2 === 0) base.push(tr);
        if (strat.signal(s, i)) {
          trades.push(tr);
          i += 2; // no overlapping trades in the same symbol
        }
      }
    }
    console.log(`\n${strat.id}. ${strat.plain}`);
    for (const [label, from, to] of periods[strat.universe]) {
      const inP = (x: Trade) => x.time >= from && x.time < to;
      console.log(row(label, trades.filter(inP), base.filter(inP)));
    }
  }
  console.log(
    "\nwin% / avg = stock up at exit / average stock return per trade. rand = same exit from random days.\n" +
      "day t = edge vs random, counting each signal day once; above ~2 is unlikely to be luck.\n" +
      "call5% / call10% = estimated avg return of a ~5-week call 5% / 10% in the money, after bid/ask;\n" +
      "win = share of those call trades that made money. rand c10 = the 10%-ITM call from random days.",
  );
}

main();
