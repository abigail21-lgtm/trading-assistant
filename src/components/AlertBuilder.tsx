"use client";

import { useState, type FormEvent } from "react";
import { addAlert } from "@/lib/alerts-client";
import type { AlertCondition, NewAlertRule } from "@/lib/market/alerts";
import { describeCondition } from "@/lib/market/alerts";

type Kind = AlertCondition["kind"];

const KIND_LABELS: Record<Kind, string> = {
  price_above: "Price rises above",
  price_below: "Price falls below",
  ma_cross_above: "Price crosses above moving average",
  ma_cross_below: "Price crosses below moving average",
  volume_spike: "Volume spikes above average",
  breaks_resistance: "Price breaks through resistance",
  breaks_support: "Price breaks below support",
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
  const [conditions, setConditions] = useState<AlertCondition[]>([]);
  const [kind, setKind] = useState<Kind>("price_above");
  const [targetPrice, setTargetPrice] = useState(currentPrice ? currentPrice.toFixed(2) : "");
  const [maPeriod, setMaPeriod] = useState("50");
  const [multiplier, setMultiplier] = useState("1.5");
  const [submitting, setSubmitting] = useState(false);

  function addCondition() {
    if (kind === "price_above" || kind === "price_below") {
      const price = parseFloat(targetPrice);
      if (!Number.isFinite(price) || price <= 0) return;
      setConditions((prev) => [...prev, { kind, targetPrice: price }]);
    } else if (kind === "ma_cross_above" || kind === "ma_cross_below") {
      const period = parseInt(maPeriod, 10);
      if (!Number.isInteger(period) || period < 2 || period > 400) return;
      setConditions((prev) => [...prev, { kind, maPeriod: period }]);
    } else if (kind === "volume_spike") {
      const m = parseFloat(multiplier);
      if (!Number.isFinite(m) || m <= 0) return;
      setConditions((prev) => [...prev, { kind, multiplier: m }]);
    } else {
      setConditions((prev) => [...prev, { kind }]);
    }
  }

  function removeCondition(index: number) {
    setConditions((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (conditions.length === 0) return;
    setSubmitting(true);
    try {
      const rule: NewAlertRule = { symbol, conditions };
      await addAlert(rule);
      onCreated();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {conditions.length > 0 && (
        <div className="space-y-1.5">
          {conditions.map((c, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300"
            >
              <span>{describeCondition(c)}</span>
              <button
                type="button"
                onClick={() => removeCondition(i)}
                aria-label="Remove condition"
                className="shrink-0 text-slate-400 hover:text-red-500 dark:hover:text-red-400"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
          ))}
          <p className="text-xs text-slate-400">
            {conditions.length === 1
              ? "One condition — fires as soon as it's true."
              : "Fires \"Look now\" when all conditions are true at once, or \"Worth attention\" when only some are."}
          </p>
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-dashed border-slate-300 p-2.5 dark:border-slate-700">
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
            value={targetPrice}
            onChange={(e) => setTargetPrice(e.target.value)}
            placeholder="Target price"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        )}

        {(kind === "ma_cross_above" || kind === "ma_cross_below") && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="1"
              min="2"
              max="400"
              value={maPeriod}
              onChange={(e) => setMaPeriod(e.target.value)}
              className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <span className="text-sm text-slate-500">day moving average</span>
          </div>
        )}

        {kind === "volume_spike" && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.1"
              min="1"
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              className="w-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <span className="text-sm text-slate-500">x the 20-day average</span>
          </div>
        )}

        <button
          type="button"
          onClick={addCondition}
          className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
        >
          + Add condition
        </button>
      </div>

      <button
        type="submit"
        disabled={submitting || conditions.length === 0}
        className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
      >
        {submitting ? "Adding…" : conditions.length > 1 ? `Create alert (${conditions.length} conditions)` : "Add alert"}
      </button>
    </form>
  );
}
