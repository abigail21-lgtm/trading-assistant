import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const PUBLIC_PAGE_PREFIXES = ["/login", "/auth"];

// This used to call supabase.auth.getUser() here -- an actual network
// round-trip to Supabase's auth server, on every single navigation, since
// this proxy isn't excluded for page routes. Next's own docs warn proxy
// "is not intended for slow data fetching" and shouldn't be relied on as a
// full session/auth solution; in practice that call was intermittently
// hanging or failing on this specific path (the Edge runtime -- a different
// network route from the Node-based API routes/pages that also talk to
// Supabase and have stayed reliable), crashing navigation outright for
// every account on every device after as little as one successful click.
// Both a try/catch and a 4s timeout around that call still wasn't enough to
// stop it, so the real fix is to not make the network call from here at all.
//
// This is only ever used for a redirect-for-UX optimization (bounce a
// signed-out visitor to /login, bounce a signed-in one away from /login) --
// every protected API route and page already does its own authoritative
// getUser() check server-side, backed by RLS, so this doesn't need to
// validate the session, just check whether one plausibly exists. Supabase's
// browser client keeps this cookie fresh on its own (it auto-refreshes the
// session and writes the new value directly via document.cookie), so a
// presence check is enough and needs zero network access.
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

export function proxy(request: NextRequest) {
  // No Supabase project configured yet: run in local mode, no auth gate.
  if (!isSupabaseConfigured) return NextResponse.next();

  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith("/api");
  const isPublicPage = PUBLIC_PAGE_PREFIXES.some((p) => pathname.startsWith(p));
  const loggedIn = hasSessionCookie(request);

  if (!loggedIn && !isApiRoute && !isPublicPage) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (loggedIn && pathname === "/login") {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons/).*)",
  ],
};
