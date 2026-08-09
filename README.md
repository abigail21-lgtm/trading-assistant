# Trading Assistant

A PWA for quickly analyzing a stock for trading: market overview, sector
trends, an interactive chart with moving averages, and a personal watchlist.
Installable on both phone and laptop. Built entirely on free data sources —
see [Architecture](#architecture) below.

This is **Phase 1** of the build: auth, the app shell, the home page (market +
sectors + watchlist), and the stock page (search + chart). News, ratings,
sentiment, the event calendar, and alerts/notifications come in later phases.

## Setup

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

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from step 1.

No other API keys are needed for Phase 1 — market data comes from Yahoo
Finance's public chart endpoint, which requires no key.

### 3. Run it

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with your email
(you'll get a magic link), and you're in.

## Architecture

- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind CSS.
- **Auth:** Supabase Auth, email magic links (no passwords). `src/proxy.ts`
  (Next 16's renamed middleware) refreshes the session and gates every page
  except `/login`.
- **Data:** `src/lib/market/yahoo.ts` reads Yahoo Finance's unofficial,
  keyless `v8/finance/chart` endpoint for quotes and OHLCV history. Server
  fetches are cached for 5 minutes via Next's `fetch` cache
  (`next: { revalidate: 300 }`) so the free, rate-limited endpoint is only
  hit once per symbol per cache window — shared across every user, not
  once per user.
- **Watchlist:** stored per-user in Supabase Postgres (`supabase/schema.sql`),
  behind row-level security. `src/app/api/watchlist/route.ts` handles
  add/remove.
- **Chart:** [TradingView Lightweight Charts](https://github.com/tradingview/lightweight-charts)
  (open-source, free) — candlesticks, volume, and 20/50/200-day moving
  averages, all computed client-side from the OHLCV history.
- **PWA:** `public/manifest.json` + `public/sw.js` (hand-rolled, no
  framework plugin) make the app installable on phone and laptop, with
  static-asset caching for offline resilience. Market/auth data is
  deliberately never cached by the service worker, so you never see stale
  prices.

## What's next

See the phased roadmap discussed with the user: news, sentiment, analyst
ratings, the event calendar, stock-vs-market/sector comparison, custom
alerts + push notifications, and persisted chart drawings.
