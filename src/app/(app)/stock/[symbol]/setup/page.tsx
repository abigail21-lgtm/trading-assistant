import Link from "next/link";
import { SymbolNotFoundError } from "@/lib/market/yahoo";
import { getDipSetup, addTradingDays, type DipSetup } from "@/lib/signals/load";
import { getServerRules } from "@/lib/signals/rules-server";
import { describeChanges, isTracked, type TradingRules } from "@/lib/signals/rules";
import TrackTradeButton from "@/components/TrackTradeButton";
import { INDEX_FUNDS } from "@/lib/signals/dip";
import type { DipCheck } from "@/lib/signals/dip-grade";
import { money, sessionDate, sessionWeekday, signedPct, wilsonInterval } from "@/lib/signals/format";
import DipGradePill, { DipStagePill, isTradeUnderWay } from "@/components/DipGradePill";
import DipMiniChart from "@/components/DipMiniChart";
import DipCallsPicker from "@/components/DipCallsPicker";

export default async function SetupPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol: rawSymbol } = await params;
  const symbol = rawSymbol.toUpperCase();

  const rules = await getServerRules();
  let setup: DipSetup;
  try {
    setup = await getDipSetup(symbol, rules);
  } catch (err) {
    const notFound = err instanceof SymbolNotFoundError;
    return (
      <div className="mx-auto max-w-lg px-4 py-10 text-center">
        <p className="text-lg font-medium text-slate-800 dark:text-slate-200">
          {notFound ? `No data for "${symbol}"` : "Couldn't load this setup"}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {notFound ? "Double-check the ticker symbol." : "Market data is temporarily unavailable."}
        </p>
        <Link href={`/stock/${symbol}`} className="mt-4 inline-block text-sm font-medium text-emerald-600 hover:text-emerald-500">
          ← Back to {symbol}
        </Link>
      </div>
    );
  }

  const e = setup.evaluation;
  const { grade } = setup;
  const bouncePrice = Math.max(e.sellPrice ?? e.price, e.price * 1.005);
  const badPct = Math.min(-3, Math.max(-15, setup.trackRecord?.worstReturnPct ?? -8));
  const ruleNotes = describeChanges(rules);

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
      <div className="flex items-center gap-3">
        <Link href={`/stock/${symbol}`} className="text-sm font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400">
          ← {symbol}
        </Link>
        <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Dip in an uptrend</h1>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100">{grade.headline}</p>
            <p className="text-xs tabular-nums text-slate-500">
              {money(e.price)} · {e.lastBarIsLive ? "live, delayed ~15 min" : `after ${sessionDate(setup.recent.at(-1)?.time ?? 0)}'s close`}
            </p>
          </div>
          {isTradeUnderWay(e.status) ? (
            <DipStagePill status={e.status} holdDay={e.holdDay} maxHold={e.params.maxHoldBars} large />
          ) : (
            grade.grade && <DipGradePill grade={grade.grade} large />
          )}
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{grade.reason}</p>
        {ruleNotes.length > 0 && (e.status === "signal" || e.status === "in-buy-zone") && (
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-400">
            <b className="font-semibold text-slate-800 dark:text-slate-200">Your rules:</b> {ruleNotes.join(" ")}{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Change
            </Link>
          </p>
        )}

        <div className="mt-3">
          <DipMiniChart points={setup.recent} avg200={e.avg200} sellPrice={e.sellPrice} downDays={e.downDays} />
        </div>

        <Plan setup={setup} />
        <Track setup={setup} rules={rules} />
      </section>

      {isTradeUnderWay(e.status) && !isTracked(rules, symbol, e.signalTime) && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <h2 className="font-semibold text-slate-700 dark:text-slate-300">Not holding it?</h2>
          <p className="mt-1">
            This dip started on {sessionDate(e.signalTime ?? setup.sessionTime)}. The tested entry was that day&apos;s close, so
            starting a new trade now isn&apos;t what the track record measures. Wait for the next dip.
          </p>
        </section>
      )}

      {(e.status === "signal" || e.status === "in-buy-zone") &&
        (setup.expiries.length > 0 ? (
          <DipCallsPicker
            symbol={symbol}
            expiries={setup.expiries}
            defaultIndex={setup.defaultExpiryIndex}
            bouncePrice={bouncePrice}
            badPct={badPct}
            maxLossPerTrade={rules.maxLossPerTrade}
          />
        ) : (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
            <h2 className="font-semibold text-slate-700 dark:text-slate-300">Calls for this setup</h2>
            <p className="mt-1">{setup.optionsError ?? "No options data for this symbol."}</p>
          </section>
        ))}

      {/* The checks judge the entry, using today's numbers; once a trade is under way they'd contradict the plan. */}
      {grade.checks.length > 0 && !isTradeUnderWay(e.status) && (
        <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {grade.grade === "go" ? "Why it's a GO" : "The checks"}
            </span>
            <span className="flex items-center gap-2 text-sm text-slate-500">
              {grade.checks.filter((c) => c.status === "pass").length} of {grade.checks.filter((c) => c.status !== "info").length} pass
              <Chevron />
            </span>
          </summary>
          <ul className="space-y-2 px-4 pb-4 text-sm">
            {grade.checks.map((c) => (
              <CheckRow key={c.title} check={c} />
            ))}
          </ul>
        </details>
      )}

      <TrackRecord setup={setup} />

      <p className="text-[10px] text-slate-400">
        Automated read from price data. Past results don&apos;t guarantee future ones. Not investment advice.
      </p>
    </div>
  );
}

