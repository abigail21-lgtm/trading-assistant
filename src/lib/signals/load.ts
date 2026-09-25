import { getChart, type Candle } from "../market/yahoo";
import { daysUntil, getUpcomingEarningsForSymbols, type EarningsEvent } from "../market/calendar";
import { getCallChain, getOptionsOverview } from "../market/options";
import { evaluateDip, findDipTrades, paramsFor, summarizeTrades, type DipEvaluation, type DipTrackRecord } from "./dip";
import { chooseExpirations, gradeCalls, type CallsForExpiry } from "./calls";
import { gradeDip, type DipGradeResult, type EarningsInfo } from "./dip-grade";
import { sessionWeekday } from "./format";
import { DEFAULT_RULES, type TradingRules } from "./rules";

// Server-side loaders for the dip signal: fetch, evaluate, grade. Pages and
// the /api/signals route call these; everything they call into is pure.

export interface DipSnapshot {
  symbol: string;
  name: string;
  currency: string;
  evaluation: DipEvaluation;
  trackRecord: DipTrackRecord | null;
  earnings: EarningsInfo | null;
  grade: DipGradeResult;
  /** Last 30 completed closes with their 5-day average, for the mini chart. */
  recent: { time: number; close: number; ma5: number | null }[];
  /** Unix time of the next session the plan applies to (today if the market is open). */
  sessionTime: number;
  /** Unix time of the plan's last day (day 5), when a trade is active. */
  lastDayTime: number | null;
}

/** Adds weekdays to a unix time (market holidays aren't known here, so they're ignored). */
export function addTradingDays(unix: number, days: number): number {
  const d = new Date(unix * 1000);
  let added = 0;
  while (added < days) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) added++;
  }
  return Math.floor(d.getTime() / 1000);
}

const shortDate = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function earningsFromCalendar(event: EarningsEvent | undefined): EarningsInfo | null {
  if (!event) return null;
  const daysAway = daysUntil(event.date);
  if (daysAway < 0) return null;
  return { daysAway, label: shortDate(Date.parse(`${event.date}T00:00:00Z`) / 1000), estimated: false };
}

function isLive(marketState: string | null) {
  return marketState === "REGULAR";
}

function snapshotFrom(
  symbol: string,
  meta: { longName: string; currency: string; marketState: string | null },
  candles: Candle[],
  earnings: EarningsInfo | null,
  withTrackRecord: boolean,
  rules: TradingRules,
): DipSnapshot {
  const params = paramsFor(symbol, rules.stockDipDepth);
  const live = isLive(meta.marketState);
  const evaluation = evaluateDip(candles, params, live);
  const completed = live ? candles.slice(0, -1) : candles;
  const closes = completed.map((c) => c.close);
  const recent = completed.slice(-30).map((c, j, arr) => {
    const i = completed.length - arr.length + j;
    return { time: c.time, close: c.close, ma5: i >= 4 ? closes.slice(i - 4, i + 1).reduce((a, b) => a + b, 0) / 5 : null };
  });
  const lastCompleted = completed.at(-1)?.time ?? Date.now() / 1000;
  const sessionTime = live ? candles.at(-1)!.time : addTradingDays(lastCompleted, 1);
  const trade = evaluation.trade;
  const lastDayTime =
    trade && evaluation.status !== "none"
      ? addTradingDays(completed[trade.signalIndex].time, params.maxHoldBars)
      : null;
  return {
    symbol,
    name: meta.longName,
    currency: meta.currency,
    evaluation,
    trackRecord: withTrackRecord ? summarizeTrades(findDipTrades(completed, params), completed) : null,
    earnings,
    grade: gradeDip({ symbol, evaluation, earnings, rules, session: live ? "today" : sessionWeekday(sessionTime) }),
    recent,
    sessionTime,
    lastDayTime,
  };
}

/** One symbol, with its 10-year track record. For the stock page card. */
export async function getDipSnapshot(symbol: string, rules: TradingRules = DEFAULT_RULES): Promise<DipSnapshot> {
  const [chart, earningsMap] = await Promise.all([
    getChart(symbol, "10y", "1d"),
    getUpcomingEarningsForSymbols([symbol]).catch(() => new Map<string, EarningsEvent>()),
  ]);
  return snapshotFrom(symbol, chart.meta, chart.candles, earningsFromCalendar(earningsMap.get(symbol)), true, rules);
}

/** Many symbols, no track record (2 years of data is enough for the rules). For the Signals tab. */
export async function getDipSnapshots(
  symbols: string[],
  rules: TradingRules = DEFAULT_RULES,
): Promise<{ symbol: string; snapshot: DipSnapshot | null }[]> {
  const earningsMap = await getUpcomingEarningsForSymbols(symbols).catch(() => new Map<string, EarningsEvent>());
  return Promise.all(
    symbols.map(async (symbol) => {
      try {
        const chart = await getChart(symbol, "2y", "1d");
        return {
          symbol,
          snapshot: snapshotFrom(symbol, chart.meta, chart.candles, earningsFromCalendar(earningsMap.get(symbol)), false, rules),
        };
      } catch {
        return { symbol, snapshot: null };
      }
    }),
  );
}

