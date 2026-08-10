import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const PUBLIC_PAGE_PREFIXES = ["/login", "/auth"];

export async function proxy(request: NextRequest) {
  // No Supabase project configured yet: run in local mode, no auth gate.
  if (!isSupabaseConfigured) return NextResponse.next();

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Refreshes the auth token if needed; required so server components see a
  // valid session. Do not remove or add logic between client creation and
  // this call, per Supabase's SSR guidance.
  //
  // This runs on every navigation (this proxy isn't excluded for page
  // routes), and Next's own docs warn proxy/middleware "is not intended for
  // slow data fetching" and shouldn't be relied on as a full auth solution.
  // A hiccup reaching Supabase's auth server here used to throw unhandled
  // (or simply hang past whatever the edge runtime's execution limit is) and
  // crash the whole request, which surfaces to the browser as a hard "failed
  // to fetch" / "page couldn't load" rather than a normal error page -- for
  // every page, on every account, since this path runs unconditionally.
  // Bound it with a timeout in addition to the try/catch: a plain catch
  // only handles the call rejecting, not it hanging indefinitely, and this
  // proxy runs on the Edge runtime -- a different network path from the
  // Node-based API routes/pages that also call Supabase and have been fine.
  // Fail open on either failure mode: every protected API route and page
  // already does its own getUser() check server-side (backed by RLS), so
  // skipping the redirect here doesn't weaken security, it just stops a
  // flaky or slow auth-refresh call from taking down navigation entirely.
  let user = null;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("auth refresh timed out")), 4000)),
    ]);
    user = result.data.user;
  } catch {
    return supabaseResponse;
  }

  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api");
  const isPublicPage = PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p));

  if (!user && !isApiRoute && !isPublicPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)",
  ],
};
