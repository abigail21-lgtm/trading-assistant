import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Landing point for the magic-link email. Requires the Supabase "Magic Link"
// email template to be updated to point here (see README setup steps).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  if (!isSupabaseConfigured) {
    return NextResponse.redirect(new URL("/", origin));
  }

  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=invalid-link", origin));
}
