# MarketDesk

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
- **News:** Yahoo Finance's keyless search endpoint (`src/lib/market/news.ts`),
  used both for a stock's own news and (broad query) general market news.
- **Analyst target & company facts:** Nasdaq's public site API
  (`src/lib/market/ratings.ts`) gives a consensus 1-year price target,
  sector/industry, market cap, and dividend dates — free, but consensus-only;
  no free source we found offers a per-analyst ratings breakdown.
- **Event calendar:** Nasdaq's public earnings calendar
  (`src/lib/market/calendar.ts`), queried per-day over a 30-day rolling
  window (all callers share the same window so they hit the same cached
  per-date requests) and filtered by symbol. Every card that depends on it
  streams in via a Suspense boundary so a slow calendar fetch never blocks
  the chart/price from rendering.
- **Sentiment:** StockTwits' public per-symbol message stream
  (`src/lib/market/sentiment.ts`), aggregating recent bullish/bearish tags.
  The same function covers stock, sector (via the sector ETF's own stream),
  and market (via SPY) sentiment — no separate aggregation logic needed.
- **Performance comparison:** pure client-independent math
  (`src/lib/market/comparison.ts`) over OHLCV already fetched for the chart,
  the sector ETF, and SPY — no extra API calls beyond those two chart fetches.
- **Auto-analysis:** `src/lib/market/analysis.ts` computes a trend read
  (up/down/range, from 20/50-period moving averages) and support/resistance
  levels (clustering local pivot highs/lows) purely from OHLCV already on the
  page — no extra API calls, and it flags bounce-off-support /
  rejected-at-resistance signals.
- **Alerts:** price-target, moving-average-cross, and volume-spike rules
  (`src/lib/market/alerts.ts`), stored via `src/lib/alerts-client.ts` (same
  local/Supabase pattern as the watchlist). Checked **in-app only** —
  `src/components/AlertsWatcher.tsx` polls every 5 minutes while the app is
  open and fires a browser Notification. This is not push: it won't fire
  with the tab/app closed. True push needs a deployed server, a scheduled
  job, and VAPID keys — worth adding once this app is actually deployed
  somewhere with a scheduler available.
- **Chart drawings:** click-to-draw trend lines on the chart
  (`StockChart`'s "Draw trendline" button, using lightweight-charts'
  `subscribeClick` + `coordinateToPrice`), persisted per symbol *and*
  candle size (a line drawn on a daily chart isn't meaningful on a 1-minute
  chart) via `src/lib/drawings-client.ts`.
- **Options:** a "Options chain ↗" link to Yahoo Finance's options page for
  the ticker — no free full options-chain API worth building an in-app
  viewer around.
- **Collapsible cards:** the stock page's secondary cards (performance
  comparison, analyst target, sentiment, next earnings) show a one-line "at
  a glance" summary and expand on click (`CollapsibleCardShell`), so the
  page doesn't dump a wall of detail on mobile. Chart + News share the main
  column so there's no leftover gap next to a shorter sidebar on desktop.
- **Sector drill-down:** clicking a sector on the home page
  (`src/app/(app)/sector/[symbol]/page.tsx`) ranks that sector's major
  constituents (`src/lib/market/sector-constituents.ts` — a curated list,
  not the official reweighted holdings, which isn't free) by day/month/
  quarter performance, each linking straight to its own stock page.
- **Compare mode:** `/compare` overlays up to 4 tickers' normalized
  (%-change-from-start) performance on one chart (`src/lib/market/compare.ts`,
  `src/app/api/market/compare/route.ts`), with a sorted period-return list
  underneath. Reachable from the nav and from a "Compare" link on every
  stock page.
- **Earnings-proximity banner:** flags on the stock page when the next
  earnings date is within 5 days (`EARNINGS_PROXIMITY_DAYS` in
  `src/lib/market/calendar.ts`), since that's when options pricing moves
  the most.
- **Historical volatility:** 20-day and 60-day annualized volatility from
  daily log returns (`src/lib/market/volatility.ts`), computed from a
  dedicated daily-candle fetch independent of whatever candle size the
  chart itself is showing. Labeled explicitly as realized/historical, not
  the options market's implied volatility.
- **Short interest:** only surfaced when actually notable (days-to-cover
  ≥ 3, from Nasdaq's bi-monthly settlement data,
  `src/lib/market/short-interest.ts`), and tagged "New" vs "Established"
  depending on whether recent prior settlement periods were elevated too.
- **Insider activity:** Form 4 filing count and dates over the trailing 90
  days (`src/lib/market/insider.ts`), via SEC EDGAR's free ticker→CIK
  mapping and submissions API, linking out to each filing and to the full
  EDGAR history. Deliberately does **not** parse buy/sell direction, share
  count, or price — see "Where we had to compromise" below.

## Where we had to compromise

A few requested features either aren't fully buildable on free data, or
needed a scoped-down version instead of the "real" thing:

- **Insider buy/sell detail.** SEC EDGAR's filing list is free and clean,
  but the actual Form 4 documents are served as SEC's XSLT-rendered HTML,
  not structured data — reliably parsing direction, share count, and price
  out of that would mean scraping a government template, which breaks
  silently whenever SEC changes it. Shipped as filing-count + dates +
  direct links instead, explicitly labeled as such.
- **Per-analyst ratings breakdown.** Nasdaq's free API gives a consensus
  1-year price target only; a per-analyst breakdown (who rated what, when)
  is a paid data product everywhere we checked.
- **Official sector holdings.** The sector drill-down uses a curated list
  of ~8 large-cap constituents per sector ETF, not the official,
  continuously-reweighted holdings list — that's not published free either.
- **True push notifications.** Alerts fire in-app only, via a 5-minute poll
  while the app is open (`AlertsWatcher.tsx`) and a browser Notification.
  Real push (fires even with the app closed) needs a deployed server with a
  scheduler and VAPID keys — not something that makes sense to build before
  the app is actually deployed somewhere with a scheduler available.
- **Position size / liquidity checks.** Considered and intentionally
  dropped at your request — you're using this for options trades and don't
  need either.

## What's next

Ideas for later: true push notifications (once deployed), per-analyst
ratings breakdowns (would need a paid API), multi-line/annotation drawing
tools.
