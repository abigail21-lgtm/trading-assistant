import { NextResponse } from "next/server";
import { getUpcomingEarningsForSymbols } from "@/lib/market/calendar";

export const revalidate = 21600;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("symbols") ?? "";
  const symbols = Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    ),
  ).slice(0, 50);

  if (symbols.length === 0) return NextResponse.json({ events: [] });

  const bySymbol = await getUpcomingEarningsForSymbols(symbols);
  return NextResponse.json({ events: Array.from(bySymbol.values()) });
}
