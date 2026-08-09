"use client";

import { useState } from "react";

export default function DeepDiveCard({ points }: { points: string[] }) {
  const [open, setOpen] = useState(false);
  if (points.length === 0) return null;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        <span>Deeper analysis</span>
        <span className="flex items-center gap-1">
          {open ? "Hide" : "See more"}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-2 text-sm text-slate-600 dark:text-slate-400">
          {points.map((point, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-600" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