export interface ExpiryOption {
  calls: CallsForExpiry;
  grade: DipGradeResult;
}

export interface DipSetup extends DipSnapshot {
  expiries: ExpiryOption[];
  defaultExpiryIndex: number;
  /** Why the calls section is empty, if it is. */
  optionsError: string | null;
  marketUp: boolean | null;
}

async function spyAboveTrend(): Promise<boolean | null> {
  try {
    const { candles } = await getChart("SPY", "2y", "1d");
    if (candles.length < 200) return null;
    const last200 = candles.slice(-200);
    return candles.at(-1)!.close > last200.reduce((s, c) => s + c.close, 0) / 200;
  } catch {
    return null;
  }
}

/** Everything the Setup screen shows, including graded calls for up to three expiries. */
export async function getDipSetup(symbol: string, rules: TradingRules = DEFAULT_RULES): Promise<DipSetup> {
  const [snapshot, marketUp] = await Promise.all([getDipSnapshot(symbol, rules), spyAboveTrend()]);
  const e = snapshot.evaluation;
  const session = e.lastBarIsLive ? "today" : sessionWeekday(snapshot.sessionTime);
  const base: DipSetup = { ...snapshot, expiries: [], defaultExpiryIndex: 0, optionsError: null, marketUp };
  // Calls are only suggested when a new trade can start: a later entry isn't what was tested.
  const active = e.status === "signal" || e.status === "in-buy-zone";

  let earnings = snapshot.earnings;
  let expirations: number[] = [];
  try {
    const overview = await getOptionsOverview(symbol);
    expirations = chooseExpirations(overview.expirations, Date.now() / 1000, rules.minWeeks, rules.maxWeeks);
    // The Nasdaq calendar only looks 30 days ahead; Yahoo's (often estimated)
    // date covers contracts that run longer.
    if (!earnings && overview.earningsTime) {
      earnings = {
        daysAway: Math.round((overview.earningsTime - Date.now() / 1000) / 86400),
        label: shortDate(overview.earningsTime),
        estimated: overview.earningsEstimated,
      };
    }
  } catch {
    return {
      ...base,
      earnings,
      grade: gradeDip({ symbol, evaluation: e, earnings, marketUp, session, rules }),
      optionsError: "Couldn't load options prices right now. Try again in a minute.",
    };
  }

  if (!active || expirations.length === 0) {
    return {
      ...base,
      earnings,
      grade: gradeDip({ symbol, evaluation: e, earnings, marketUp, session, rules }),
      optionsError:
        expirations.length === 0 ? `No option expirations between ${rules.minWeeks} and ${rules.maxWeeks} weeks out.` : null,
    };
  }

  const scenario = {
    price: e.price,
    // The bounce ends at the sell price; if price is already above it, assume a small further move.
    bouncePrice: Math.max(e.sellPrice ?? e.price, e.price * 1.005),
    slidePrice: e.price * 0.97,
    // Sizing uses a bad case: as far as this symbol's worst past dip fell, kept between -3% and -15%.
    badPrice: e.price * (1 + Math.min(-3, Math.max(-15, snapshot.trackRecord?.worstReturnPct ?? -8)) / 100),
    holdDays: 3,
  };
  const chains = await Promise.all(
    expirations.map((exp) => getCallChain(symbol, exp).then((chain) => ({ exp, chain })).catch(() => null)),
  );
  const expiries: ExpiryOption[] = chains
    .filter((c): c is { exp: number; chain: Awaited<ReturnType<typeof getCallChain>> } => c !== null)
    .map(({ exp, chain }) => {
      const calls = gradeCalls(chain, scenario, exp, Date.now() / 1000, rules.strikeStyle);
      const pick = calls.pickIndex != null ? calls.rows[calls.pickIndex] : null;
      return { calls, grade: gradeDip({ symbol, evaluation: e, earnings, daysToExpiry: calls.daysToExpiry, pick, marketUp, session, rules }) };
    });
  const defaultExpiryIndex = expiries.reduce(
    (best, x, i) => (Math.abs(x.calls.daysToExpiry - 35) < Math.abs(expiries[best].calls.daysToExpiry - 35) ? i : best),
    0,
  );
  return {
    ...base,
    earnings,
    expiries,
    defaultExpiryIndex,
    grade: expiries[defaultExpiryIndex]?.grade ?? gradeDip({ symbol, evaluation: e, earnings, marketUp, session, rules }),
    optionsError: expiries.length === 0 ? "Couldn't load options prices right now. Try again in a minute." : null,
  };
}
