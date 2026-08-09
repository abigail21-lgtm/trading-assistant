"use client";

import { useState, type FormEvent } from "react";
import { addAlert } from "@/lib/alerts-client";
import type { AlertRule, NewAlertRule } from "@/lib/market/alerts";

type Kind = AlertRule["kind"];

const KIND_LABELS: Record<Kind, string> = {
  price_above: "Price rises above",
  price_below: "Price falls below",
  ma_cross_above: "Price crosses above moving average",
  ma_cross_below: "Price crosses below moving average",
  volume_spike: "Volume spikes above average",
};

export default function AlertBuilder({
  symbol,
  currentPrice,
  onCreated,
}: {
  symbol: string;
  currentPrice: number | null;
  onCreated: () => void;
}) {
  const [kind, setKind] = useState<Kind>("price_above");
  const [targetPrice, setTargetPrice] = useState(currentPrice ? currentPrice.toFixed(2) : "");
  const [maPeriod, setMaPeriod] = useState<20 | 50 | 200>(50);
  const [multiplier, setMultiplier] = useState("1.5");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      let rule: NewAlertRule;
      if (kind === "price_above" || kind === "price_below") {
        const price = parseFloat(targetPrice);
        if (!Number.isFinite(price)) return;
        rule = { symbol, kind, targetPrice: price };
      } else if (kind === "ma_cross_above" || kind === "ma_cross_below") {
        rule = { symbol, kind, maPeriod };
      } else {
        const m = parseFloat(multiplier);
        if (!Number.isFinite(m) || m <= 0) return;
        rule = { symbol, kind, multiplier: m };
      }
      await addAlert(rule);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <select
        value={kind}
        onChange={(e) => setKind(e.target.value as Kind)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      >
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>

      {(kind === "price_above" || kind === "price_below") && (
        <input
          type="number"
          step="0.01"
          required
          value={targetPrice}
          onChange={(e) => setTargetPrice(e.target.value)}
          placeholder="Target price"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      )}

      {(kind === "ma_cross_above" || kind === "ma_cross_below") && (
        <select
          value={maPeriod}
          onChange={(e) => setMaPeriod(Number(e.target.value) as 20 | 50 | 200)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        >
          <option value={20}>20-period</option>
          <option value={50}>50-period</option>
          <option value={200}>200-period</option>
        </select>
      )}

      {kind === "volume_spike" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min="1"
            required
            value={multiplier}
            onChange={(e) => setMultiplier(e.target.value)}
            className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
          <span className="text-sm text-slate-500">x the 20-period average</span>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
      >
        {submitting ? "Adding…" : "Add alert"}
      </button>
    </form>
  );
}
