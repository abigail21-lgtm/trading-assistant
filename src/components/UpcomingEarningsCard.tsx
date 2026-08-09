"use client";

import { useState } from "react";
import type { EarningsEvent } from "@/lib/market/calendar";
import { daysUntil, earningsDateToUnix, EARNINGS_PROXIMITY_DAYS } from "@/lib/market/calendar";
import { formatDate } from "@/lib/format";
import CollapsibleCardShell from "./CollapsibleCardShell";

const TIME_LABELS: Record<string, string> = {
  "pre-market": "Before market open",
  "after-hours": "After market close",
  "not-supplied": "Time not announced",
};

export default function UpcomingEarningsCard({ event }: { event: EarningsEvent | null }) {
  const [open, setOpen] = useState(false);
  const soon = event != null && daysUntil(event.date) <= EARNINGS_PROXIMITY_DAYS;

  return (
    <CollapsibleCardShell
      title="Next Earnings"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={
        <span
          className={
            soon
              ? "font-medium text-amber-600 dark:text-amber-400"
              : event
                ? "font-medium text-slate-900 dark:text-slate-100"
                : "text-slate-500"
          }
        >
          {event ? formatDate(earningsDateToUnix(event.date)) : "No date yet"}
        </span>
      }
    >
      {event ? (
        <div>
          <p className="text-sm text-slate-500">{TIME_LABELS[event.time] ?? event.time}</p>
          {event.epsForecast != null && (
            <p className="mt-1 text-xs text-slate-500">Consensus EPS forecast: ${event.epsForecast.toFixed(2)}</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">No confirmed date in the next 30 days.</p>
      )}
    </CollapsibleCardShell>
  );
}
