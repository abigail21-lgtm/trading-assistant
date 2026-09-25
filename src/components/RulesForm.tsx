"use client";

import { useState } from "react";
import { saveRules } from "@/lib/rules-client";
import { MAX_WEEKS_CHOICES, MIN_WEEKS_CHOICES, type TradingRules } from "@/lib/signals/rules";
import NotificationPermissionToggle from "./NotificationPermissionToggle";
import { isSupabaseConfigured } from "@/lib/supabase/config";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

function Choice<T extends string | number>({
  id,
  label,
  help,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  help?: string;
  value: T;
  options: { value: T; label: string; note?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</legend>
      {help && <p className="mt-0.5 text-xs text-slate-500">{help}</p>}
      <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={String(o.value)}
            className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition ${
              value === o.value
                ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-slate-200 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <input
              type="radio"
              name={id}
              className="sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="font-medium">{o.label}</span>
            {o.note && <span className="mt-0.5 block text-xs opacity-80">{o.note}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Toggle({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-3">
      <span>
        <span className="block text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
        {help && <span className="mt-0.5 block text-xs text-slate-500">{help}</span>}
      </span>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(ev) => onChange(ev.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 accent-emerald-600"
      />
    </label>
  );
}

export default function RulesForm({ initial }: { initial: TradingRules }) {
  const [rules, setRules] = useState(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });
  const [maxLossText, setMaxLossText] = useState(initial.maxLossPerTrade != null ? String(initial.maxLossPerTrade) : "");

  const update = <K extends keyof TradingRules>(key: K, value: TradingRules[K]) => {
    setRules((r) => ({ ...r, [key]: value }));
    setStatus({ kind: "idle" });
  };
  const updateAlert = (key: keyof TradingRules["alerts"], value: boolean) => {
    setRules((r) => ({ ...r, alerts: { ...r.alerts, [key]: value } }));
    setStatus({ kind: "idle" });
  };

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setStatus({ kind: "saving" });
    const parsed = maxLossText.trim() === "" ? null : Number(maxLossText.replace(/[$,\s]/g, ""));
    if (parsed != null && !(Number.isFinite(parsed) && parsed > 0)) {
      setStatus({ kind: "error", message: "Max loss per trade should be a dollar amount, like 300, or left empty." });
      return;
    }
    try {
      const { rules: saved, warning } = await saveRules({ ...rules, maxLossPerTrade: parsed });
      setRules(saved);
      setMaxLossText(saved.maxLossPerTrade != null ? String(saved.maxLossPerTrade) : "");
      setStatus(warning ? { kind: "error", message: warning } : { kind: "saved", message: "Saved." });
    } catch {
      setStatus({ kind: "error", message: "Couldn't save. Check your connection and try again." });
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <Section title="The signal">
        <Choice
          id="depth"
          label="How deep a dip counts (stocks)"
          help="Index funds always use the normal depth, which tested best for them."
          value={rules.stockDipDepth}
          onChange={(v) => update("stockDipDepth", v)}
          options={[
            { value: "deep", label: "Deep", note: "2-day RSI under 5. Tested best on stocks." },
            { value: "normal", label: "Normal", note: "RSI under 10. More signals, tested weaker." },
          ]}
        />
        <Toggle
          id="scan-index"
          label="Check index funds (SPY, QQQ, IWM, DIA)"
          help="Best fit for calls: tight prices on the options."
          checked={rules.scanIndexFunds}
          onChange={(v) => update("scanIndexFunds", v)}
        />
        <Toggle
          id="scan-watchlist"
          label="Check my watchlist"
          checked={rules.scanWatchlist}
          onChange={(v) => update("scanWatchlist", v)}
        />
      </Section>

      <Section title="The contract">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Shortest expiry</span>
            <select
              id="min-weeks"
              value={rules.minWeeks}
              onChange={(ev) => {
                const min = Number(ev.target.value);
                setRules((r) => ({ ...r, minWeeks: min, maxWeeks: r.maxWeeks > min ? r.maxWeeks : MAX_WEEKS_CHOICES.find((w) => w > min)! }));
                setStatus({ kind: "idle" });
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {MIN_WEEKS_CHOICES.map((w) => (
                <option key={w} value={w}>
                  {w} weeks
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Longest expiry</span>
            <select
              id="max-weeks"
              value={rules.maxWeeks}
              onChange={(ev) => update("maxWeeks", Number(ev.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {MAX_WEEKS_CHOICES.filter((w) => w > rules.minWeeks).map((w) => (
                <option key={w} value={w}>
                  {w} weeks
                </option>
              ))}
            </select>
          </label>
        </div>
        {rules.minWeeks < 3 && (
          <p className="-mt-2 text-xs text-amber-700 dark:text-amber-400">
            Under 3 weeks, time decay costs noticeably more each day you hold.
          </p>
        )}
        <Choice
          id="strike"
          label="Which strike to suggest"
          value={rules.strikeStyle}
          onChange={(v) => update("strikeStyle", v)}
          options={[
            { value: "deeper", label: "Deeper in the money", note: "About 8% in. Costs more, moves most like the stock." },
            { value: "balanced", label: "Balanced", note: "About 5% in. The default." },
            { value: "closer", label: "Closer to the money", note: "About 2% in. Cheaper, loses value faster." },
          ]}
        />
        <label className="block">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Max loss per trade</span>
          <span className="mt-0.5 block text-xs text-slate-500">
            Used to suggest how many contracts to buy. Sized for a bad case (about as far as the stock&apos;s worst past dip
            fell), not the average.
          </span>
          <span className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950">
            <span className="text-sm text-slate-500">$</span>
            <input
              id="max-loss"
              inputMode="decimal"
              value={maxLossText}
              onChange={(ev) => {
                setMaxLossText(ev.target.value);
                setStatus({ kind: "idle" });
              }}
              placeholder="e.g. 300"
              className="w-full bg-transparent px-1 py-2 text-sm outline-none"
            />
          </span>
        </label>
        <Choice
          id="earnings"
          label="Earnings during the few days you'd hold"
          help="Earnings can move a stock sharply either way, and call prices usually drop right after."
          value={rules.earnings}
          onChange={(v) => update("earnings", v)}
          options={[
            { value: "warn", label: "Warn me", note: "Turns the setup yellow." },
            { value: "block", label: "Skip it", note: "Turns the setup red." },
            { value: "ignore", label: "Ignore", note: "Don't check earnings." },
          ]}
        />
      </Section>

      <Section title="Alerts">
        <Toggle
          id="alert-buy"
          label="In the buy zone near the close"
          help="Around 3pm ET, when something you watch is low enough that a close there would be a dip."
          checked={rules.alerts.buyZone}
          onChange={(v) => updateAlert("buyZone", v)}
        />
        <Toggle
          id="alert-sell"
          label="Time to sell"
          help="Around 3:15pm ET, for trades you marked with “I bought this”: above that day's sell price, or the last day of the plan."
          checked={rules.alerts.sell}
          onChange={(v) => updateAlert("sell", v)}
        />
        <Toggle
          id="alert-dip"
          label="Closed in a dip"
          help="After the close, when something you watch finished the day in a dip. Useful if you missed the buy zone."
          checked={rules.alerts.newDip}
          onChange={(v) => updateAlert("newDip", v)}
        />
        <NotificationPermissionToggle />
        <p className="text-xs text-slate-500">
          {isSupabaseConfigured
            ? "Alerts arrive as push notifications, even with the app closed."
            : "In this browser-only mode, alerts only arrive while MarketDesk is open in a tab."}
        </p>
      </Section>

      <div className="sticky bottom-20 flex items-center gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 backdrop-blur md:bottom-4 dark:border-slate-800 dark:bg-slate-900/95">
        <button
          type="submit"
          disabled={status.kind === "saving"}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
        >
          {status.kind === "saving" ? "Saving…" : "Save rules"}
        </button>
        {status.message && (
          <p role="status" className={`text-sm ${status.kind === "error" ? "text-amber-700 dark:text-amber-400" : "text-emerald-600"}`}>
            {status.message}
          </p>
        )}
      </div>
    </form>
  );
}
