// Does a green (GO) setup actually do better than a random entry?
//
// Runs the setup detector over ~5 years of daily data for a basket of large,
// liquid stocks, grades each setup the way the app would have on that day,
// and compares how often the target came before the stop against a random
// entry with the *same* % distances to target and stop (see
// baselineHitRate). Prints one table per hold window.
//
//   npx tsx scripts/evaluate-setups.ts [--hold 3,5] [--symbols AAPL,MSFT]
//
// Limits worth knowing when reading the output:
// - Stock moves only; historical option prices aren't free.
// - No historical earnings dates, so the earnings check isn't applied.
// - Survivorship bias: the basket is today's winners, so absolute hit rates
//   flatter reality. The comparison vs the random baseline (same stocks,
//   same period) is the number to trust.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Candle } from "../src/lib/market/yahoo";
import { createContext, trendAt, type SeriesContext, type SetupType } from "../src/lib/setups/engine";
import { gradeSetup, type Grade } from "../src/lib/setups/grade";
import { baselineHitRate, findHistoricalSetups, resolveOutcome, type Outcome } from "../src/lib/setups/track-record";

const DEFAULT_SYMBOLS =
  "AAPL MSFT NVDA AMD AMZN GOOGL META TSLA NFLX AVGO CRM ORCL ADBE INTC QCOM MU TXN JPM BAC GS MS WFC V MA PYPL XOM CVX COP UNH JNJ PFE LLY MRK ABBV HD LOW WMT COST TGT NKE SBUX MCD DIS BA CAT DE GE UBER SHOP COIN".split(" ");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const symbols = arg("symbols")?.split(",") ?? DEFAULT_SYMBOLS;
const holds = (arg("hold") ?? "3,5").split(",").map(Number);
const cacheDir = join(tmpdir(), "marketdesk-eval-cache");
mkdirSync(cacheDir, { recursive: true });

async function dailyCandles(symbol: string): Promise<Candle[]> {
  const cacheFile = join(cacheDir, `${symbol}-5y.json`);
  if (existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, "utf8"));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5y&interval=1d`;
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
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

const dayKey = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

interface Row {
  outcome: Outcome;
  grade: Grade;
  baseline: number;
}

function evaluate(ctx: SeriesContext, spy: SeriesContext, spyIndexByDay: Map<string, number>, hold: number): Row[] {
  const rows: Row[] = [];
  for (const setup of findHistoricalSetups(ctx)) {
    const outcome = resolveOutcome(ctx, setup, hold);
    if (!outcome) continue;
    const spyIdx = spyIndexByDay.get(dayKey(setup.time));
    const marketTrend = spyIdx != null ? trendAt(spy, spyIdx) : null;
    const { grade } = gradeSetup(setup, { marketTrend, daysToEarnings: null, daysToExpiry: null });
    // Distances as they actually were from the fill price, not the signal close.
    const up = ((setup.target - outcome.entry) / outcome.entry) * 100;
    const down = ((outcome.entry - setup.stop) / outcome.entry) * 100;
    if (up <= 0 || down <= 0) continue; // gapped through a level at the open: no fair baseline
    const baseline = baselineHitRate(ctx, up, down, hold, 2);
    if (baseline == null) continue;
    rows.push({ outcome, grade, baseline });
  }
  return rows;
}

function line(label: string, rows: Row[]) {
  if (rows.length === 0) return `${label.padEnd(22)}${"0".padStart(6)}`;
  const hits = rows.filter((r) => r.outcome.result === "target").length;
  const stops = rows.filter((r) => r.outcome.result === "stop").length;
  const expected = rows.reduce((s, r) => s + r.baseline, 0);
  const variance = rows.reduce((s, r) => s + r.baseline * (1 - r.baseline), 0);
  const z = variance > 0 ? (hits - expected) / Math.sqrt(variance) : 0;
  const avgRet = rows.reduce((s, r) => s + r.outcome.returnPct, 0) / rows.length;
  const f = (x: number) => `${(x * 100).toFixed(0)}%`.padStart(8);
  return (
    label.padEnd(22) +
    String(rows.length).padStart(6) +
    f(hits / rows.length) +
    f(stops / rows.length) +
    f(expected / rows.length) +
    `${((hits - expected) / rows.length * 100).toFixed(1).padStart(7)}pt` +
    z.toFixed(1).padStart(7) +
    `${avgRet.toFixed(2)}%`.padStart(9)
  );
}

async function main() {
  const spyCandles = await dailyCandles("SPY");
  const spy = createContext(spyCandles);
  const spyIndexByDay = new Map(spyCandles.map((c, i) => [dayKey(c.time), i]));

  const contexts: { symbol: string; ctx: SeriesContext }[] = [];
  for (const symbol of symbols) {
    try {
      contexts.push({ symbol, ctx: createContext(await dailyCandles(symbol)) });
    } catch (err) {
      console.error(`skip ${symbol}: ${(err as Error).message}`);
    }
  }
  const first = spyCandles[0];
  const last = spyCandles.at(-1)!;
  console.log(`${contexts.length} stocks, ${dayKey(first.time)} to ${dayKey(last.time)}\n`);

  for (const hold of holds) {
    const rows = contexts.flatMap(({ ctx }) => evaluate(ctx, spy, spyIndexByDay, hold));
    console.log(`=== Hold up to ${hold} trading days (entry = next day's open) ===`);
    console.log(
      "".padEnd(22) + "count".padStart(6) + "target".padStart(8) + "stop".padStart(8) +
        "random".padStart(8) + "edge".padStart(9) + "z".padStart(7) + "avg ret".padStart(9),
    );
    console.log(line("ALL SETUPS", rows));
    for (const g of ["go", "caution", "pass"] as Grade[]) {
      console.log(line(`  ${g.toUpperCase()}`, rows.filter((r) => r.grade === g)));
    }
    for (const t of ["bounce", "breakout", "retest", "ma-pullback"] as SetupType[]) {
      const ofType = rows.filter((r) => r.outcome.setup.type === t);
      console.log(line(t, ofType));
      console.log(line(`  ${t} GO`, ofType.filter((r) => r.grade === "go")));
    }
    console.log();
  }
  console.log(
    "target/stop = share of setups that hit each first. random = how often a random entry with the\n" +
      "same distances hit its target. edge = target minus random, in percentage points. z > 2 means\n" +
      "the edge is unlikely to be luck; |z| < 2 means no reliable difference from random.",
  );
}

main();
