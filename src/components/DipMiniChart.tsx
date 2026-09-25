import { money } from "@/lib/signals/format";

interface Point {
  time: number;
  close: number;
  ma5: number | null;
}

const W = 320;
const H = 140;
const PAD = { top: 16, right: 8, bottom: 16, left: 8 };

/**
 * Last ~30 closes with the 5-day average (the sell line) and the 200-day
 * average (the trend floor). The latest down streak is shaded.
 */
export default function DipMiniChart({
  points,
  avg200,
  sellPrice,
  downDays,
}: {
  points: Point[];
  avg200: number | null;
  sellPrice: number | null;
  downDays: number;
}) {
  if (points.length < 2) return null;
  const values = points.flatMap((p) => [p.close, p.ma5 ?? p.close]);
  // A far-away 200-day average would flatten the price line, so it's only
  // drawn when it's near the recent range; otherwise the caption names it.
  const drawAvg200 = avg200 != null && avg200 >= Math.min(...values) * 0.88;
  if (drawAvg200) values.push(avg200!);
  if (sellPrice != null) values.push(sellPrice);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const x = (i: number) => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + ((hi - v) / span) * (H - PAD.top - PAD.bottom);
  const line = (vals: (number | null)[]) =>
    vals
      .map((v, i) => (v == null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const last = points.at(-1)!;
  const shadeFrom = x(Math.max(0, points.length - 1 - downDays));

  return (
    <figure className="rounded-lg bg-slate-50 p-3 dark:bg-slate-950/60">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Recent closes with the 5-day and 200-day averages">
        {downDays > 0 && (
          <rect x={shadeFrom} y={0} width={W - PAD.right - shadeFrom + 4} height={H} className="fill-red-100 dark:fill-red-950/60" />
        )}
        {drawAvg200 && avg200 != null && (
          <>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(avg200)} y2={y(avg200)} className="stroke-slate-400" strokeDasharray="4 4" />
            <text x={PAD.left} y={y(avg200) - 4} fontSize="10" className="fill-slate-500">
              200-day {money(avg200)}
            </text>
          </>
        )}
        <polyline points={line(points.map((p) => p.ma5))} fill="none" strokeWidth="2" className="stroke-sky-500" />
        <polyline points={line(points.map((p) => p.close))} fill="none" strokeWidth="1.75" className="stroke-slate-800 dark:stroke-slate-200" />
        <circle cx={x(points.length - 1)} cy={y(last.close)} r="3.5" className="fill-slate-900 dark:fill-slate-100" />
      </svg>
      <figcaption className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          <span className="mr-1 inline-block h-0.5 w-3 bg-slate-800 align-middle dark:bg-slate-200" />
          Close
        </span>
        <span>
          <span className="mr-1 inline-block h-0.5 w-3 bg-sky-500 align-middle" />
          5-day avg (sell line)
        </span>
        <span>
          <span className="mr-1 inline-block w-3 border-t border-dashed border-slate-400 align-middle" />
          {drawAvg200 || avg200 == null ? "200-day avg" : `200-day avg ${money(avg200)} (below chart)`}
        </span>
      </figcaption>
    </figure>
  );
}
