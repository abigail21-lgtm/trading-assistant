import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render; middleware refreshes
            // the session on the next request, so this is safe to ignore.
          }
        },
      },
    },
  );
}

/**
 * The signed-in user, or null -- including when Supabase doesn't answer
 * within a few seconds. Every route that needs the user goes through this:
 * an unreachable or paused project must turn into a quick "not signed in",
 * never a request that hangs until the platform kills it.
 */
export async function getSignedInUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000));
  const result = await Promise.race([supabase.auth.getUser().catch(() => null), timeout]);
  return result?.data.user ?? null;
}
