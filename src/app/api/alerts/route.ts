import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Per-user data -- see src/app/api/watchlist/route.ts for why this is explicit.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
import type { AlertRule } from "@/lib/market/alerts";

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
    .from("alerts")
    .select("rule")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ alerts: data.map((row) => row.rule) });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const rule = (await request.json().catch(() => null)) as AlertRule | null;
  if (!rule?.id || !rule.symbol) {
    return NextResponse.json({ error: "Invalid alert rule" }, { status: 400 });
  }

  const { error } = await supabase
    .from("alerts")
    .insert({ id: rule.id, user_id: user.id, symbol: rule.symbol.toUpperCase(), rule });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { id?: string; lastFiredAt?: number } | null;
  if (!body?.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { data: existing, error: fetchError } = await supabase
    .from("alerts")
    .select("rule")
    .eq("id", body.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Alert not found" }, { status: 404 });

  const updatedRule = { ...existing.rule, lastFiredAt: body.lastFiredAt ?? null };
  const { error } = await supabase
    .from("alerts")
    .update({ rule: updatedRule })
    .eq("id", body.id)
    .eq("user_id", user.id);

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
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabase.from("alerts").delete().eq("id", id).eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
