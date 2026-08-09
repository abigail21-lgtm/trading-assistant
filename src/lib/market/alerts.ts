import type { Candle } from "./yahoo";
import { sma } from "./indicators";
import { findKeyLevels, type SupportResistanceLevel } from "./analysis";

export type AlertCondition =
  | { kind: "price_above"; targetPrice: number }
  | { kind: "price_below"; targetPrice: number }
  | { kind: "ma_cross_above"; maPeriod: number }
  | { kind: "ma_cross_below"; maPeriod: number }
  | { kind: "volume_spike"; multiplier: number }
  | { kind: "breaks_resistance" }
  | { kind: "breaks_support" };

export interface AlertRule {
  id: string;
  symbol: string;
  createdAt: number;
  lastFiredAt: number | null;
  // Multiple conditions combine into one alert with tiered urgency -- see
  // `evaluateAlert`. A plain single-condition alert is just the length-1 case.
  conditions: AlertCondition[];
}

export type NewAlertRule = Omit<AlertRule, "id" | "createdAt" | "lastFiredAt">;

// Once a condition fires, don't re-fire the same rule again for this long —
// otherwise a rule whose condition stays true (e.g. price stays above a
// target) would re-notify on every poll.
export const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000;

export interface AlertCheckContext {
  price: number;
  closes: number[];
  volumes: number[];
  levels: SupportResistanceLevel[];
}

export function buildAlertContext(candles: Candle[]): AlertCheckContext | null {
  if (candles.length === 0) return null;
  return {
    price: candles.at(-1)!.close,
    closes: candles.map((c) => c.close),
    volumes: candles.map((c) => c.volume),
    levels: findKeyLevels(candles),
  };
}

function nearestLevel(
  levels: SupportResistanceLevel[],
  price: number,
  type: "support" | "resistance",
): SupportResistanceLevel | null {
  const candidates = levels.filter((l) => l.type === type && l.touches >= 2);
  if (candidates.length === 0) return null;
  return candidates.reduce((best, l) => (Math.abs(l.price - price) < Math.abs(best.price - price) ? l : best));
}

function evaluateCondition(condition: AlertCondition, ctx: AlertCheckContext): boolean {
  switch (condition.kind) {
    case "price_above":
      return ctx.price >= condition.targetPrice;
    case "price_below":
      return ctx.price <= condition.targetPrice;
    case "ma_cross_above": {
      const ma = sma(ctx.closes, condition.maPeriod).at(-1);
      return ma != null && ctx.price >= ma;
    }
    case "ma_cross_below": {
      const ma = sma(ctx.closes, condition.maPeriod).at(-1);
      return ma != null && ctx.price <= ma;
    }
    case "volume_spike": {
      const avgVolume = sma(ctx.volumes, 20).at(-1);
      const volume = ctx.volumes.at(-1);
      return avgVolume != null && volume != null && volume >= avgVolume * condition.multiplier;
    }
    case "breaks_resistance": {
      const level = nearestLevel(ctx.levels, ctx.price, "resistance");
      return level != null && ctx.price >= level.price;
    }
    case "breaks_support": {
      const level = nearestLevel(ctx.levels, ctx.price, "support");
      return level != null && ctx.price <= level.price;
    }
  }
}

export interface AlertEvaluation {
  // "all": every condition is true right now -- the highest-priority "look
  // now" tier. "some": at least one is true but not all -- lower-priority
  // "worth attention". "none": nothing fired.
  tier: "all" | "some" | "none";
  metConditions: AlertCondition[];
  unmetConditions: AlertCondition[];
}

export function evaluateAlert(rule: AlertRule, ctx: AlertCheckContext): AlertEvaluation {
  // Defensive: alerts saved before this file supported multi-condition
  // rules were stored as a single condition at the rule's top level rather
  // than under `conditions`. Treat any such record as having no conditions
  // rather than throwing.
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  const metConditions = conditions.filter((c) => evaluateCondition(c, ctx));
  const unmetConditions = conditions.filter((c) => !evaluateCondition(c, ctx));
  const tier = metConditions.length === 0 ? "none" : metConditions.length === conditions.length ? "all" : "some";
  return { tier, metConditions, unmetConditions };
}

export function describeCondition(condition: AlertCondition): string {
  switch (condition.kind) {
    case "price_above":
      return `price rises above $${condition.targetPrice.toFixed(2)}`;
    case "price_below":
      return `price falls below $${condition.targetPrice.toFixed(2)}`;
    case "ma_cross_above":
      return `price crosses above its ${condition.maPeriod}-day moving average`;
    case "ma_cross_below":
      return `price crosses below its ${condition.maPeriod}-day moving average`;
    case "volume_spike":
      return `volume rises above ${condition.multiplier}x the 20-day average`;
    case "breaks_resistance":
      return "price breaks through resistance";
    case "breaks_support":
      return "price breaks below support";
  }
}

export function describeAlert(rule: AlertRule): string {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (conditions.length === 0) return "No conditions set";
  const [first, ...rest] = conditions.map(describeCondition);
  const capitalized = first.charAt(0).toUpperCase() + first.slice(1);
  return rest.length === 0 ? capitalized : `${capitalized}, and ${rest.join(", and ")}`;
}

export function alertTierLabel(tier: "all" | "some"): string {
  return tier === "all" ? "Look now" : "Worth attention";
}

export function notificationMessage(rule: AlertRule, ctx: AlertCheckContext, evaluation: AlertEvaluation): string {
  const base = `${rule.symbol} is now at $${ctx.price.toFixed(2)}`;
  if (rule.conditions.length <= 1) {
    return evaluation.metConditions[0] ? `${base} — ${describeCondition(evaluation.metConditions[0])}` : base;
  }
  if (evaluation.tier === "all") {
    return `${base} — all conditions met: ${evaluation.metConditions.map(describeCondition).join(", ")}`;
  }
  return `${base} — ${evaluation.metConditions.map(describeCondition).join(", ")} (not yet: ${evaluation.unmetConditions.map(describeCondition).join(", ")})`;
}
