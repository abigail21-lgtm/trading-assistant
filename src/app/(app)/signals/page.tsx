import Link from "next/link";
import SignalsClient from "@/components/SignalsClient";

export default function SignalsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Signals</h1>
        <div className="flex gap-2">
          <Link
            href="/journal"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700"
          >
            My trades
          </Link>
          <Link
            href="/settings"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-slate-700"
          >
            My rules
          </Link>
        </div>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Dip in an uptrend: a sharp 1–3 day drop in something whose long-term trend is still up. Checked against the latest
        prices each time you open this page.
      </p>
      <SignalsClient />
    </div>
  );
}
