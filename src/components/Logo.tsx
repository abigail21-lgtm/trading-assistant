// The "Desk" mark (monitor + trend line) paired with a weight-shifted
// wordmark — regular "Market" carries into bold, emerald "Desk". Chosen
// over a candlestick-filled screen because it stays legible down to
// favicon size; see public/icons for the icon-only cut of the same mark.
export default function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const iconPx = size === "sm" ? 18 : size === "lg" ? 30 : 22;
  const textClass = size === "sm" ? "text-sm" : size === "lg" ? "text-2xl" : "text-base";

  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={iconPx}
        height={iconPx}
        viewBox="0 0 52 52"
        fill="none"
        className="shrink-0 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      >
        <rect x="6" y="10" width="40" height="26" rx="2.5" stroke="currentColor" strokeWidth="3" />
        <polyline
          points="12,28 20,22 27,26 34,17 41,20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <rect x="20" y="40" width="12" height="3" rx="1.5" fill="currentColor" />
      </svg>
      <span className={`${textClass} leading-none tracking-tight`}>
        <span className="font-normal text-slate-900 dark:text-slate-100">Market</span>
        <span className="font-bold text-emerald-600 dark:text-emerald-400">Desk</span>
      </span>
    </span>
  );
}
