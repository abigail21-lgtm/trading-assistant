"use client";

import { useEffect, useRef } from "react";
import { createChart, LineSeries, type Time } from "lightweight-charts";
import { useDomTheme } from "@/lib/useDomTheme";
import { compareColorFor, type CompareSeries } from "@/lib/market/compare";
import { formatPercent } from "@/lib/format";

function toDailyTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

const PALETTES = {
  dark: { text: "#94a3b8", grid: "#1e293b", border: "#1e293b" },
  light: { text: "#64748b", grid: "#e2e8f0", border: "#cbd5e1" },
} as const;

export default function CompareChart({ series }: { series: CompareSeries[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useDomTheme();
  const hasData = series.some((s) => s.ok && s.points.length > 0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const palette = PALETTES[theme];
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { color: "transparent" }, textColor: palette.text },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border },
      crosshair: { mode: 0 },
      localization: { priceFormatter: (value: number) => formatPercent(value) },
    });

    series.forEach((s, index) => {
      if (!s.ok || s.points.length === 0) return;
      const lineSeries = chart.addSeries(LineSeries, {
        color: compareColorFor(index),
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lineSeries.setData(s.points.map((p) => ({ time: toDailyTime(p.time) as Time, value: p.value })));
    });

    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [series, theme]);

  if (!hasData) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500 dark:text-slate-600">
        Add a ticker to see the comparison
      </div>
    );
  }

  return <div ref={containerRef} className="h-full min-h-0" />;
}
