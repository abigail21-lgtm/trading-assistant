import type { EarningsEvent } from "@/lib/market/calendar";
import { daysUntil, earningsDateToUnix, EARNINGS_PROXIMITY_DAYS } from "@/lib/market/calendar";
import { formatDate } from "@/lib/format";

const TIME_LABELS: Record<string, string> = {
  "pre-market": "before market open",
  "after-hours": "after market close",
  "not-supplied": "time not yet announced",
};

export default function EarningsProximityBanner({ event }: { event: EarningsEvent | null }) {
  if (!event) return null;
  const days = daysUntil(event.date);
  if (days < 0 || days > EARNINGS_PROXIMITY_DAYS) return null;

  const whenLabel = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const timeLabel = TIME_LABELS[event.time];

  return (
    <div className="mt-4 flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm dark:border-amber-900 dark:bg-amber-950">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.3 2.25h17.76a1.5 1.5 0 0 0 1.3-2.25L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"
        />
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
      </svg>
      <p className="text-amber-800 dark:text-amber-300">
        <span className="font-medium">Earnings {whenLabel}</span> — {formatDate(earningsDateToUnix(event.date))}
        {timeLabel ? `, ${timeLabel}` : ""}. Expect elevated IV into the print and a possible sharp repricing after.
      </p>
    </div>
  );
}
