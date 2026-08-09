import type { Trend, SupportResistanceLevel } from "./analysis";
import type { VolatilityWindow } from "./volatility";
import type { SentimentSummary } from "./sentiment";
import { formatPrice } from "../format";

export interface DeepDiveInput {
  trend: Trend;
  currentPrice: number | null;
  currency: string;
  nearestSupport: SupportResistanceLevel | null;
  nearestResistance: SupportResistanceLevel | null;
  volatility: VolatilityWindow[] | null;
  latestVolume: number | null;
  avgVolume20: number | null;
  stockSentiment: SentimentSummary | null;
  marketSentiment: SentimentSummary | null;
}

const TREND_PHRASE: Record<Trend, string> = {
  uptrend: "trending up",
  downtrend: "trending down",
  range: "range-bound",
};

/**
 * Everything here is already visible elsewhere on the page as a raw number
 * (volatility %, volume, sentiment %, S/R price) -- restating any one of
 * them alone adds nothing. The point of this section is to connect two or
 * three of those numbers into a reading that isn't obvious from glancing at
 * each card individually: a divergence, a confirmation, or a setup. When
 * nothing meaningfully connects, say so rather than manufacturing filler.
 */
export function buildDeepDivePoints(input: DeepDiveInput): string[] {
  const points: string[] = [];

  // Volatility direction + trend: is the current move (or lack of one)
  // speeding up or settling down?
  const vol20 = input.volatility?.find((v) => v.days === 20)?.annualizedPercent ?? null;
  const vol60 = input.volatility?.find((v) => v.days === 60)?.annualizedPercent ?? null;
  if (vol20 != null && vol60 != null) {
    const rising = vol20 > vol60 * 1.1;
    const falling = vol20 < vol60 * 0.9;
    if (rising || falling) {
      let read: string;
      if (input.trend === "range" && rising) {
        read = "often a squeeze building toward a bigger move in either direction";
      } else if (input.trend === "range" && falling) {
        read = "consolidation settling down rather than building toward a breakout";
      } else if (rising) {
        read = "the move looks like it's accelerating, not just continuing";
      } else {
        read = "the trend is holding without picking up steam";
      }
      points.push(
        `Volatility has ${rising ? "picked up" : "cooled off"} recently (${vol20.toFixed(0)}% 20-day vs ${vol60.toFixed(0)}% 60-day, annualized) while the stock is ${TREND_PHRASE[input.trend]} — ${read}.`,
      );
    }
  }

  // S/R proximity + volume: is price actually testing a level, and does
  // volume back that up or call it into question?
  if (input.currentPrice != null && (input.nearestSupport || input.nearestResistance)) {
    const distances = [
      input.nearestResistance && {
        level: input.nearestResistance,
        percent: ((input.nearestResistance.price - input.currentPrice) / input.currentPrice) * 100,
      },
      input.nearestSupport && {
        level: input.nearestSupport,
        percent: ((input.currentPrice - input.nearestSupport.price) / input.currentPrice) * 100,
      },
    ].filter((d): d is { level: SupportResistanceLevel; percent: number } => !!d && d.percent >= 0);
    const nearest = distances.sort((a, b) => a.percent - b.percent)[0];

    if (nearest && nearest.percent <= 3 && input.latestVolume != null && input.avgVolume20 != null && input.avgVolume20 > 0) {
      const volumeDiff = ((input.latestVolume - input.avgVolume20) / input.avgVolume20) * 100;
      if (Math.abs(volumeDiff) >= 15) {
        const levelWord = nearest.level.type === "resistance" ? "resistance" : "support";
        const volumeWord = volumeDiff > 0 ? "above-average" : "below-average";
        const read =
          volumeDiff > 0
            ? "a test on above-average volume carries more conviction than a quiet one"
            : "light volume here means a break either way would carry less conviction";
        points.push(
          `Price is within ${nearest.percent.toFixed(1)}% of ${levelWord} (${formatPrice(nearest.level.price, input.currency)}) on ${volumeWord} volume — ${read}.`,
        );
      }
    }
  }

  // Sentiment vs the market: does trader mood here diverge meaningfully
  // from the broader market's, independent of price action?
  if (
    input.stockSentiment &&
    input.stockSentiment.label !== "Unknown" &&
    input.stockSentiment.bullishPercent != null &&
    input.marketSentiment &&
    input.marketSentiment.label !== "Unknown" &&
    input.marketSentiment.bullishPercent != null
  ) {
    const delta = input.stockSentiment.bullishPercent - input.marketSentiment.bullishPercent;
    if (Math.abs(delta) >= 15) {
      const direction = delta > 0 ? "more bullish" : "more bearish";
      const context =
        input.trend === "range"
          ? "even while the price itself hasn't broken out either way"
          : `while price is ${TREND_PHRASE[input.trend]}`;
      points.push(
        `Traders here run ${direction} (${input.stockSentiment.bullishPercent.toFixed(0)}% vs ${input.marketSentiment.bullishPercent.toFixed(0)}% bullish market-wide) ${context}.`,
      );
    }
  }

  if (points.length === 0) {
    points.push(
      "Nothing stands out right now — volatility, volume near key levels, and sentiment vs the market all look broadly ordinary.",
    );
  }

  return points;
}
