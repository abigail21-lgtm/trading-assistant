import LoginForm from "@/components/LoginForm";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { timeoutSignal } from "@/lib/market/http";

// Rendered on the server so the form is in the very first paint (it used to
// be blank until scripts loaded, which on a phone's installed app looked
// like a splash screen that never ended), and so a sign-in service that
// can't be reached is explained instead of failing silently on submit.
export const dynamic = "force-dynamic";

async function supabaseReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      cache: "no-store",
      signal: timeoutSignal(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redirectTo?: string }> }) {
  const { redirectTo } = await searchParams;
  const serviceDown = isSupabaseConfigured ? !(await supabaseReachable()) : false;
  return <LoginForm redirectTo={safeRedirectPath(redirectTo)} serviceDown={serviceDown} />;
}
