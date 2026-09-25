import type { DipEvaluation } from "./dip";
import { isTracked, marketDate, type TradingRules } from "./rules";
import { money } from "./format";

// Which dip alerts are due for one symbol right now. Pure, so the in-app
// checker (local mode) and the scheduled push job (accounts mode) send
// exactly the same alerts. Each alert has a `key` that's unique per symbol,
// kind and trading day; callers remember sent keys so nothing repeats.

export type DipAlertKind = "buy-zone" | "sell" | "last-day" | "new-dip";

export interface DipAlert {
  key: string;
  symbol: string;
  kind: DipAlertKind;
  title: string;
  body: string;
  url: string;
}

/** Minutes since midnight and the date, in New York time. */
export function easternClock(nowMs: number): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date(nowMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { date: marketDate(nowMs / 1000), minutes: get("hour") * 60 + get("minute") };
}

const BUY_ZONE_FROM = 15 * 60; // 3:00pm ET
const SELL_FROM = 15 * 60 + 15; // 3:15pm ET
const CLOSE = 16 * 60;
const AFTER_CLOSE = 16 * 60 + 5;

export function dueDipAlerts(symbol: string, e: DipEvaluation, rules: TradingRules, nowMs: number): DipAlert[] {
  const { date, minutes } = easternClock(nowMs);
  const url = `/stock/${symbol}/setup`;
  const out: DipAlert[] = [];

  if (rules.alerts.buyZone && e.lastBarIsLive && e.status === "in-buy-zone" && e.buyZone && minutes >= BUY_ZONE_FROM && minutes < CLOSE) {
    out.push({
      key: `${symbol}:buy-zone:${date}`,
      symbol,
      kind: "buy-zone",
      title: `${symbol}: in the buy zone`,
      body: `${symbol} is at ${money(e.price)}, at or below ${money(e.buyZone.ceiling)}. If it closes there, it's a dip in an uptrend. Buy near the close (4pm ET).`,
      url,
    });
  }

  // An open trade: while live, the evaluation is based on yesterday's close, so
  // a dip from yesterday shows as "signal" and older ones as "holding".
  const tradeOpen = e.trade != null && e.trade.exitIndex == null && (e.status === "signal" || e.status === "holding");
  if (rules.alerts.sell && e.lastBarIsLive && tradeOpen && isTracked(rules, symbol, e.signalTime) && minutes >= SELL_FROM && minutes < CLOSE) {
    if (e.sellPrice != null && e.price > e.sellPrice) {
      out.push({
        key: `${symbol}:sell:${date}`,
        symbol,
        kind: "sell",
        title: `${symbol}: time to sell`,
        body: `${symbol} is at ${money(e.price)}, above today's sell price (${money(e.sellPrice)}). The plan says sell before the close.`,
        url,
      });
    } else if (e.holdDay === e.params.maxHoldBars) {
      out.push({
        key: `${symbol}:last-day:${date}`,
        symbol,
        kind: "last-day",
        title: `${symbol}: last day of the plan`,
        body: `Day ${e.params.maxHoldBars}: the plan says sell at today's close, whatever the price.`,
        url,
      });
    }
  }

  if (
    rules.alerts.newDip &&
    !e.lastBarIsLive &&
    e.status === "signal" &&
    e.signalTime != null &&
    marketDate(e.signalTime) === date &&
    minutes >= AFTER_CLOSE
  ) {
    out.push({
      key: `${symbol}:new-dip:${date}`,
      symbol,
      kind: "new-dip",
      title: `${symbol}: closed in a dip`,
      body: `${symbol} closed at ${money(e.price)}, a dip in an uptrend. The best entry was near the close; next best is tomorrow after 9:45am${
        e.sellPrice != null ? `, unless it opens above ${money(e.sellPrice)}` : ""
      }.`,
      url,
    });
  }

  return out;
}

/** Drops sent-alert records older than `days`, so the log stays small. */
export function pruneSentLog(log: Record<string, number>, nowMs: number, days = 10): Record<string, number> {
  const cutoff = nowMs - days * 86_400_000;
  return Object.fromEntries(Object.entries(log).filter(([, t]) => typeof t === "number" && t >= cutoff));
}
