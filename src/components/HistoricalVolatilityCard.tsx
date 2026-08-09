import type { VolatilityWindow } from "@/lib/market/volatility";

export default function HistoricalVolatilityCard({ windows }: { windows: VolatilityWindow[] }) {
  const hasAny = windows.some((w) => w.annualizedPercent != null);
  if (!hasAny) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Historical Volatility</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {windows.map((w) => (
          <div key={w.days}>
            <p className="text-xs text-slate-500">{w.days}-day</p>
            <p className="text-base font-medium text-slate-900 dark:text-slate-100">
              {w.annualizedPercent != null ? `${w.annualizedPercent.toFixed(1)}%` : "—"}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-slate-400">
        Annualized, from daily closes — how much this has actually moved, not the options market&apos;s
        forward-looking (implied) estimate.
      </p>
    </div>
  );
}
