import type { SentimentSummary } from "@/lib/market/sentiment";

const LABEL_STYLES: Record<SentimentSummary["label"], string> = {
  Bullish: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  Bearish: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  Neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Unknown: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

export function SentimentBadge({ label, sentiment }: { label: string; sentiment: SentimentSummary | null }) {
  const value = sentiment?.label ?? "Unknown";
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LABEL_STYLES[value]}`}>
        {value}
        {sentiment?.bullishPercent != null && ` (${Math.round(sentiment.bullishPercent)}% bullish)`}
      </span>
    </div>
  );
}

export default function SentimentCard({
  stock,
  sector,
  market,
}: {
  stock: SentimentSummary | null;
  sector: SentimentSummary | null;
  market: SentimentSummary | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Sentiment</h3>
      <p className="mt-0.5 text-[11px] text-slate-400">From recent StockTwits activity</p>
      <div className="mt-3 space-y-2">
        <SentimentBadge label="This stock" sentiment={stock} />
        <SentimentBadge label="Sector" sentiment={sector} />
        <SentimentBadge label="Market" sentiment={market} />
      </div>
    </div>
  );
}
