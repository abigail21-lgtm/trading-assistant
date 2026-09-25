import { NextResponse } from "next/server";
import { INDEX_FUNDS } from "@/lib/signals/dip";
import { getDipSnapshots } from "@/lib/signals/load";
import { getServerRules } from "@/lib/signals/rules-server";

// Reads the user's rules (cookie / account), so never cached.
export const dynamic = "force-dynamic";

export interface SignalRow {
  symbol: string;
  status: string | null;
  grade: "go" | "caution" | "pass" | null;
  headline: string;
  reason: string;
  holdDay: number | null;
  maxHold: number;
}

/** Dip-in-an-uptrend status for the index funds plus the given watchlist symbols. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const watchlist = Array.from(
    new Set(
      (searchParams.get("symbols") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && !INDEX_FUNDS.includes(s)),
    ),
  ).slice(0, 40);

  const rules = await getServerRules();
  const symbols = [...(rules.scanIndexFunds ? INDEX_FUNDS : []), ...(rules.scanWatchlist ? watchlist : [])];
  const results = await getDipSnapshots(symbols, rules);
  const rows: SignalRow[] = results.map(({ symbol, snapshot }) =>
    snapshot
      ? {
          symbol,
          status: snapshot.evaluation.status,
          grade: snapshot.grade.grade,
          headline: snapshot.grade.headline,
          reason: snapshot.grade.reason,
          holdDay: snapshot.evaluation.holdDay,
          maxHold: snapshot.evaluation.params.maxHoldBars,
        }
      : {
          symbol,
          status: null,
          grade: null,
          headline: "Couldn't load",
          reason: "Price data didn't load. Try again shortly.",
          holdDay: null,
          maxHold: 5,
        },
  );
  return NextResponse.json({
    index: rows.filter((r) => INDEX_FUNDS.includes(r.symbol)),
    watchlist: rows.filter((r) => !INDEX_FUNDS.includes(r.symbol)),
    scanIndexFunds: rules.scanIndexFunds,
    scanWatchlist: rules.scanWatchlist,
  });
}
