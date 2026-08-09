"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import Logo from "@/components/Logo";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";
  const linkError = searchParams.get("error") === "invalid-link";

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-white px-4 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <h1><Logo size="lg" /></h1>

        {!isSupabaseConfigured ? (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Running in local mode — there&apos;s no account to sign into yet. Your watchlist is
              saved in this browser.
            </p>
            <Link
              href="/"
              className="mt-6 block rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-medium text-white transition hover:bg-emerald-500"
            >
              Go to the app
            </Link>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in with your email — no password needed.
            </p>

            {status === "sent" ? (
              <p className="mt-6 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Check <span className="font-medium">{email}</span> for a sign-in link.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-3">
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
                >
                  {status === "sending" ? "Sending…" : "Send magic link"}
                </button>
              </form>
            )}

            {(status === "error" || linkError) && (
              <p className="mt-4 text-sm text-red-500 dark:text-red-400">
                {status === "error"
                  ? errorMessage
                  : "That sign-in link is invalid or expired. Request a new one."}
              </p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
