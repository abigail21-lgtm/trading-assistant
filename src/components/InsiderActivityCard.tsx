"use client";

import { useState } from "react";
import type { InsiderActivitySummary } from "@/lib/market/insider";
import { formatDate } from "@/lib/format";
import CollapsibleCardShell from "./CollapsibleCardShell";

function dateToUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}

export default function InsiderActivityCard({ summary }: { summary: InsiderActivitySummary | null }) {
  const [open, setOpen] = useState(false);
  if (!summary) return null;

  return (
    <CollapsibleCardShell
      title="Insider Activity"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={
        summary.count > 0 ? (
          <span className="font-medium text-slate-900 dark:text-slate-100">
            {summary.count} filing{summary.count === 1 ? "" : "s"}
          </span>
        ) : (
          <span className="text-slate-500">None recent</span>
        )
      }
    >
      <p className="text-xs text-slate-500">
        Form 4 filings (insider buys/sells) in the last {summary.windowDays} days.
      </p>

      {summary.filings.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {summary.filings.map((f) => (
            <li key={f.accessionNumber} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-600 dark:text-slate-400">{formatDate(dateToUnix(f.filingDate))}</span>
              <a
                href={f.documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
              >
                View filing ↗
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No Form 4 filings in this window.</p>
      )}

      <a
        href={summary.browseUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
      >
        Full filing history on SEC EDGAR ↗
      </a>

      <p className="mt-3 text-[10px] text-slate-400">
        Filing dates only — not buy/sell direction or size, and each filing is due within 2 business days of the
        transaction, so it can lag actual trades by that much or more.
      </p>
    </CollapsibleCardShell>
  );
}
