"use client";

import { useEffect, useState } from "react";
import { addToWatchlist, getWatchlist, removeFromWatchlist } from "@/lib/watchlist-client";

export default function StarButton({
  symbol,
  onChange,
}: {
  symbol: string;
  onChange?: () => void;
}) {
  const [starred, setStarred] = useState(false);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getWatchlist().then((symbols) => {
      if (!cancelled) {
        setStarred(symbols.includes(symbol));
        setReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  async function toggle() {
    const next = !starred;
    setStarred(next);
    setPending(true);
    try {
      if (next) {
        await addToWatchlist(symbol);
      } else {
        await removeFromWatchlist(symbol);
      }
      onChange?.();
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
      disabled={pending || !ready}
      aria-pressed={starred}
      aria-label={starred ? `Remove ${symbol} from watchlist` : `Add ${symbol} to watchlist`}
      className="rounded-lg border border-slate-200 p-2 text-slate-400 transition hover:border-slate-300 disabled:opacity-60 dark:border-slate-800 dark:text-slate-500 dark:hover:border-slate-700"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5"
        fill={starred ? "#f59e0b" : "none"}
        stroke={starred ? "#f59e0b" : "currentColor"}
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
