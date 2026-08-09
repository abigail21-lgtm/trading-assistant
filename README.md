# Trading Assistant

A PWA for quickly analyzing a stock for trading: market overview, sector
trends, an interactive chart with candle sizes from 1-minute to monthly, and a
personal watchlist. Installable on both phone and laptop, light and dark mode.
Built entirely on free data sources — see [Architecture](#architecture) below.

## Local mode (default — no setup required)

Out of the box, with no configuration, the app runs in **local mode**:
there's no login, and your watchlist is saved in your browser's local
storage. Just run it:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and go. No API keys
needed — market data comes from Yahoo Finance's public chart endpoint, which
requires no key.

Local mode is meant to be swapped out for real accounts later (see below)
whenever you're ready — nothing about it needs to be ripped out first.

## Turning on real accounts (Supabase)

Switching to real Supabase-backed accounts is opt-in: set the two env vars
below and the app automatically switches from local mode to full auth +
per-user watchlists, no code changes needed.

### 1. Create a free Supabase project

Go to [supabase.com](https://supabase.com), create a free project, then:

1. **Project Settings → API** — copy the Project URL and the `anon` public key.
2. **SQL Editor → New query** — paste and run [`supabase/schema.sql`](./supabase/schema.sql).
   This creates the `watchlist` table with row-level security so each user
   only ever sees their own starred stocks.
3. **Authentication → Sign In / Providers → Email** — make sure "Email OTP" /
   magic link sign-in is enabled (it is by default).
4. **Authentication → Emails → Magic Link** — edit the template so its link
   points at your app instead of Supabase's hosted verifier. Replace the
   `{{ .ConfirmationURL }}` link with:

   ```
   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
   ```

5. **Authentication → URL Configuration** — set the Site URL to your local
   dev URL (`http://localhost:3000`) for now; add your production URL once deployed.

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
step 1, then restart the dev server. Sign-in, session handling, and the
watchlist now go through Supabase instead of local storage; anything starred
while in local mode does **not** carry over automatically (it's in the
browser's local storage, not the account).

## Architecture

- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS.
- **Auth:** Supabase Auth, email magic links (no passwords) — active only
  when `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
  (`src/lib/supabase/config.ts`). `src/proxy.ts` (Next 16's renamed
  middleware) refreshes the session and gates every page except `/login` in
  that mode; it's a no-op in local mode.
- **Watchlist:** `src/lib/watchlist-client.ts` abstracts storage — Supabase
  Postgres with row-level security (`supabase/schema.sql`,
  `src/app/api/watchlist/route.ts`) when configured, otherwise the browser's
  `localStorage`.
- **Data:** `src/lib/market/yahoo.ts` reads Yahoo Finance's unofficial,
  keyless `v8/finance/chart` endpoint for quotes and OHLCV history. Server
  fetches are cached for 5 minutes via Next's `fetch` cache
  (`next: { revalidate: 300 }`) so the free, rate-limited endpoint is only
  hit once per symbol per cache window — shared across every user, not
  once per user.
- **Chart:** [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)
  (open-source, free) — candlesticks, volume, and 20/50/200-period moving
  averages, all computed client-side from the OHLCV history. Candle size is
  selectable from 1m up to monthly (`src/lib/market/timeframes.ts`); intraday
  ranges are chosen to stay inside Yahoo's real per-interval history limits
  (1m ≈ 7 days, 5m/15m/30m ≈ 60 days, 1h ≈ 2 years).
- **Theme:** manual light/dark toggle (`src/components/ThemeToggle.tsx`)
  persisted to `localStorage`, defaulting to system preference. Uses Next's
  documented inline-script pattern to avoid a flash of the wrong theme on
  load, and a Tailwind `@custom-variant` so `dark:` utilities key off a
  `data-theme` attribute instead of only `prefers-color-scheme`.
- **PWA:** `public/manifest.json` + `public/sw.js` (hand-rolled, no
  framework plugin) make the app installable on phone and laptop, with
  static-asset caching for offline resilience. Market/auth data is
  deliberately never cached by the service worker, so you never see stale
  prices.

## What's next

Phase 2: news feed, sentiment, analyst ratings, the event calendar,
stock-vs-market/sector comparison, custom alerts + push notifications, and
persisted chart drawings.
