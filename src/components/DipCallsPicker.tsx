"use client";

import { useState } from "react";
import type { CallsForExpiry, StrikeGrade } from "@/lib/signals/calls";
import type { DipGradeResult } from "@/lib/signals/dip-grade";
import { money, signedDollars, signedPct, wholeDollars } from "@/lib/signals/format";
import DipGradePill from "./DipGradePill";

const GRADE_STYLE: Record<StrikeGrade, { label: string; pill: string; bar: string }> = {
  good: { label: "GOOD", pill: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", bar: "bg-emerald-500" },
  caution: { label: "CAUTION", pill: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-400", bar: "bg-amber-400" },
  avoid: { label: "AVOID", pill: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-400", bar: "bg-red-500" },
};

// Tailwind only generates classes it can see written out in full.
const GRID_COLS = ["grid-cols-1", "grid-cols-1", "grid-cols-2", "grid-cols-3"];

const expiryLabel = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function DipCallsPicker({
  symbol,
  expiries,
  defaultIndex,
  bouncePrice,
}: {
  symbol: string;
  expiries: { calls: CallsForExpiry; grade: DipGradeResult }[];
  defaultIndex: number;
  bouncePrice: number;
}) {
  const [index, setIndex] = useState(defaultIndex);
  const { calls, grade } = expiries[index];
  const pick = calls.pickIndex != null ? calls.rows[calls.pickIndex] : null;
  const weeks = Math.round(calls.daysToExpiry / 7);
  const earnings = grade.checks.find((c) => /earnings/i.test(c.title));
  const earningsWarn = earnings && (earnings.status === "warn" || earnings.status === "fail");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900" aria-labelledby="calls-heading">
      <h2 id="calls-heading" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
        Calls for this setup
      </h2>

      <div className={`mt-2 grid gap-1 text-xs font-medium ${GRID_COLS[Math.min(expiries.length, 3)]}`} role="tablist" aria-label="Expiration">
        {expiries.map((x, i) => (
          <button
            key={x.calls.expiration}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={`rounded-md px-2 py-1.5 ${
              i === index
                ? "bg-emerald-600/10 text-emerald-600 dark:bg-emerald-600/20 dark:text-emerald-400"
                : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {expiryLabel(x.calls.expiration)}
            <br />
            <span className="font-normal">{Math.round(x.calls.daysToExpiry / 7)} weeks</span>
          </button>
        ))}
      </div>

      <div
        className={`mt-3 flex items-start justify-between gap-2 rounded-lg px-3 py-2 text-xs ${
          earningsWarn || weeks < 3
            ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
            : "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
        }`}
      >
        <p>
          {weeks} weeks out
          {weeks < 3 ? ". Cheaper, but time decay is faster; fine if you're out in a day or two." : "."}{" "}
          {earnings ? `${earnings.title} ${earnings.detail}` : ""}
        </p>
        {grade.grade && <DipGradePill grade={grade.grade} />}
      </div>

      {pick ? (
        <div className="mt-3 rounded-lg border-2 border-emerald-500 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Suggested pick</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              ${pick.strike} call · {expiryLabel(calls.expiration)}
            </span>
            <span className="text-sm tabular-nums text-slate-600 dark:text-slate-400">{wholeDollars(pick.cost)}</span>
          </div>
          <p className="mt-1 text-sm tabular-nums">
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {signedDollars(pick.bounceDollars)} ({signedPct(pick.bouncePct)}) if it bounces
            </span>{" "}
            <span className="text-slate-400">·</span>{" "}
            <span className="font-medium text-red-500 dark:text-red-400">
              {signedDollars(pick.slideDollars)} ({signedPct(pick.slidePct)}) if it slides
            </span>
          </p>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
            A bit in the money: moves closely with {symbol} without costing as much as the deepest strikes.
          </p>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-950/60 dark:text-slate-400">
          No strike fits well at this expiry. Try another date.
        </p>
      )}

      <p className="mt-3 text-xs text-slate-500">
        This setup makes small, quick moves, so calls a bit in the money work best: less time value to lose.
      </p>
      <ul className="mt-2 space-y-2">
        {calls.rows.map((r, i) => {
          const g = GRADE_STYLE[r.grade];
          return (
            <li
              key={r.strike}
              className={`relative overflow-hidden rounded-lg border border-slate-200 py-2 pl-4 pr-3 dark:border-slate-800 ${
                i === calls.pickIndex ? "ring-1 ring-emerald-500" : ""
              }`}
            >
              <span className={`absolute inset-y-0 left-0 w-1 ${g.bar}`} />
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  ${r.strike} call <span className="ml-1 text-xs font-normal text-slate-500">{wholeDollars(r.cost)}</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${g.pill}`}>{g.label}</span>
              </div>
              <p className="mt-0.5 text-xs tabular-nums">
                <span className={r.bounceDollars >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}>
                  {signedDollars(r.bounceDollars)} ({signedPct(r.bouncePct)})
                </span>{" "}
                <span className="text-slate-400">/</span>{" "}
                <span className="text-red-500 dark:text-red-400">
                  {signedDollars(r.slideDollars)} ({signedPct(r.slidePct)})
                </span>{" "}
                <span className="text-slate-400">·</span> <span className="text-slate-600 dark:text-slate-400">{r.tag}</span>
              </p>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-950/60 dark:text-slate-400">
        {pick && (
          <p>
            <b className="font-semibold text-slate-800 dark:text-slate-200">Placing the order:</b> use a limit order at about{" "}
            <span className="tabular-nums">{money(pick.limitPrice)}</span> (halfway between the bid and ask). Don&apos;t use a
            market order on options; you can lose a lot to the gap between buy and sell prices.
          </p>
        )}
        <p>
          <b className="font-semibold text-slate-800 dark:text-slate-200">Prices are delayed about 15 minutes.</b> Check the live
          price in your broker before you buy.
        </p>
      </div>
      <p className="mt-3 text-[11px] text-slate-400">
        &ldquo;If it bounces&rdquo; = {symbol} closes at {money(bouncePrice)} in about 2 trading days. &ldquo;If it slides&rdquo; ={" "}
        {symbol} falls another 3%. Estimates for one contract, not quotes. Not investment advice.
      </p>
    </section>
  );
}
