import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { withTimeout } from "@/lib/market/http";
import { parseRules, rulesFromCookie, RULES_COOKIE, type TradingRules } from "./rules";

/**
 * The current user's rules: from their account when signed in (so they follow
 * them across devices), otherwise from this browser's cookie.
 */
export async function getServerRules(): Promise<TradingRules> {
  const store = await cookies();
  const fromCookie = rulesFromCookie(store.get(RULES_COOKIE)?.value);
  if (!isSupabaseConfigured) return fromCookie;
  try {
    const supabase = await createClient();
    const auth = await withTimeout(supabase.auth.getUser(), 4000, null);
    const user = auth?.data.user;
    if (!user) return fromCookie;
    const row = await withTimeout(
      Promise.resolve(supabase.from("user_settings").select("rules").eq("user_id", user.id).maybeSingle()),
      4000,
      null,
    );
    return row?.data ? parseRules(row.data.rules) : fromCookie;
  } catch {
    // A missing table (schema not re-run yet) or a network blip shouldn't break the page.
    return fromCookie;
  }
}
