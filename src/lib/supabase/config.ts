// True once real Supabase credentials are set. Until then the app runs in
// "local mode": no accounts, watchlist kept in browser localStorage. See
// README setup steps for switching this on.
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
