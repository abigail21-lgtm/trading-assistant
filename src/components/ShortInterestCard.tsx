import type { ShortInterestSummary } from "@/lib/market/short-interest";
import { formatCompactNumber, formatDate } from "@/lib/format";

const STATUS_LABEL: Record<ShortInterestSummary["status"], string> = {
  new: "New",
  established: "Established",
};

const STATUS_STYLE: Record<ShortInterestSummary["status"], string> = {
  new: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
  established: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

const STATUS_NOTE: Record<ShortInterestSummary["status"], string> = {
  new: "Just became elevated this settlement period.",
  established: "Has stayed elevated across recent settlement periods.",
};

export default function ShortInterestCard({ summary }: { summary: ShortInterestSummary | null }) {
  if (!summary) return null;
  const { latest, status } = summary;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Short Interest</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
        Notably elevated —{" "}
        <span className="font-medium text-slate-800 dark:text-slate-200">
          {latest.daysToCover.toFixed(1)} days to cover
        </span>{" "}
        as of {formatDate(latest.settlementDate)}.
      </p>
      <p className="mt-1 text-xs text-slate-500">{formatCompactNumber(latest.interest)} shares short</p>
      <p className="mt-2 text-xs text-slate-500">{STATUS_NOTE[status]}</p>
      <p className="mt-3 text-[10px] text-slate-400">
        Reported bi-monthly by exchanges — can lag current positioning by up to ~2 weeks.
      </p>
    </div>
  );
}
