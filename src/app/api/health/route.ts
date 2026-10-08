import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { BROWSER_HEADERS, timeoutSignal, withTimeout } from "@/lib/market/http";

// Public status check for diagnosing a slow or stuck deployment: which build
// is live and how long each upstream takes to answer from the host. No user
// data, no auth, and at most one small request per upstream.
export const dynamic = "force-dynamic";

async function timed(name: string, fn: () => Promise<boolean>) {
  const start = Date.now();
  const ok = await withTimeout(fn().catch(() => false), 9000, false);
  return { name, ok, ms: Date.now() - start };
}

export async function GET() {
  const checks = await Promise.all([
    timed("yahoo-chart", async () => {
      const res = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5d&interval=1d", {
        headers: BROWSER_HEADERS,
        cache: "no-store",
        signal: timeoutSignal(8000),
      });
      return res.ok;
    }),
    timed("supabase", async () => {
      if (!isSupabaseConfigured) return true;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
        headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
        cache: "no-store",
        signal: timeoutSignal(8000),
      });
      return res.ok;
    }),
  ]);
  return NextResponse.json(
    {
      commit: process.env.COMMIT_REF?.slice(0, 7) ?? "unknown",
      accounts: isSupabaseConfigured,
      checks,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
