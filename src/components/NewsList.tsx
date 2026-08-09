"use client";

import { useState } from "react";
import type { HeadlineTone, NewsItem } from "@/lib/market/news";
import { formatRelativeTime } from "@/lib/format";

const DEFAULT_VISIBLE = 3;

const TONE_BADGE: Record<Exclude<HeadlineTone, "neutral">, string> = {
  bullish: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  bearish: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
};

export default function NewsList({ items }: { items: NewsItem[] }) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">No recent news.</p>;
  }

  const bullish = items.filter((i) => i.tone === "bullish").length;
  const bearish = items.filter((i) => i.tone === "bearish").length;
  const visible = expanded ? items : items.slice(0, DEFAULT_VISIBLE);
  const remaining = items.length - visible.length;

  return (
    <div>
      {(bullish > 0 || bearish > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          {bullish > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {bullish} bullish
            </span>
          )}
          {bearish > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-red-500" />
              {bearish} bearish
            </span>
          )}
          <span className="text-slate-400">· keyword read of headlines, not real analysis</span>
        </div>
      )}

      <ul className="space-y-1">
        {visible.map((item) => (
          <li key={item.id}>
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-slate-100 dark:hover:bg-slate-900"
            >
              {item.thumbnail && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.thumbnail}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-md object-cover"
                />
              )}
              <div className="min-w-0">
                <div className="flex items-start gap-2">
                  <p className="line-clamp-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                    {item.title}
                  </p>
                  {item.tone !== "neutral" && (
                    <span
                      className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TONE_BADGE[item.tone]}`}
                      title="Keyword read of the headline, not real sentiment analysis"
                    >
                      {item.tone === "bullish" ? "Bullish" : "Bearish"}
                    </span>
                  )}
                </div>
                {item.summary && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{item.summary}</p>
                )}
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.publisher}
                  {item.publishedAt ? ` · ${formatRelativeTime(item.publishedAt)}` : ""}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ul>

      {items.length > DEFAULT_VISIBLE && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 w-full rounded-lg px-2 py-2 text-left text-xs font-medium text-emerald-600 hover:bg-slate-100 dark:text-emerald-400 dark:hover:bg-slate-900"
        >
          {expanded ? "Show less" : `Show ${remaining} more`}
        </button>
      )}
    </div>
  );
}
