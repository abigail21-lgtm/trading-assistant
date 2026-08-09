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
   dev URL (`http://localhost:3000`) for now; **once deployed, update this to
   your production URL and add it to Redirect URLs too** — magic links sent
   before that update will point at the wrong place. Public sign-up is on by
   default, so any number of people can create their own account; there's
   nothing extra to configure for multi-user access specifically.

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from
step 1, then restart the dev server. Sign-in, session handling, and the
watchlist now go through Supabase instead of local storage; anything starred
while in local mode does **not** carry over automatically (it's in the
browser's local storage, not the account).

**Deploying:** `.env.local` is never deployed (it's gitignored) — set the
same two variables in your host's environment variable settings (e.g.
Netlify: Site configuration → Environment variables) or the deployed app
will silently fall back to local mode, and nobody will be able to sign in.

## Push notifications (optional, needs Supabase + a deployment)

Alerts (price target, moving-average cross with a custom period, volume
spike, or a support/resistance break — one condition or several combined,
see below) can notify you two ways:

- **In-app** (works in both local and Supabase mode): checked every 5
  minutes while the app is open, via a browser Notification. This is the
  only option in local mode, since there's no server that knows what your
  alerts are.
- **True push** (Supabase mode only, and only once deployed): checked every
  5 minutes by a scheduled server function — fires even if the app is fully
  closed. In Supabase mode, the in-app checker turns itself off so you don't
  get double-notified.

To turn on true push:

1. **Add the push-subscriptions table** — run
   [`supabase/schema.sql`](./supabase/schema.sql) again (it's all
   `create table if not exists`, safe to re-run).
2. **Get your service role key** — Supabase Project Settings → API →
   `service_role` secret. This is different from the `anon` key you already
   have: it bypasses row-level security, which the scheduled function needs
   since it checks every user's alerts with no logged-in session. **Never**
   put this behind `NEXT_PUBLIC_` or expose it to the client.
3. **VAPID keys** — already generated for you in `.env.local`
   (`NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT`).
   These identify this app to push services (Chrome's, Apple's, etc.); only
   regenerate them (`npx web-push generate-vapid-keys`) if you specifically
   want to invalidate every existing push subscription.
4. **Set all four env vars** (`SUPABASE_SERVICE_ROLE_KEY`,
   `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) in
   your host's environment variables at deploy time, same as the Supabase
   ones above.
5. **Deploy.** The checker (`netlify/functions/check-alerts.mts`) is a
   [Netlify Scheduled Function](https://docs.netlify.com/build/functions/scheduled-functions/)
   — it runs on Netlify's schedule (every 5 minutes) and does **not** run in
   `next dev`. There's nothing to start manually; once deployed with the env
   vars above set, it's live.

To test after deploying: open the app, sign in, click "Enable notifications"
on a stock's Alerts panel, and grant the browser permission prompt. Check
Supabase's Table Editor → `push_subscriptions` — a row should appear for
your account. Add an alert with a condition that's already true (e.g. a
price-below target above the current price) and wait up to 5 minutes; a
push notification should arrive even with the tab closed.

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
  prices. The same service worker also handles incoming Web Push events
  (`push`/`notificationclick`) for true push notifications.
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
- **Alerts:** price-target, moving-average-cross (any custom period, not
  just 20/50/200), volume-spike, and support/resistance-break rules
  (`src/lib/market/alerts.ts`), each combinable into a single multi-condition
  alert that fires "Look now" when every condition is true at once, or
  "Worth attention" when only some are. Stored via `src/lib/alerts-client.ts`
  (same local/Supabase pattern as the watchlist), checked one of two ways
  depending on mode — see "Push notifications" above:
  - **Local mode:** in-app only. `src/components/AlertsWatcher.tsx` polls
    every 5 minutes while the app is open and fires a browser Notification;
    it won't fire with the tab closed, since there's no server tracking
    local-mode alerts at all.
  - **Supabase mode:** true push. `netlify/functions/check-alerts.mts` runs
    the same evaluation logic (`buildAlertContext`/`evaluateAlert`) on a
    5-minute Netlify Scheduled Function, using the Supabase service-role key
    to read every user's alerts and push subscriptions, and `web-push` to
    deliver notifications via each browser's push service — fires even with
    the app fully closed. `AlertsWatcher` disables its own polling in this
    mode to avoid double-firing.
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
