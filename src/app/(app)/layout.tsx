import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import NavShell from "@/components/NavShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let userEmail: string | null = null;

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
  }

  return <NavShell userEmail={userEmail}>{children}</NavShell>;
}
