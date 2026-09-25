import { getServerRules } from "@/lib/signals/rules-server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import RulesForm from "@/components/RulesForm";

export default async function SettingsPage() {
  const rules = await getServerRules();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">My rules</h1>
      <p className="mt-1 text-sm text-slate-500">
        How the Signals tab and Setup screen grade things for you.{" "}
        {isSupabaseConfigured ? "Saved to your account." : "Saved in this browser."} The core signal (the 200-day trend
        filter and the sell rule) stays fixed, because that&apos;s what the track record measures.
      </p>
      <RulesForm initial={rules} />
    </div>
  );
}
