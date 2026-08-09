"use client";

import { useState } from "react";
import type { SentimentSummary } from "@/lib/market/sentiment";
import CollapsibleCardShell from "./CollapsibleCardShell";

const LABEL_STYLES: Record<SentimentSummary["label"], string> = {
  Bullish: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  Bearish: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
  Neutral: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  Unknown: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

export function SentimentBadge({ label, sentiment }: { label: string; sentiment: SentimentSummary | null }) {
  const value = sentiment?.label ?? "Unknown";
  const tagged = sentiment?.taggedTotal ?? 0;
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="flex items-center gap-1 text-slate-500">
        {label}
        <InfoIcon
          title={
            tagged > 0
              ? `Based on ${tagged} sentiment-tagged post${tagged === 1 ? "" : "s"} out of ${sentiment?.sampledMessages ?? 0} recent on StockTwits — a small, self-reported, unweighted sample from one platform, not a real sentiment model.`
              : "Needs at least 3 sentiment-tagged posts on StockTwits before showing a read -- a small, self-reported, unweighted sample from one platform, not a real sentiment model."
          }
        />
      </span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LABEL_STYLES[value]}`}>
        {value}
        {sentiment?.bullishPercent != null && ` (${Math.round(sentiment.bullishPercent)}% bullish)`}
      </span>
    </div>
  );
}

function InfoIcon({ title }: { title: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className="h-3.5 w-3.5 shrink-0 cursor-help text-slate-400"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

export default function SentimentCard({
  symbol,
  stock,
  sector,
  market,
}: {
  symbol: string;
  stock: SentimentSummary | null;
  sector: SentimentSummary | null;
  market: SentimentSummary | null;
}) {
  const [open, setOpen] = useState(false);
  const value = stock?.label ?? "Unknown";

  return (
    <CollapsibleCardShell
      title={`${symbol} Sentiment`}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${LABEL_STYLES[value]}`}>
          {symbol}: {value}
        </span>
      }
    >
      <p className="mb-2 text-[11px] text-slate-400">
        From recent StockTwits activity — this stock&apos;s own sentiment, separate from the market/sector rows below.
      </p>
      <div className="space-y-2">
        <SentimentBadge label="This stock" sentiment={stock} />
        <SentimentBadge label="Sector" sentiment={sector} />
        <SentimentBadge label="Market" sentiment={market} />
      </div>
    </CollapsibleCardShell>
  );
}
