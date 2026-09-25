import Link from "next/link";
import type { DipSnapshot } from "@/lib/signals/load";
import { money, sessionDate } from "@/lib/signals/format";
import DipGradePill, { DipStagePill, isTradeUnderWay } from "./DipGradePill";

/** Compact "Dip in an uptrend" summary for the stock page; opens the Setup screen. */
export default function DipSetupCard({ snapshot }: { snapshot: DipSnapshot }) {
  const { symbol, evaluation: e, grade, trackRecord: tr } = snapshot;
  const record =
    tr && tr.count > 0 ? `Up at exit ${tr.upCount} of ${tr.count} times (${Math.round((tr.upCount / tr.count) * 100)}%)` : null;

  const details: string[] = [];
  if ((e.status === "signal" || e.status === "holding") && e.sellPrice != null) {
    details.push(`Sell above ${money(e.sellPrice)}${snapshot.lastDayTime ? `, or by ${sessionDate(snapshot.lastDayTime)}` : ""}`);
  }
  if (e.status === "in-buy-zone" && e.buyZone) details.push(`Buy zone: at or below ${money(e.buyZone.ceiling)}`);
  if (record) details.push(record);

  const body = (
    <>
      <span className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Dip in an uptrend</span>
        {isTradeUnderWay(e.status) ? (
          <DipStagePill status={e.status} holdDay={e.holdDay} maxHold={e.params.maxHoldBars} />
        ) : grade.grade ? (
          <DipGradePill grade={grade.grade} />
        ) : (
          <span className="text-xs text-slate-400">{grade.headline}</span>
        )}
      </span>
      <span className="mt-1.5 block text-sm text-slate-600 dark:text-slate-400">{grade.reason}</span>
      {details.length > 0 && <span className="mt-1 block text-xs text-slate-500">{details.join(" · ")}</span>}
    </>
  );

  const shell = "block rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
  // With nothing to act on, the card is informational only.
  if (grade.grade == null) return <div className={shell}>{body}</div>;

  return (
    <Link
      href={`/stock/${symbol}/setup`}
      className={`${shell} transition hover:border-slate-300 dark:hover:border-slate-700`}
    >
      {body}
      <span className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm font-medium text-emerald-600 dark:border-slate-800 dark:text-emerald-400">
        {isTradeUnderWay(e.status) ? "See the plan" : "See setup & calls"} <span aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
