"use client";

import { useState } from "react";
import type { NewsItem } from "@/lib/market/news";
import CollapsibleCardShell from "./CollapsibleCardShell";
import NewsList from "./NewsList";

export default function CollapsibleNewsSection({ items, title = "News" }: { items: NewsItem[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const bullish = items.filter((i) => i.tone === "bullish").length;
  const bearish = items.filter((i) => i.tone === "bearish").length;
  const tagged = bullish + bearish;
  // A "mostly X" claim needs an actual sample to back it up -- most
  // headlines read neutral by keyword, so with e.g. 1 bearish out of 8
  // items (7 neutral), calling the whole list "mostly bearish" overstates
  // a single, possibly-misclassified headline as a trend.
  const hasClearLead = tagged >= 3 && Math.max(bullish, bearish) >= Math.min(bullish, bearish) * 2;

  let summary: string;
  if (items.length === 0) summary = "No recent news";
  else if (hasClearLead && bullish > bearish) summary = `${items.length} · mostly bullish`;
  else if (hasClearLead && bearish > bullish) summary = `${items.length} · mostly bearish`;
  else summary = `${items.length} recent`;

  return (
    <CollapsibleCardShell
      title={title}
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={<span className="text-slate-500 dark:text-slate-400">{summary}</span>}
    >
      <NewsList items={items} />
    </CollapsibleCardShell>
  );
}
