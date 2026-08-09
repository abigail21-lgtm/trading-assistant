import type { Candle } from "./yahoo";
import { sma } from "./indicators";

interface AlertBase {
  id: string;
  symbol: string;
  createdAt: number;
  lastFiredAt: number | null;
}

export type AlertRule = AlertBase &
  (
    | { kind: "price_above"; targetPrice: number }
    | { kind: "price_below"; targetPrice: number }
    | { kind: "ma_cross_above"; maPeriod: 20 | 50 | 200 }
    | { kind: "ma_cross_below"; maPeriod: 20 | 50 | 200 }
    | { kind: "volume_spike"; multiplier: number }
  );

// Plain `Omit` doesn't distribute over a discriminated union — it would
// collapse AlertRule's variants down to only their common fields, losing
// `targetPrice`/`maPeriod`/`multiplier`. Distributing over each member first
// preserves them.
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;
export type NewAlertRule = DistributiveOmit<AlertRule, "id" | "createdAt" | "lastFiredAt">;

// Once a condition fires, don't re-fire the same rule again for this long —
// otherwise a rule whose condition stays true (e.g. price stays above a
// target) would re-notify on every poll.
export const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export interface AlertCheckContext {
  price: number;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  volume: number | null;
  avgVolume20: number | null;
}

export function buildAlertContext(candles: Candle[]): AlertCheckContext | null {
  if (candles.length === 0) return null;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  const ma20 = sma(closes, 20).at(-1) ?? null;
  const ma50 = sma(closes, 50).at(-1) ?? null;
  const ma200 = sma(closes, 200).at(-1) ?? null;
  const avgVolume20 = sma(volumes, 20).at(-1) ?? null;

  return {
    price: closes.at(-1)!,
    ma20,
    ma50,
    ma200,
    volume: volumes.at(-1) ?? null,
    avgVolume20,
  };
}

export function evaluateAlert(rule: AlertRule, ctx: AlertCheckContext): boolean {
  switch (rule.kind) {
    case "price_above":
      return ctx.price >= rule.targetPrice;
    case "price_below":
      return ctx.price <= rule.targetPrice;
    case "ma_cross_above": {
      const ma = rule.maPeriod === 20 ? ctx.ma20 : rule.maPeriod === 50 ? ctx.ma50 : ctx.ma200;
      return ma != null && ctx.price >= ma;
    }
    case "ma_cross_below": {
      const ma = rule.maPeriod === 20 ? ctx.ma20 : rule.maPeriod === 50 ? ctx.ma50 : ctx.ma200;
      return ma != null && ctx.price <= ma;
    }
    case "volume_spike":
      return ctx.volume != null && ctx.avgVolume20 != null && ctx.volume >= ctx.avgVolume20 * rule.multiplier;
  }
}

export function describeAlert(rule: AlertRule): string {
  switch (rule.kind) {
    case "price_above":
      return `Price rises above $${rule.targetPrice.toFixed(2)}`;
    case "price_below":
      return `Price falls below $${rule.targetPrice.toFixed(2)}`;
    case "ma_cross_above":
      return `Price crosses above its ${rule.maPeriod}-period moving average`;
    case "ma_cross_below":
      return `Price crosses below its ${rule.maPeriod}-period moving average`;
    case "volume_spike":
      return `Volume rises above ${rule.multiplier}x the 20-period average`;
  }
}

export function notificationMessage(rule: AlertRule, ctx: AlertCheckContext): string {
  switch (rule.kind) {
    case "price_above":
    case "price_below":
      return `${rule.symbol} is now at $${ctx.price.toFixed(2)} (target: $${rule.targetPrice.toFixed(2)})`;
    case "ma_cross_above":
    case "ma_cross_below":
      return `${rule.symbol} is now at $${ctx.price.toFixed(2)}, crossing its ${rule.maPeriod}-period moving average`;
    case "volume_spike":
      return `${rule.symbol} volume (${Math.round(ctx.volume ?? 0).toLocaleString()}) is well above its 20-period average`;
  }
}
