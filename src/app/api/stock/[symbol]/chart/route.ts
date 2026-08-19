import { NextResponse } from "next/server";
import { getChart, SymbolNotFoundError } from "@/lib/market/yahoo";
import { TIMEFRAMES, DEFAULT_TIMEFRAME_KEY } from "@/lib/market/timeframes";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const tfKey = searchParams.get("tf") ?? DEFAULT_TIMEFRAME_KEY;
  const timeframe = TIMEFRAMES.find((tf) => tf.key === tfKey);

  if (!timeframe) {
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  }

  try {
    const data = await getChart(symbol, timeframe.range, timeframe.interval);
    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof SymbolNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    console.error(`Failed to load chart for ${symbol}:`, err);
    return NextResponse.json(
      { error: "Failed to load market data. Try again shortly." },
      { status: 502 },
    );
  }
}
