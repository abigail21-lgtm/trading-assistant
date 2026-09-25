import type { NextConfig } from "next";

// Browser-side hardening for every response. Deliberately no script-src
// allowlist yet: the inline theme script and Next's own inline scripts
// would need nonces first, and a CSP that breaks the app gets turned off.
const SECURITY_HEADERS = [
  // Nobody can embed the app in a frame (clickjacking).
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // HTTPS only, for two years (Netlify serves HTTPS; this stops downgrade attempts).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
