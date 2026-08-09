"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type Time,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/yahoo";
import { sma } from "@/lib/market/indicators";

function toDailyTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

// lightweight-charts renders UTCTimestamp as if it were already the wall-clock
// time to display, so intraday bars are shifted by the viewer's local
// timezone offset to show local time instead of raw UTC.
function toIntradayTime(unixSeconds: number): number {
  return unixSeconds - new Date().getTimezoneOffset() * 60;
}

const MA_PERIODS = [
  { period: 20, color: "#38bdf8" },
  { period: 50, color: "#a78bfa" },
  { period: 200, color: "#f59e0b" },
] as const;

const PALETTES = {
  dark: {
    text: "#94a3b8",
    grid: "#1e293b",
    border: "#1e293b",
    up: "#10b981",
    down: "#ef4444",
    volUp: "#10b98166",
    volDown: "#ef444466",
  },
  light: {
    text: "#64748b",
    grid: "#e2e8f0",
    border: "#cbd5e1",
    up: "#059669",
    down: "#dc2626",
    volUp: "#05966955",
    volDown: "#dc262655",
  },
} as const;

function useDomTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light"
      ? "light"
      : "dark",
  );

  useEffect(() => {
    const el = document.documentElement;
    const observer = new MutationObserver(() => {
      setTheme(el.getAttribute("data-theme") === "light" ? "light" : "dark");
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return theme;
}

export default function StockChart({
  candles,
  intraday = false,
}: {
  candles: Candle[];
  intraday?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useDomTheme();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const palette = PALETTES[theme];
    const toTime = intraday ? toIntradayTime : toDailyTime;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: { borderColor: palette.border },
      timeScale: {
        borderColor: palette.border,
        timeVisible: intraday,
        secondsVisible: false,
      },
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderVisible: false,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.3 } });
    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.time) as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(
      candles.map((c) => ({
        time: toTime(c.time) as Time,
        value: c.volume,
        color: c.close >= c.open ? palette.volUp : palette.volDown,
      })),
    );

    const closes = candles.map((c) => c.close);
    for (const { period, color } of MA_PERIODS) {
      if (candles.length < period) continue;
      const values = sma(closes, period);
      const lineSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      lineSeries.setData(
        candles
          .map((c, i) => ({ time: toTime(c.time) as Time, value: values[i] }))
          .filter((point): point is { time: Time; value: number } => point.value != null),
      );
    }

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
  }, [candles, intraday, theme]);

  if (candles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-600">
        No chart data available
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
