import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { RhTransaction } from "@/lib/journal/robinhood";

// Per-user data -- see src/app/api/watchlist/route.ts for why this is explicit.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NOT_CONFIGURED = NextResponse.json(
  { error: "Supabase is not configured; the client should use local storage instead." },
  { status: 501 },
);
const MAX_ROWS = 20_000;

function clean(raw: unknown): RhTransaction[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_ROWS) return null;
  const out: RhTransaction[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || typeof r.date !== "string" || typeof r.code !== "string") return null;
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
    out.push({
      date: r.date.slice(0, 10),
      code: String(r.code).slice(0, 12),
      instrument: String(r.instrument ?? "").slice(0, 16),
      description: String(r.description ?? "").slice(0, 200),
      quantity: num(r.quantity),
      price: num(r.price),
      amount: num(r.amount),
    });
  }
  return out;
}

export async function GET() {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { data, error } = await supabase.from("user_settings").select("journal").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ transactions: data?.journal ?? [] });
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured) return NOT_CONFIGURED;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const transactions = clean(body?.transactions);
  if (!transactions) return NextResponse.json({ error: "Invalid transactions" }, { status: 400 });
  const { error } = await supabase
    .from("user_settings")
    .upsert({ user_id: user.id, journal: transactions, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
