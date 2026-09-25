import { NextResponse } from "next/server";
import { getChart, type Candle } from "@/lib/market/yahoo";
import { paramsFor } from "@/lib/signals/dip";
import { getServerRules } from "@/lib/signals/rules-server";
import { evaluateEntry, type EntryEvaluation } from "@/lib/journal/evaluate";

export const dynamic = "force-dynamic";

interface TradeRef {
  id: string;
  underlying: string;
  openDate: string;
  closeDate: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** What the dip signal said on the day of each trade. Only prices, symbols and dates are sent here. */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const refs: TradeRef[] = Array.isArray(body?.trades)
    ? body.trades
        .filter(
          (t: TradeRef) =>
            t &&
            typeof t.id === "string" &&
            typeof t.underlying === "string" &&
            /^[A-Z][A-Z0-9.]{0,9}$/.test(t.underlying) &&
            ISO.test(t.openDate) &&
            (t.closeDate == null || ISO.test(t.closeDate)),
        )
        .slice(0, 500)
    : [];
  const rules = await getServerRules();
  const symbols = [...new Set(refs.map((r) => r.underlying))].slice(0, 60);
  const charts = new Map<string, Candle[] | null>(
    await Promise.all(
      symbols.map(async (s) => [s, await getChart(s, "5y", "1d").then((c) => c.candles).catch(() => null)] as const),
    ),
  );
  const evals: Record<string, EntryEvaluation> = {};
  for (const r of refs) {
    const candles = charts.get(r.underlying);
    if (!candles) continue;
    evals[r.id] = evaluateEntry(candles, r.openDate, r.closeDate, paramsFor(r.underlying, rules.stockDipDepth));
  }
  return NextResponse.json({ evals });
}
