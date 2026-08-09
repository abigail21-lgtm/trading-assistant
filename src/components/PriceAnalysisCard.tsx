import type { PriceAnalysis } from "@/lib/market/analysis";
import { formatPrice } from "@/lib/format";

const TREND_STYLES: Record<PriceAnalysis["trend"], string> = {
  uptrend: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  downtrend: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  range: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const TREND_LABELS: Record<PriceAnalysis["trend"], string> = {
  uptrend: "Uptrend",
  downtrend: "Downtrend",
  range: "Range-bound",
};

export default function PriceAnalysisCard({
  analysis,
  currency,
}: {
  analysis: PriceAnalysis;
  currency: string;
}) {
  if (!analysis.hasEnoughHistory) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500">{analysis.trendSummary}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Analysis</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TREND_STYLES[analysis.trend]}`}>
          {TREND_LABELS[analysis.trend]}
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{analysis.trendSummary}</p>

      {analysis.signal && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {analysis.signal}
        </p>
      )}

      {analysis.levels.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="font-medium text-slate-500">Support</p>
              {analysis.levels
                .filter((l) => l.type === "support")
                .map((l) => (
                  <p key={l.price} className="mt-0.5 text-slate-700 dark:text-slate-300">
                    {formatPrice(l.price, currency)}
                  </p>
                ))}
            </div>
            <div>
              <p className="font-medium text-slate-500">Resistance</p>
              {analysis.levels
                .filter((l) => l.type === "resistance")
                .map((l) => (
                  <p key={l.price} className="mt-0.5 text-slate-700 dark:text-slate-300">
                    {formatPrice(l.price, currency)}
                  </p>
                ))}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Support: price levels below where the stock has repeatedly stopped falling and bounced
            back up. Resistance: price levels above where it has repeatedly stopped rising and
            pulled back. Drawn from past price history — not a guarantee either will hold next time.
          </p>
        </div>
      )}

      <p className="mt-3 text-[10px] text-slate-400">
        Automated read from recent price action — not investment advice.
      </p>
    </div>
  );
}
