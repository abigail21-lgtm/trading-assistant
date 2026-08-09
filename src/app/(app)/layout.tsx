import { createClient } from "@/lib/supabase/server";
import NavShell from "@/components/NavShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <NavShell userEmail={user?.email ?? null}>{children}</NavShell>;
}
