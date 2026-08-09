import type { PriceAnalysis } from "./analysis";
import type { PeriodReturn } from "./comparison";
import type { VolatilityWindow } from "./volatility";
import type { SentimentSummary } from "./sentiment";
import { formatPercent, formatPrice } from "../format";

export interface DeepDiveInput {
  analysis: PriceAnalysis;
  currentPrice: number | null;
  currency: string;
  periodLabel: string;
  stockReturn: PeriodReturn | null;
  marketReturn: PeriodReturn | null;
  sectorReturn: PeriodReturn | null;
  volatility: VolatilityWindow[] | null;
  stockSentiment: SentimentSummary | null;
  marketSentiment: SentimentSummary | null;
  bullishNewsCount: number;
  bearishNewsCount: number;
  newsCount: number;
  latestVolume: number | null;
  avgVolume20: number | null;
}

/**
 * Synthesizes a handful of plain-language observations from data already
 * computed elsewhere on the page (trend/levels, comparison returns,
 * volatility, sentiment, news tone) into one combined list -- not a new
 * analysis, just points from the chart and articles gathered in one place,
 * for an optional "see more" rather than cluttering the main card. Purely
 * descriptive of what's already true in the data, never a recommendation.
 */
export function buildDeepDivePoints(input: DeepDiveInput): string[] {
  const points: string[] = [];

  if (input.currentPrice != null) {
    const nearestSupport = input.analysis.levels
      .filter((l) => l.type === "support")
      .sort((a, b) => b.price - a.price)[0];
    const nearestResistance = input.analysis.levels
      .filter((l) => l.type === "resistance")
      .sort((a, b) => a.price - b.price)[0];
    if (nearestSupport && nearestResistance) {
      const toSupport = ((input.currentPrice - nearestSupport.price) / input.currentPrice) * 100;
      const toResistance = ((nearestResistance.price - input.currentPrice) / input.currentPrice) * 100;
      points.push(
        `Price sits ${toSupport.toFixed(1)}% above its nearest support (${formatPrice(nearestSupport.price, input.currency)}) and ${toResistance.toFixed(1)}% below its nearest resistance (${formatPrice(nearestResistance.price, input.currency)}).`,
      );
    }
  }

  if (input.latestVolume != null && input.avgVolume20 != null && input.avgVolume20 > 0) {
    const diffPercent = ((input.latestVolume - input.avgVolume20) / input.avgVolume20) * 100;
    if (Math.abs(diffPercent) >= 15) {
      points.push(
        `Latest volume is ${Math.abs(diffPercent).toFixed(0)}% ${diffPercent > 0 ? "above" : "below"} its 20-period average.`,
      );
    } else {
      points.push("Volume is in line with its recent 20-period average — no unusual activity.");
    }
  }

  const vol20 = input.volatility?.find((v) => v.days === 20)?.annualizedPercent ?? null;
  const vol60 = input.volatility?.find((v) => v.days === 60)?.annualizedPercent ?? null;
  if (vol20 != null && vol60 != null) {
    const direction = vol20 > vol60 * 1.1 ? "picked up" : vol20 < vol60 * 0.9 ? "cooled off" : "held steady";
    points.push(
      `Realized volatility has ${direction} recently — ${vol20.toFixed(0)}% (20-day) vs ${vol60.toFixed(0)}% (60-day), annualized.`,
    );
  }

  if (input.stockReturn?.returnPercent != null) {
    const parts = [`${input.stockReturn.symbol} is ${formatPercent(input.stockReturn.returnPercent)} over ${input.periodLabel}`];
    if (input.marketReturn?.returnPercent != null) {
      const delta = input.stockReturn.returnPercent - input.marketReturn.returnPercent;
      parts.push(
        `${delta >= 0 ? "outperforming" : "underperforming"} the market (${formatPercent(input.marketReturn.returnPercent)}) by ${Math.abs(delta).toFixed(1)} points`,
      );
    }
    if (input.sectorReturn?.returnPercent != null) {
      const delta = input.stockReturn.returnPercent - input.sectorReturn.returnPercent;
      parts.push(
        `${delta >= 0 ? "ahead of" : "behind"} its sector (${formatPercent(input.sectorReturn.returnPercent)}) by ${Math.abs(delta).toFixed(1)} points`,
      );
    }
    points.push(`${parts.join(", ")}.`);
  }

  if (input.stockSentiment && input.stockSentiment.label !== "Unknown" && input.stockSentiment.bullishPercent != null) {
    let sentence = `StockTwits sentiment for this stock runs ${input.stockSentiment.bullishPercent.toFixed(0)}% bullish across ${input.stockSentiment.taggedTotal} tagged messages`;
    if (
      input.marketSentiment &&
      input.marketSentiment.label !== "Unknown" &&
      input.marketSentiment.bullishPercent != null
    ) {
      sentence += `, versus ${input.marketSentiment.bullishPercent.toFixed(0)}% for the broader market`;
    }
    points.push(`${sentence}.`);
  }

  if (input.newsCount > 0 && (input.bullishNewsCount > 0 || input.bearishNewsCount > 0)) {
    points.push(
      `Of the ${input.newsCount} most recent headlines, ${input.bullishNewsCount} read bullish and ${input.bearishNewsCount} read bearish by keyword — a rough tone read, not real analysis.`,
    );
  }

  return points;
}
