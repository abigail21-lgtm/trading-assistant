import type { EarningsEvent } from "@/lib/market/calendar";
import { formatDate } from "@/lib/format";

const TIME_LABELS: Record<string, string> = {
  "pre-market": "Before market open",
  "after-hours": "After market close",
  "not-supplied": "Time not announced",
};

export default function UpcomingEarningsCard({ event }: { event: EarningsEvent | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Next Earnings</h3>
      {event ? (
        <div className="mt-2">
          <p className="text-base font-medium text-slate-900 dark:text-slate-100">{formatDate(dateToUnix(event.date))}</p>
          <p className="text-sm text-slate-500">{TIME_LABELS[event.time] ?? event.time}</p>
          {event.epsForecast != null && (
            <p className="mt-1 text-xs text-slate-500">Consensus EPS forecast: ${event.epsForecast.toFixed(2)}</p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-500">No confirmed date yet.</p>
      )}
    </div>
  );
}

function dateToUnix(dateStr: string): number {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000);
}
