"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchRules, saveRules } from "@/lib/rules-client";
import { marketDate } from "@/lib/signals/rules";

/**
 * "I bought this": marks the trade so sell alerts (price above the day's sell
 * price, last day) go out for it. Sell alerts are only sent for marked trades,
 * so you aren't told to sell things you never bought.
 */
export default function TrackTradeButton({
  symbol,
  signalTime,
  initiallyTracked,
  sellAlertsOn,
}: {
  symbol: string;
  signalTime: number;
  initiallyTracked: boolean;
  sellAlertsOn: boolean;
}) {
  const router = useRouter();
  const [tracked, setTracked] = useState(initiallyTracked);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const rules = await fetchRules();
      const day = marketDate(signalTime);
      const others = rules.positions.filter((p) => !(p.symbol === symbol && marketDate(p.signalTime) === day));
      const positions = tracked ? others : [...others, { symbol, signalTime, markedAt: Date.now() }];
      await saveRules({ ...rules, positions });
      setTracked(!tracked);
      router.refresh();
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      {tracked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-300">
          <span>
            <b className="font-semibold">Tracking this trade.</b>{" "}
            {sellAlertsOn ? "You'll get sell alerts for it." : "Sell alerts are off in My rules."}
          </span>
          <button type="button" onClick={toggle} disabled={busy} className="font-medium underline underline-offset-2 disabled:opacity-50">
            Stop tracking
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          {busy ? "Saving…" : "I bought this: send me sell alerts"}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
