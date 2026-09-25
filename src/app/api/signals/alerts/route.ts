import { NextResponse } from "next/server";
import { INDEX_FUNDS } from "@/lib/signals/dip";
import { getDipSnapshots } from "@/lib/signals/load";
import { getServerRules } from "@/lib/signals/rules-server";
import { dueDipAlerts } from "@/lib/signals/dip-alerts";

// Reads the user's rules and live prices; never cached.
export const dynamic = "force-dynamic";

/**
 * Dip alerts due right now for the index funds, the given watchlist symbols
 * and any trades marked as bought, per the user's rules. Used by the in-app
 * checker in local mode; the scheduled push job computes the same thing
 * server-side in accounts mode.
 */
export async function GET(request: Request) {
  const rules = await getServerRules();
  if (!rules.alerts.buyZone && !rules.alerts.sell && !rules.alerts.newDip) {
    return NextResponse.json({ alerts: [] });
  }
  const { searchParams } = new URL(request.url);
  const watchlist = (searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 40);
  const symbols = Array.from(
    new Set([
      ...(rules.scanIndexFunds ? INDEX_FUNDS : []),
      ...(rules.scanWatchlist ? watchlist : []),
      ...rules.positions.map((p) => p.symbol),
    ]),
  );
  const now = Date.now();
  const results = await getDipSnapshots(symbols, rules);
  const alerts = results.flatMap(({ symbol, snapshot }) => (snapshot ? dueDipAlerts(symbol, snapshot.evaluation, rules, now) : []));
  return NextResponse.json({ alerts });
}
