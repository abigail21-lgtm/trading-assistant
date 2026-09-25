import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { parseRules, RULES_COOKIE, serializeRules } from "@/lib/signals/rules";
import { getServerRules } from "@/lib/signals/rules-server";

// Per-user data -- see src/app/api/watchlist/route.ts for why this is explicit.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const ONE_YEAR = 60 * 60 * 24 * 365;

export async function GET() {
  return NextResponse.json({ rules: await getServerRules() });
}

/** Saves the user's rules to the cookie, and to their account when signed in. */
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  const rules = parseRules(body?.rules);

  const store = await cookies();
  store.set(RULES_COOKIE, serializeRules(rules), { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });

  let savedToAccount = false;
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, rules, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) {
        return NextResponse.json(
          { rules, savedToAccount: false, error: `Saved on this device only: ${error.message}` },
          { status: 200 },
        );
      }
      savedToAccount = true;
    }
  }
  return NextResponse.json({ rules, savedToAccount });
}
