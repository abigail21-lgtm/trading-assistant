import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Per-user data -- must never be cached by any layer (browser, CDN, service
// worker). Explicit rather than relying on Next's cookie-usage auto-detection,
// since that's a framework heuristic an edge/CDN layer might not honor.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NOT_CONFIGURED = NextResponse.json(
  { error: "Supabase is not configured; the client should use local storage instead." },
  { status: 501 },
);

export async function GET() {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase
    .from("watchlist")
    .select("symbol")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ symbols: data.map((row) => row.symbol) });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const symbol = typeof body?.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  // ignoreDuplicates -- ON CONFLICT DO NOTHING -- because plain upsert
  // generates ON CONFLICT DO UPDATE, which needs an UPDATE policy that this
  // table doesn't have (there's nothing to update here; the row either
  // exists or it doesn't). Without this, re-starring a symbol whose row
  // still exists silently fails RLS: the client never checked the response,
  // so the star showed as "on" while nothing was actually written.
  const { error } = await supabase
    .from("watchlist")
    .upsert({ user_id: user.id, symbol }, { onConflict: "user_id,symbol", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return NextResponse.json({ error: "Missing symbol" }, { status: 400 });

  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("user_id", user.id)
    .eq("symbol", symbol);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
