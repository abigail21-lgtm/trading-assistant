import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { TrendLine } from "@/lib/market/drawings";

const NOT_CONFIGURED = NextResponse.json(
  { error: "Supabase is not configured; the client should use local storage instead." },
  { status: 501 },
);

export async function GET(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const timeframe = searchParams.get("timeframe");
  if (!symbol || !timeframe) return NextResponse.json({ error: "Missing symbol or timeframe" }, { status: 400 });

  const { data, error } = await supabase
    .from("drawings")
    .select("line")
    .eq("symbol", symbol)
    .eq("timeframe", timeframe)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ lines: data.map((row) => row.line) });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as
    | { symbol?: string; timeframe?: string; line?: TrendLine }
    | null;
  if (!body?.symbol || !body.timeframe || !body.line?.id) {
    return NextResponse.json({ error: "Invalid drawing" }, { status: 400 });
  }

  const { error } = await supabase.from("drawings").insert({
    id: body.line.id,
    user_id: user.id,
    symbol: body.symbol.toUpperCase(),
    timeframe: body.timeframe,
    line: body.line,
  });

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
  const symbol = searchParams.get("symbol")?.toUpperCase();
  const timeframe = searchParams.get("timeframe");
  const id = searchParams.get("id");
  if (!symbol || !timeframe) return NextResponse.json({ error: "Missing symbol or timeframe" }, { status: 400 });

  // With an id: delete just that one line. Without: clear every line for
  // this symbol + timeframe (the chart's "Clear lines" action).
  let query = supabase.from("drawings").delete().eq("user_id", user.id).eq("symbol", symbol).eq("timeframe", timeframe);
  if (id) query = query.eq("id", id);
  const { error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
