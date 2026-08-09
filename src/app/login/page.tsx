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

// A typed code rather than a clickable link deliberately: email providers'
// click-tracking/link-scanning (Resend's included, via its underlying AWS
// SES infrastructure) can auto-visit a magic link before the user's real
// click, burning the single-use token. Nothing can auto-visit a code a
// human has to read and type, so this sidesteps that whole class of
// failure rather than working around one provider's specific behavior.
function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/";

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setStatus("working");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({ email });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
    } else {
      setStatus("idle");
      setStep("code");
    }
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setStatus("working");
    setErrorMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });

    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }

    // Full navigation (not router.push) so the server sees the
    // just-written session cookie on the very next request.
    window.location.href = redirectTo;
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
        ) : step === "email" ? (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in with your email — no password needed.
            </p>

            <form onSubmit={handleSendCode} className="mt-6 space-y-3">
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
                disabled={status === "working"}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {status === "working" ? "Sending…" : "Send code"}
              </button>
            </form>

            {status === "error" && (
              <p className="mt-4 text-sm text-red-500 dark:text-red-400">{errorMessage}</p>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Enter the code sent to <span className="font-medium">{email}</span>.
            </p>

            <form onSubmit={handleVerifyCode} className="mt-6 space-y-3">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="Code"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center text-lg tracking-[0.3em] text-slate-900 outline-none focus:border-emerald-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={status === "working" || code.length < 6}
                className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {status === "working" ? "Verifying…" : "Verify"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setStatus("idle");
                  setErrorMessage("");
                }}
                className="w-full text-center text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
              >
                Use a different email
              </button>
            </form>

            {status === "error" && (
              <p className="mt-4 text-sm text-red-500 dark:text-red-400">{errorMessage}</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}
