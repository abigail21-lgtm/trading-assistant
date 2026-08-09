"use client";

import { useState } from "react";
import CollapsibleCardShell from "./CollapsibleCardShell";

export default function DeepDiveCard({ points }: { points: string[] }) {
  const [open, setOpen] = useState(false);
  if (points.length === 0) return null;

  return (
    <CollapsibleCardShell
      title="Deeper analysis"
      open={open}
      onToggle={() => setOpen((v) => !v)}
      summary={<span className="text-slate-500 dark:text-slate-400">{open ? "Hide" : "See more"}</span>}
    >
      <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        {points.map((point, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-600" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[10px] text-slate-400">
        Assembled from the chart and recent articles already on this page — not investment advice.
      </p>
    </CollapsibleCardShell>
  );
}
