import type { DipGrade } from "@/lib/signals/dip-grade";

const STYLES: Record<DipGrade, { label: string; pill: string; dot: string }> = {
  go: {
    label: "GO",
    pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  caution: {
    label: "CAUTION",
    pill: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-400",
  },
  pass: {
    label: "PASS",
    pill: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400",
    dot: "bg-red-500",
  },
};

export default function DipGradePill({ grade, large = false }: { grade: DipGrade; large?: boolean }) {
  const s = STYLES[grade];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-bold tracking-wide ${s.pill} ${
        large ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

/** For a trade already under way the buy grade doesn't apply; show where it stands instead. */
export function DipStagePill({ status, holdDay, maxHold, large = false }: { status: string; holdDay: number | null; maxHold: number; large?: boolean }) {
  const label = status === "sell-today" ? "SELL" : `DAY ${holdDay ?? "?"} OF ${maxHold}`;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-sky-50 font-bold tracking-wide text-sky-700 dark:bg-sky-950 dark:text-sky-300 ${
        large ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <span className="h-2 w-2 rounded-full bg-sky-500" />
      {label}
    </span>
  );
}

export const isTradeUnderWay = (status: string | null) => status === "holding" || status === "sell-today";