/** The dip bar a trade taken now belongs to: today's live bar while in the buy zone, else the signal bar. */
function Track({ setup, rules }: { setup: DipSetup; rules: TradingRules }) {
  const e = setup.evaluation;
  if (e.status === "none" || e.status === "sell-today") return null;
  const signalTime = e.status === "in-buy-zone" ? setup.sessionTime : e.signalTime;
  if (signalTime == null) return null;
  return (
    <TrackTradeButton
      symbol={setup.symbol}
      signalTime={signalTime}
      initiallyTracked={isTracked(rules, setup.symbol, signalTime)}
      sellAlertsOn={rules.alerts.sell}
    />
  );
}

function Step({ n, tone, children }: { n: number; tone: "dark" | "green" | "amber"; children: React.ReactNode }) {
  const bg =
    tone === "green" ? "bg-emerald-600 text-white" : tone === "amber" ? "bg-amber-500 text-white" : "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900";
  return (
    <li className="flex gap-2.5">
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${bg}`}>{n}</span>
      <span className="text-slate-700 dark:text-slate-300">{children}</span>
    </li>
  );
}

function Plan({ setup }: { setup: DipSetup }) {
  const { symbol, evaluation: e } = setup;
  const session = sessionWeekday(setup.sessionTime);
  const when = e.lastBarIsLive ? "today" : session;
  const sell = e.sellPrice != null ? money(e.sellPrice) : null;
  const lastDay =
    setup.lastDayTime ?? (e.status === "in-buy-zone" ? addTradingDays(setup.sessionTime, e.params.maxHoldBars) : null);
  const noStop = (
    <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-400">
      <b className="font-semibold text-slate-800 dark:text-slate-200">No stop-loss.</b> Dips often dip a little more before
      bouncing, and in testing a 3% stop cut the average gain by more than half. Limit your risk with how many contracts you buy
      instead.
    </p>
  );
  const sellStep = (
    <Step n={2} tone="green">
      <b className="font-semibold">Sell when {symbol} is above that day&apos;s sell price</b> around 3:45pm.{" "}
      {sell && (
        <>
          {e.lastBarIsLive ? "Today's" : `${session}'s`} is <span className="font-semibold tabular-nums">{sell}</span> (the average of
          the last 4 closes).{" "}
        </>
      )}
      It updates each morning.
    </Step>
  );
  const dayLimitStep = lastDay && (
    <Step n={3} tone="amber">
      <b className="font-semibold">Day {e.params.maxHoldBars} ({sessionDate(lastDay)}): sell at the close no matter what.</b>{" "}
      Waiting longer didn&apos;t help in testing.
    </Step>
  );

  let steps: React.ReactNode;
  switch (e.status) {
    case "in-buy-zone":
      steps = (
        <>
          <Step n={1} tone="dark">
            <b className="font-semibold">Buy near today&apos;s close</b> (3:30–3:55pm) if {symbol} is still at or below{" "}
            <span className="font-semibold tabular-nums">{money(e.buyZone!.ceiling)}</span>.
          </Step>
          {sellStep}
          {dayLimitStep}
        </>
      );
      break;
    case "signal":
      steps = (
        <>
          <Step n={1} tone="dark">
            <b className="font-semibold">
              {e.lastBarIsLive ? "Buy today" : `Buy ${session}`} after 9:45am
            </b>
            {e.lastBarIsLive ? " (yesterday's close was the dip)" : " (the best time was near today's close)"}. Skip it if {symbol} is
            already above {sell}; the bounce already happened.
          </Step>
          {sellStep}
          {dayLimitStep}
        </>
      );
      break;
    case "holding":
      steps = (
        <>
          <Step n={1} tone="dark">
            <b className="font-semibold">
              Day {e.holdDay} of {e.params.maxHoldBars}
            </b>{" "}
            since the dip on {sessionDate(setup.evaluation.signalTime ?? setup.sessionTime)} (close {money(e.trade?.entry ?? e.price)}).
          </Step>
          {sellStep}
          {dayLimitStep}
        </>
      );
      break;
    case "sell-today":
      steps = (
        <Step n={1} tone="green">
          <b className="font-semibold">The plan says sell.</b> If you didn&apos;t sell at the close, sell {when} after 9:45am.
        </Step>
      );
      break;
    default:
      steps = (
        <>
          <Step n={1} tone="dark">
            Waits for {symbol} to close sharply lower (2-day RSI under {e.params.rsiMax}) while still above its 200-day average.
          </Step>
          <Step n={2} tone="green">
            Then: buy near that day&apos;s close, and sell the first day it closes above its 5-day average.
          </Step>
          <Step n={3} tone="amber">
            Sell after {e.params.maxHoldBars} trading days no matter what.
          </Step>
        </>
      );
  }

  return (
    <>
      <h2 className="mt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {e.status === "none" ? "How this signal works" : "The plan"}
      </h2>
      <ol className="mt-2 space-y-2.5 text-sm">{steps}</ol>
      {e.status !== "none" && e.status !== "sell-today" && noStop}
    </>
  );
}

