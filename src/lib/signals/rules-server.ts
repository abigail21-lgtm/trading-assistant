import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fromCookie;
    const { data } = await supabase.from("user_settings").select("rules").eq("user_id", user.id).maybeSingle();
    return data ? parseRules(data.rules) : fromCookie;
  } catch {
    // A missing table (schema not re-run yet) or a network blip shouldn't break the page.
    return fromCookie;
  }
}
