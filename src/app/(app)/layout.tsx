import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import NavShell from "@/components/NavShell";
import { withTimeout } from "@/lib/market/http";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userEmail: string | null = null;

  if (isSupabaseConfigured) {
    // Only used to show the signed-in email in the header, and this layout
    // wraps every page: a slow or paused Supabase project must not hold the
    // whole app (and the installed app's splash screen) hostage.
    const supabase = await createClient();
    const result = await withTimeout(supabase.auth.getUser(), 4000, null);
    userEmail = result?.data.user?.email ?? null;
  }

  return <NavShell userEmail={userEmail}>{children}</NavShell>;
}
