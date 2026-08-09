"use client";

import { useState } from "react";
import type { NewsItem } from "@/lib/market/news";
import CollapsibleCardShell from "./CollapsibleCardShell";
import NewsList from "./NewsList";

export default function CollapsibleNewsSection({ items, title = "News" }: { items: NewsItem[]; title?: string }) {
  const [open, setOpen] = useState(false);
  const bullish = items.filter((i) => i.tone === "bullish").length;
  const bearish = items.filter((i) => i.tone === "bearish").length;

  let summary: string;
  if (items.length === 0) summary = "No recent news";
  else if (bullish > bearish && bullish > 0) summary = `${items.length} · mostly bullish`;
  else if (bearish > bullish && bearish > 0) summary = `${items.length} · mostly bearish`;
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
