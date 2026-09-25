"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildOptionTrades,
  mergeTransactions,
  parseRobinhoodCsv,
  type OptionTrade,
  type RhTransaction,
} from "@/lib/journal/robinhood";
import type { EntryEvaluation } from "@/lib/journal/evaluate";
import { groupStats, takeaways } from "@/lib/journal/stats";
import { loadTransactions, saveTransactions } from "@/lib/journal-client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const money = (x: number) => `${x < 0 ? "−" : "+"}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;

type Notice = { kind: "ok" | "error"; text: string } | null;

export default function JournalClient() {
  const [transactions, setTransactions] = useState<RhTransaction[] | null>(null);
  const [evals, setEvals] = useState<Map<string, EntryEvaluation>>(new Map());
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    loadTransactions()
      .then(setTransactions)
      .catch(() => {
        setTransactions([]);
        setNotice({ kind: "error", text: "Couldn't load your saved trades." });
      });
  }, []);

  const { trades, otherCount } = useMemo(
    () => (transactions ? buildOptionTrades(transactions) : { trades: [] as OptionTrade[], otherCount: 0 }),
    [transactions],
  );

  useEffect(() => {
    if (trades.length === 0) return;
    let cancelled = false;
    fetch("/api/journal/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trades: trades.map((t) => ({ id: t.id, underlying: t.contract.underlying, openDate: t.openDate, closeDate: t.closeDate })),
      }),
    })
      .then((r) => (r.ok ? r.json() : { evals: {} }))
      .then((json) => {
        if (!cancelled) setEvals(new Map(Object.entries(json.evals ?? {})));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [trades]);

  const importFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setNotice(null);
      try {
        const parsed = parseRobinhoodCsv(await file.text());
        if (parsed.error) {
          setNotice({ kind: "error", text: parsed.error });
          return;
        }
        const { merged, added } = mergeTransactions(transactions ?? [], parsed.transactions);
        await saveTransactions(merged);
        setTransactions(merged);
        const optionRows = buildOptionTrades(parsed.transactions).trades.length;
        setNotice({
          kind: "ok",
          text:
            added === 0
              ? "Nothing new: everything in that file was already imported."
              : `Added ${added} new row${added === 1 ? "" : "s"} (${parsed.transactions.length - added} already imported). ${
                  optionRows === 0 ? "No options trades in this file." : ""
                }`,
        });
      } catch {
        setNotice({ kind: "error", text: "Couldn't read or save that file. Try again." });
      } finally {
        setBusy(false);
      }
    },
    [transactions],
  );

  async function clearAll() {
    await saveTransactions([]);
    setTransactions([]);
    setEvals(new Map());
    setConfirmClear(false);
    setNotice({ kind: "ok", text: "Cleared all imported trades." });
  }

  const longCalls = trades.filter((t) => t.side === "long" && t.contract.type === "Call");
  const overall = groupStats(longCalls);
  const notes = takeaways(trades, evals);
  const sorted = [...trades].sort((a, b) => b.openDate.localeCompare(a.openDate));

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Import from Robinhood</h2>
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) importFile(f);
          }}
          className={`mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-center text-sm transition ${
            dragging ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950" : "border-slate-300 hover:border-slate-400 dark:border-slate-700"
          }`}
        >
          <input
            id="rh-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = "";
            }}
          />
          <span className="font-medium text-slate-800 dark:text-slate-200">{busy ? "Reading…" : "Choose your Robinhood CSV"}</span>
          <span className="mt-1 text-xs text-slate-500">or drop it here. Import weekly or monthly; repeats are skipped.</span>
        </label>
        {notice && (
          <p role="status" className={`mt-2 text-sm ${notice.kind === "error" ? "text-amber-700 dark:text-amber-400" : "text-emerald-600"}`}>
            {notice.text}
          </p>
        )}
        <details className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          <summary className="cursor-pointer font-medium text-slate-700 dark:text-slate-300">How to get the file</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>In Robinhood, open Account, then Reports and statements, then Reports.</li>
            <li>Choose a date range and tap Generate report. It can take a couple of hours (up to 24).</li>
            <li>When it&apos;s ready, download the CSV and pick it here.</li>
          </ol>
          <p className="mt-2 text-xs text-slate-500">
            The file is read on this device. Only the trade rows are saved ({isSupabaseConfigured ? "to your account" : "in this browser"}),
            not the file itself. Crypto and futures aren&apos;t in Robinhood&apos;s report.
          </p>
        </details>
      </section>

      {transactions && trades.length > 0 && (
        <>
          <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Tile label="Closed calls" value={String(overall.closed)} />
            <Tile label="Made money" value={overall.winRate == null ? "—" : `${Math.round(overall.winRate * 100)}%`} />
            <Tile
              label="Total result"
              value={overall.closed ? money(overall.totalPnl) : "—"}
              tone={overall.totalPnl > 0 ? "up" : overall.totalPnl < 0 ? "down" : undefined}
            />
            <Tile label="Avg hold" value={overall.avgHoldDays == null ? "—" : `${overall.avgHoldDays.toFixed(1)} days`} />
          </section>

          {notes.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">What stands out</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-600 dark:text-slate-400">
                {notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-400">A few trades is a small sample; treat differences as hints, not proof.</p>
            </section>
          )}

          <section>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Options trades</h2>
            <ul className="mt-2 space-y-2">
              {sorted.map((t) => (
                <TradeRow key={t.id} trade={t} evaluation={evals.get(t.id)} />
              ))}
            </ul>
            {otherCount > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {otherCount} other row{otherCount === 1 ? "" : "s"} (stock trades, deposits, dividends) aren&apos;t shown here.
              </p>
            )}
          </section>
        </>
      )}

      {transactions && transactions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {confirmClear ? (
            <>
              <span className="text-slate-600 dark:text-slate-400">Delete all imported trades?</span>
              <button type="button" onClick={clearAll} className="rounded-md bg-red-600 px-2.5 py-1 font-medium text-white">
                Delete
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className="rounded-md border border-slate-300 px-2.5 py-1 dark:border-slate-700">
                Keep
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmClear(true)} className="text-slate-500 underline underline-offset-2">
              Clear imported trades
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  const color = tone === "up" ? "text-emerald-600 dark:text-emerald-400" : tone === "down" ? "text-red-500 dark:text-red-400" : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

const ENTRY_BADGE: Record<EntryEvaluation["entry"], { text: string; cls: string }> = {
  "dip-day": { text: "Bought on a dip day", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  "day-after": { text: "Bought the day after a dip", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400" },
  none: { text: "No dip signal", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};
const EXIT_TEXT: Record<Exclude<EntryEvaluation["exit"], null>, string> = {
  "on-plan": "Sold on the plan's day",
  early: "Sold before the plan's day",
  late: "Held past the plan's day",
};
const CLOSE_TEXT: Record<string, string> = {
  sold: "Sold",
  "bought-back": "Bought back",
  expired: "Expired",
  exercised: "Exercised",
  assigned: "Assigned",
};

function TradeRow({ trade: t, evaluation: e }: { trade: OptionTrade; evaluation?: EntryEvaluation }) {
  const title = `${t.contract.underlying} $${t.contract.strike} ${t.contract.type.toLowerCase()} · ${shortDate(t.contract.expiry)}`;
  const when = t.closeDate
    ? `${shortDate(t.openDate)} → ${CLOSE_TEXT[t.closeReason ?? "sold"]} ${shortDate(t.closeDate)} (${t.holdDays} day${t.holdDays === 1 ? "" : "s"})`
    : `Opened ${shortDate(t.openDate)} · still open`;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 dark:text-slate-100">
            {title}
            {t.side === "short" && <span className="ml-1.5 text-xs font-normal text-slate-500">(sold to open)</span>}
          </p>
          <p className="text-xs text-slate-500">
            {when} · {t.contracts} contract{t.contracts === 1 ? "" : "s"}
          </p>
        </div>
        {t.pnl != null ? (
          <p className={`shrink-0 text-right text-sm font-semibold tabular-nums ${t.pnl >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
            {money(t.pnl)}
            {t.pnlPct != null && <span className="block text-xs font-normal">{`${t.pnlPct >= 0 ? "+" : "−"}${Math.abs(t.pnlPct).toFixed(0)}%`}</span>}
          </p>
        ) : (
          <p className="shrink-0 text-xs text-slate-400">{t.closeReason === "exercised" || t.closeReason === "assigned" ? "Result is in the shares" : "Open"}</p>
        )}
      </div>
      {e && t.side === "long" && t.contract.type === "Call" && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-medium">
          <span className={`rounded-full px-2 py-0.5 ${ENTRY_BADGE[e.entry].cls}`}>{ENTRY_BADGE[e.entry].text}</span>
          {e.exit && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700 dark:bg-sky-950 dark:text-sky-300">{EXIT_TEXT[e.exit]}</span>}
          {e.aboveTrend === false && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
              Stock was below its 200-day average
            </span>
          )}
        </div>
      )}
    </li>
  );
}