const CHECK_ICON: Record<DipCheck["status"], { icon: string; cls: string }> = {
  pass: { icon: "✓", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  warn: { icon: "!", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400" },
  fail: { icon: "✕", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400" },
  info: { icon: "i", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400" },
};

function CheckRow({ check }: { check: DipCheck }) {
  const s = CHECK_ICON[check.status];
  return (
    <li className="flex gap-2">
      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${s.cls}`}>{s.icon}</span>
      <span className={check.status === "info" ? "text-slate-500" : "text-slate-700 dark:text-slate-300"}>
        <b className="font-semibold">{check.title}</b> {check.detail}
      </span>
    </li>
  );
}

function TrackRecord({ setup }: { setup: DipSetup }) {
  const tr = setup.trackRecord;
  if (!tr || tr.count === 0) return null;
  const upPct = Math.round((tr.upCount / tr.count) * 100);
  const [lo, hi] = wilsonInterval(tr.upCount, tr.count);
  const isIndex = INDEX_FUNDS.includes(setup.symbol);
  return (
    <details className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Track record</span>
        <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="font-semibold tabular-nums">{upPct}%</span> up at exit
          <Chevron />
        </span>
      </summary>
      <div className="space-y-3 px-4 pb-4 text-sm">
        <div>
          <p className="text-xs font-medium text-slate-500">
            On {setup.symbol}, last {Math.round(tr.years)} years: {tr.count} dips
          </p>
          <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <span className="bg-emerald-500" style={{ width: `${upPct}%` }} />
            <span className="bg-red-400" style={{ width: `${100 - upPct}%` }} />
          </div>
          <p className="mt-1.5 text-slate-600 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400">{tr.upCount} were up at exit</span>,{" "}
            <span className="text-red-500">{tr.count - tr.upCount} were down</span>.
            {tr.medianBars != null && ` Usually sold after ${tr.medianBars} day${tr.medianBars === 1 ? "" : "s"}.`} Average stock move{" "}
            <span className="tabular-nums">{signedPct(tr.avgReturnPct, 1)}</span>
            {tr.worstReturnPct != null && (
              <>
                ; worst <span className="tabular-nums">{signedPct(tr.worstReturnPct, 1)}</span>
              </>
            )}
            .
          </p>
        </div>
        <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
          <p className="text-xs font-medium text-slate-500">
            {isIndex ? "SPY, QQQ, IWM and DIA since 2000" : "Across 94 large stocks, 2016–2026 (deep dips)"}
          </p>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            {isIndex
              ? "Up at exit 68–73% of the time, vs 62–65% for buying on a random day with the same sell rule."
              : "Up at exit 65–67% of the time, vs 62% for buying on a random day with the same sell rule."}{" "}
            The edge is real but small.
          </p>
        </div>
        {tr.count < 60 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            {tr.count} examples is a small sample. The true rate on {setup.symbol} could reasonably be anywhere from about{" "}
            {Math.round(lo * 100)}% to {Math.round(hi * 100)}%.
          </p>
        )}
      </div>
    </details>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180">
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  );
}
