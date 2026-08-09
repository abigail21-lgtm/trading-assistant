"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type Time,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/yahoo";
import { sma } from "@/lib/market/indicators";
import type { TrendLine, NewTrendLine } from "@/lib/market/drawings";
import { addDrawing, clearDrawings, getDrawings } from "@/lib/drawings-client";

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
    drawLine: "#f472b6",
  },
  light: {
    text: "#64748b",
    grid: "#e2e8f0",
    border: "#cbd5e1",
    up: "#059669",
    down: "#dc2626",
    volUp: "#05966955",
    volDown: "#dc262655",
    drawLine: "#db2777",
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
  symbol,
  timeframeKey,
}: {
  candles: Candle[];
  intraday?: boolean;
  symbol: string;
  timeframeKey: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useDomTheme();

  const [drawings, setDrawings] = useState<TrendLine[]>([]);
  const [drawMode, setDrawMode] = useState(false);
  const [hasPendingPoint, setHasPendingPoint] = useState(false);
  const drawModeRef = useRef(false);
  const pendingPointRef = useRef<{ time: Time; price: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDrawings(symbol, timeframeKey).then((lines) => {
      if (!cancelled) setDrawings(lines);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframeKey]);

  function toggleDrawMode() {
    const next = !drawMode;
    setDrawMode(next);
    drawModeRef.current = next;
    pendingPointRef.current = null;
    setHasPendingPoint(false);
  }

  async function handleClear() {
    setDrawings([]);
    await clearDrawings(symbol, timeframeKey);
  }

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

    for (const line of drawings) {
      const lineSeries = chart.addSeries(LineSeries, {
        color: palette.drawLine,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      });
      lineSeries.setData([
        { time: line.time1 as Time, value: line.price1 },
        { time: line.time2 as Time, value: line.price2 },
      ]);
    }

    chart.timeScale().fitContent();

    chart.subscribeClick((param) => {
      if (!drawModeRef.current || !param.point || param.time == null) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;

      if (!pendingPointRef.current) {
        pendingPointRef.current = { time: param.time, price };
        setHasPendingPoint(true);
        return;
      }

      const start = pendingPointRef.current;
      pendingPointRef.current = null;
      setHasPendingPoint(false);
      drawModeRef.current = false;
      setDrawMode(false);

      const newLine: NewTrendLine = {
        time1: start.time as string | number,
        price1: start.price,
        time2: param.time as string | number,
        price2: price,
      };
      addDrawing(symbol, timeframeKey, newLine).then((saved) => {
        setDrawings((prev) => [...prev, saved]);
      });
    });

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) chart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [candles, intraday, theme, drawings, symbol, timeframeKey]);

  if (candles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-600">
        No chart data available
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleDrawMode}
            className={`rounded-md px-2 py-1 font-medium transition ${
              drawMode
                ? "bg-emerald-600 text-white"
                : "border border-slate-200 text-slate-500 hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {drawMode ? (hasPendingPoint ? "Click end point…" : "Click start point…") : "Draw trendline"}
          </button>
          {drawings.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md px-2 py-1 font-medium text-slate-500 transition hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
            >
              Clear lines
            </button>
          )}
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1" />
    </div>
  );
}
