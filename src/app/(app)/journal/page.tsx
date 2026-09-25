import JournalClient from "@/components/JournalClient";

export default function JournalPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My trades</h1>
      <p className="mt-1 text-sm text-slate-500">
        Import your Robinhood activity to see how your options trades went, and whether the ones bought on a dip signal did
        better than the rest.
      </p>
      <JournalClient />
    </div>
  );
}
