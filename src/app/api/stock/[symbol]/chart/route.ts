import { NextResponse } from "next/server";
import { getChart, SymbolNotFoundError } from "@/lib/market/yahoo";

export const revalidate = 300;

const ALLOWED_RANGES = new Set([
  "1d",
  "5d",
  "1mo",
  "3mo",
  "6mo",
  "1y",
  "2y",
  "5y",
  "max",
]);
const ALLOWED_INTERVALS = new Set(["1d", "1wk", "1mo"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> },
) {
  const { symbol } = await params;
  const { searchParams } = new URL(request.url);
  const range = searchParams.get("range") ?? "6mo";
  const interval = searchParams.get("interval") ?? "1d";

  if (!ALLOWED_RANGES.has(range) || !ALLOWED_INTERVALS.has(interval)) {
    return NextResponse.json(
      { error: "Invalid range or interval" },
      { status: 400 },
    );
  }

  try {
    const data = await getChart(symbol, range, interval);
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
