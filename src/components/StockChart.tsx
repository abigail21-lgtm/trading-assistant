"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  type Time,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/yahoo";
import { sma } from "@/lib/market/indicators";

function toChartTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

const MA_PERIODS = [
  { period: 20, color: "#38bdf8" },
  { period: 50, color: "#a78bfa" },
  { period: 200, color: "#f59e0b" },
] as const;

export default function StockChart({ candles }: { candles: Candle[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: { borderColor: "#1e293b" },
      timeScale: { borderColor: "#1e293b" },
      crosshair: { mode: 0 },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.3 } });
    candleSeries.setData(
      candles.map((c) => ({
        time: toChartTime(c.time) as Time,
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
        time: toChartTime(c.time) as Time,
        value: c.volume,
        color: c.close >= c.open ? "#10b98166" : "#ef444466",
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
          .map((c, i) => ({ time: toChartTime(c.time) as Time, value: values[i] }))
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
  }, [candles]);

  if (candles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-600">
        No chart data available
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
