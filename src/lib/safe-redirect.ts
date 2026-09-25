/**
 * A post-login destination must be a path on this site. Anything else --
 * another site ("https://evil.example", "//evil.example", "/\\evil.example")
 * or a script URL ("javascript:...") -- falls back to the home page. Without
 * this, a crafted login link could send you elsewhere after signing in, or
 * run someone else's code in your signed-in session.
 */
export function safeRedirectPath(value: string | null | undefined, fallback = "/"): string {
  if (!value) return fallback;
  const v = value.trim();
  if (!v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) return fallback;
  // Control characters and backslashes can be normalised by browsers into
  // something else entirely; there's no legitimate need for them here.
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
  try {
    const url = new URL(v, "https://placeholder.invalid");
    if (url.origin !== "https://placeholder.invalid") return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
