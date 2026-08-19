import { NextResponse } from "next/server";
import { getChart } from "@/lib/market/yahoo";
import { computePeriodReturn } from "@/lib/market/comparison";
import {
  COMPARE_RANGES,
  MAX_COMPARE_SYMBOLS,
  normalizeToPercent,
  type CompareSeries,
} from "@/lib/market/compare";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rangeKey = searchParams.get("range") ?? "6mo";
  const rangeDef = COMPARE_RANGES.find((r) => r.key === rangeKey);
  if (!rangeDef) {
    return NextResponse.json({ error: "Invalid range" }, { status: 400 });
  }

  const symbols = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, MAX_COMPARE_SYMBOLS);

  if (symbols.length === 0) {
    return NextResponse.json({ series: [] });
  }

  const series: CompareSeries[] = await Promise.all(
    symbols.map(async (symbol): Promise<CompareSeries> => {
      try {
        const { candles, meta } = await getChart(symbol, rangeDef.range, rangeDef.interval);
        if (candles.length === 0) throw new Error("No candles");
        const { returnPercent } = computePeriodReturn(candles, symbol, meta.shortName || symbol);
        return {
          symbol,
          name: meta.shortName || meta.longName || symbol,
          ok: true,
          points: normalizeToPercent(candles),
          returnPercent,
        };
      } catch {
        return { symbol, name: symbol, ok: false, points: [], returnPercent: null };
      }
    }),
  );

  return NextResponse.json({ series });
}
