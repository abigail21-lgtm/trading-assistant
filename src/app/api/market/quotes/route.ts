import { NextResponse } from "next/server";
import { getManyQuoteSummaries } from "@/lib/market/yahoo";

export const revalidate = 300;

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

  if (symbols.length === 0) return NextResponse.json({ quotes: [] });

  const quotes = await getManyQuoteSummaries(symbols.map((symbol) => ({ symbol, name: symbol })));
  return NextResponse.json({ quotes });
}
