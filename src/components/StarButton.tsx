"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StarButton({
  symbol,
  initialStarred,
}: {
  symbol: string;
  initialStarred: boolean;
}) {
  const router = useRouter();
  const [starred, setStarred] = useState(initialStarred);
  const [pending, setPending] = useState(false);

  async function toggle() {
    const next = !starred;
    setStarred(next);
    setPending(true);
    try {
      if (next) {
        await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
      } else {
        await fetch(`/api/watchlist?symbol=${encodeURIComponent(symbol)}`, {
          method: "DELETE",
        });
      }
      router.refresh();
    } catch {
      setStarred(!next);
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={starred}
      aria-label={starred ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      className="rounded-lg border border-slate-800 p-2 transition hover:border-slate-700 disabled:opacity-60"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={starred ? "#f59e0b" : "none"}
        stroke={starred ? "#f59e0b" : "#94a3b8"}
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"
        />
      </svg>
    </button>
  );
}
