"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { Candle } from "@/lib/market/yahoo";
import { sma } from "@/lib/market/indicators";
import type { SupportResistanceLevel } from "@/lib/market/analysis";
import type { TrendLine, NewTrendLine } from "@/lib/market/drawings";
import { addDrawing, clearDrawings, getDrawings, removeDrawing } from "@/lib/drawings-client";
import { formatPercent, formatPrice } from "@/lib/format";
import { useDomTheme } from "@/lib/useDomTheme";

function lineDeltaPercent(line: TrendLine): number | null {
  if (!line.price1) return null;
  return ((line.price2 - line.price1) / line.price1) * 100;
}

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
    // Was 40% opacity (…66) -- too faint to read against the dark grid,
    // which is exactly what made the volume pane hard to see at a glance.
    volUp: "#10b981b3",
    volDown: "#ef4444b3",
    drawLine: "#f472b6",
    // Support/resistance used to sit in the same green/red hue family as
    // the candles themselves -- in light mode `support` was the literal
    // same hex as `up`, which is exactly why the lines vanished into the
    // candles they cross through. Moved to teal/fuchsia, a hue family
    // nothing else on this chart uses.
    support: "#2dd4bf",
    resistance: "#e879f9",
  },
  light: {
    text: "#64748b",
    grid: "#e2e8f0",
    border: "#cbd5e1",
    up: "#059669",
    down: "#dc2626",
    volUp: "#059669b3",
    volDown: "#dc2626b3",
    drawLine: "#db2777",
    support: "#0d9488",
    resistance: "#a21caf",
  },
} as const;

type DrawStage = "idle" | "choosing" | "trend" | "support" | "resistance";

export default function StockChart({
  candles,
  intraday = false,
  symbol,
  timeframeKey,
  levels = [],
}: {
  candles: Candle[];
  intraday?: boolean;
  symbol: string;
  timeframeKey: string;
  levels?: SupportResistanceLevel[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const theme = useDomTheme();

  const [drawings, setDrawings] = useState<TrendLine[]>([]);
  // "choosing": the option prompt is showing, after clicking "Draw line" but
  // before picking a mode. "trend" is the two-click sloped line; "support"
  // and "resistance" each complete on a single click, for a user-marked
  // horizontal level explicitly labeled as one or the other.
  const [drawStage, setDrawStage] = useState<DrawStage>("idle");
  const [hasPendingPoint, setHasPendingPoint] = useState(false);
  const drawStageRef = useRef<DrawStage>("idle");
  const pendingPointRef = useRef<{ time: Time; price: number; capturedAtMs: number } | null>(null);

  const [visibleMAs, setVisibleMAs] = useState<Set<number>>(new Set([20, 50, 200]));
  const [showLevels, setShowLevels] = useState(true);

  // Split into one effect that creates the chart + candle/volume series (the
  // expensive part, and the only part that truly needs a full teardown-and-
  // rebuild) plus small effects that layer MAs, trendlines and S/R price
  // lines on top by adding/removing just those series. Previously all of
  // this lived in one effect keyed on every piece of chart state, so toggling
  // an MA, drawing a trendline, or hiding S/R levels tore down and redrew the
  // whole chart (candles, volume, everything) -- visibly janky, and it reset
  // any zoom/pan the user had set.
  const [chart, setChart] = useState<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  // A page restored from the browser's back/forward cache (bfcache) resumes
  // its JS exactly where it left off -- no effects re-run -- but the
  // canvas this chart is drawn on can still lose its actual pixel content
  // on restore. Detect that specific case and force the chart-creation
  // effect below to tear down and repaint from the data already in memory.
  const [bfcacheRebuildKey, setBfcacheRebuildKey] = useState(0);
  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setBfcacheRebuildKey((k) => k + 1);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getDrawings(symbol, timeframeKey).then((lines) => {
      if (!cancelled) setDrawings(lines);
    });
    return () => {
      cancelled = true;
    };
  }, [symbol, timeframeKey]);

  function startChoosing() {
    drawStageRef.current = "choosing";
    setDrawStage("choosing");
  }

  function chooseTrend() {
    drawStageRef.current = "trend";
    setDrawStage("trend");
    pendingPointRef.current = null;
    setHasPendingPoint(false);
  }

  function chooseSupport() {
    drawStageRef.current = "support";
    setDrawStage("support");
  }

  function chooseResistance() {
    drawStageRef.current = "resistance";
    setDrawStage("resistance");
  }

  function cancelDraw() {
    drawStageRef.current = "idle";
    setDrawStage("idle");
    pendingPointRef.current = null;
    setHasPendingPoint(false);
  }

  function toggleMA(period: number) {
    setVisibleMAs((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period);
      else next.add(period);
      return next;
    });
  }

  async function handleClear() {
    setDrawings([]);
    await clearDrawings(symbol, timeframeKey).catch(() => {});
  }

  async function handleRemoveLine(id: string) {
    setDrawings((prev) => prev.filter((l) => l.id !== id));
    await removeDrawing(symbol, timeframeKey, id).catch(() => {});
  }

  // Creates the chart itself plus the candle/volume series -- only reruns
  // when the underlying data, timeframe, or theme actually changes.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || candles.length === 0) return;

    const palette = PALETTES[theme];
    const toTime = intraday ? toIntradayTime : toDailyTime;

    const newChart = createChart(container, {
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

    const candleSeries = newChart.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      borderVisible: false,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    candleSeries.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0.25 } });
    candleSeries.setData(
      candles.map((c) => ({
        time: toTime(c.time) as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );

    const volumeSeries = newChart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    // A bit more height (was top: 0.8, a 20% band) plus the higher-opacity
    // colors above -- the previous combo made volume hard to make out at a
    // glance, per feedback.
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.75, bottom: 0 } });
    volumeSeries.setData(
      candles.map((c) => ({
        time: toTime(c.time) as Time,
        value: c.volume,
        color: c.close >= c.open ? palette.volUp : palette.volDown,
      })),
    );

    newChart.timeScale().fitContent();
    candleSeriesRef.current = candleSeries;

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) newChart.applyOptions({ width: entry.contentRect.width });
    });
    resizeObserver.observe(container);

    setChart(newChart);

    return () => {
      resizeObserver.disconnect();
      candleSeriesRef.current = null;
      setChart(null);
      newChart.remove();
    };
  }, [candles, intraday, theme, symbol, timeframeKey, bfcacheRebuildKey]);

  // Layers moving-average lines on top of the existing chart -- toggling one
  // no longer touches the candle/volume series or the user's zoom/pan.
  useEffect(() => {
    if (!chart) return;
    const toTime = intraday ? toIntradayTime : toDailyTime;
    const closes = candles.map((c) => c.close);
    const added: ISeriesApi<"Line">[] = [];

    for (const { period, color } of MA_PERIODS) {
      if (candles.length < period || !visibleMAs.has(period)) continue;
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
      added.push(lineSeries);
    }

    return () => {
      for (const series of added) chart.removeSeries(series);
    };
  }, [chart, candles, intraday, visibleMAs]);

  // Layers saved lines on top -- adding/removing one no longer rebuilds the
  // whole chart. Two kinds: two-point "trend" lines (a LineSeries between
  // the two points) and one-point "support"/"resistance" lines (a full-width
  // price line, same mechanism as the automatic S/R levels below).
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    const palette = PALETTES[theme];
    const addedSeries: ISeriesApi<"Line">[] = [];
    const addedPriceLines: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];

    for (const line of drawings) {
      if (line.type === "support" || line.type === "resistance") {
        addedPriceLines.push(
          candleSeries.createPriceLine({
            price: line.price1,
            color: line.type === "support" ? palette.support : palette.resistance,
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: line.type === "support" ? "Support (yours)" : "Resistance (yours)",
          }),
        );
        continue;
      }

      // Defensively skip any already-saved degenerate line (identical
      // start/end time, e.g. from a pre-fix mobile double-tap) --
      // lightweight-charts doesn't handle duplicate time values on a line
      // series cleanly, and this data may already exist in storage from
      // before the click-handler guard below was added.
      if (line.time1 === line.time2) continue;
      const delta = lineDeltaPercent(line);
      const lineSeries = chart.addSeries(LineSeries, {
        color: palette.drawLine,
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: false,
        title: delta != null ? formatPercent(delta) : "",
      });
      lineSeries.setData([
        { time: line.time1 as Time, value: line.price1 },
        { time: line.time2 as Time, value: line.price2 },
      ]);
      addedSeries.push(lineSeries);
    }

    return () => {
      for (const series of addedSeries) chart.removeSeries(series);
      for (const priceLine of addedPriceLines) candleSeries.removePriceLine(priceLine);
    };
  }, [chart, drawings, theme]);

  // Layers support/resistance price lines -- toggling visibility no longer
  // rebuilds the whole chart.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries) return;
    const palette = PALETTES[theme];
    const added: ReturnType<ISeriesApi<"Candlestick">["createPriceLine"]>[] = [];

    if (showLevels) {
      for (const level of levels) {
        added.push(
          candleSeries.createPriceLine({
            price: level.price,
            color: level.type === "support" ? palette.support : palette.resistance,
            // Was width 1 + Dotted -- thin enough to disappear behind
            // candle wicks even with a distinct color; Dashed at width 2
            // reads as a continuous line at a glance.
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: level.type === "support" ? "Support" : "Resistance",
          }),
        );
      }
    }

    return () => {
      for (const line of added) candleSeries.removePriceLine(line);
    };
  }, [chart, levels, showLevels, theme]);

  // Registers the trendline-drawing click handler once per chart instance,
  // independent of MA/drawing/level state, so it doesn't need to be torn
  // down and resubscribed on every unrelated toggle.
  useEffect(() => {
    if (!chart) return;
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    function handleClick(param: MouseEventParams<Time>) {
      const stage = drawStageRef.current;
      const isSingleClickMode = stage === "support" || stage === "resistance";
      if ((stage !== "trend" && !isSingleClickMode) || !param.point || param.time == null || !candleSeries) return;
      const price = candleSeries.coordinateToPrice(param.point.y);
      if (price == null) return;

      if (isSingleClickMode) {
        // Completes on a single click -- no second point needed.
        drawStageRef.current = "idle";
        setDrawStage("idle");
        const newLine: NewTrendLine = {
          type: stage,
          time1: param.time as string | number,
          price1: price,
          time2: param.time as string | number,
          price2: price,
        };
        addDrawing(symbol, timeframeKey, newLine)
          .then((saved) => {
            setDrawings((prev) => [...prev, saved]);
          })
          .catch(() => {
            // Save failed -- leave the line undrawn rather than showing one
            // that didn't actually persist.
          });
        return;
      }

      if (!pendingPointRef.current) {
        pendingPointRef.current = { time: param.time, price, capturedAtMs: Date.now() };
        setHasPendingPoint(true);
        return;
      }

      const start = pendingPointRef.current;

      // Guards against a single tap on mobile firing this handler twice in
      // a row (touch + synthetic click, or a double-tap-to-zoom gesture).
      // Without this, the "second" point can land on the same candle or
      // within milliseconds of the first, producing a degenerate
      // near-zero-length line -- lightweight-charts doesn't handle
      // duplicate/non-increasing time values on a line series cleanly,
      // which was making the whole chart disappear rather than just
      // drawing a bad line.
      const tooSoon = Date.now() - start.capturedAtMs < 350;
      const samePoint = start.time === param.time;
      if (tooSoon || samePoint) return;

      pendingPointRef.current = null;
      setHasPendingPoint(false);
      drawStageRef.current = "idle";
      setDrawStage("idle");

      const newLine: NewTrendLine = {
        type: "trend",
        time1: start.time as string | number,
        price1: start.price,
        time2: param.time as string | number,
        price2: price,
      };
      addDrawing(symbol, timeframeKey, newLine)
        .then((saved) => {
          setDrawings((prev) => [...prev, saved]);
        })
        .catch(() => {
          // Save failed -- leave the line undrawn rather than showing one
          // that didn't actually persist.
        });
    }

    chart.subscribeClick(handleClick);
    return () => chart.unsubscribeClick(handleClick);
  }, [chart, symbol, timeframeKey]);

  if (candles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-600">
        No chart data available
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          {drawStage === "idle" && (
            <button
              type="button"
              onClick={startChoosing}
              className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-500 transition hover:text-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Draw line
            </button>
          )}
          {drawStage === "choosing" && (
            <>
              <button
                type="button"
                onClick={chooseTrend}
                className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
              >
                Trendline (2 points)
              </button>
              <button
                type="button"
                onClick={chooseSupport}
                className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
              >
                Support line (1 point)
              </button>
              <button
                type="button"
                onClick={chooseResistance}
                className="rounded-md border border-slate-200 px-2 py-1 font-medium text-slate-600 transition hover:border-emerald-500 hover:text-emerald-600 dark:border-slate-700 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:text-emerald-400"
              >
                Resistance line (1 point)
              </button>
              <button
                type="button"
                onClick={cancelDraw}
                className="px-2 py-1 font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                Cancel
              </button>
            </>
          )}
          {(drawStage === "trend" || drawStage === "support" || drawStage === "resistance") && (
            <button
              type="button"
              onClick={cancelDraw}
              className="rounded-md bg-emerald-600 px-2 py-1 font-medium text-white transition"
            >
              {drawStage === "support"
                ? "Click a support price…"
                : drawStage === "resistance"
                  ? "Click a resistance price…"
                  : hasPendingPoint
                    ? "Click end point…"
                    : "Click start point…"}
            </button>
          )}
          {drawings.map((line) => {
            const isLevel = line.type === "support" || line.type === "resistance";
            const delta = isLevel ? null : lineDeltaPercent(line);
            const label = isLevel
              ? `${line.type === "support" ? "Support" : "Resistance"} ${formatPrice(line.price1)}`
              : delta != null
                ? formatPercent(delta)
                : "Line";
            return (
              <span
                key={line.id}
                className="flex items-center gap-1 rounded-md border border-slate-200 py-1 pl-2 pr-1 font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300"
              >
                {label}
                <button
                  type="button"
                  onClick={() => handleRemoveLine(line.id)}
                  aria-label={isLevel ? "Remove this level" : "Remove this trendline"}
                  className="rounded p-0.5 text-slate-400 hover:text-red-500 dark:hover:text-red-400"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3 w-3">
                    <path strokeLinecap="round" d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
              </span>
            );
          })}
          {drawings.length > 1 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md px-2 py-1 font-medium text-slate-500 transition hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {MA_PERIODS.map(({ period, color }) => (
            <button
              key={period}
              type="button"
              onClick={() => toggleMA(period)}
              className="flex items-center gap-1 font-medium"
              style={{ color: visibleMAs.has(period) ? color : undefined }}
              aria-pressed={visibleMAs.has(period)}
            >
              <span
                className="h-0.5 w-3 rounded-full"
                style={{ backgroundColor: visibleMAs.has(period) ? color : "#94a3b8" }}
              />
              <span className={visibleMAs.has(period) ? "" : "text-slate-400 dark:text-slate-600"}>
                MA{period}
              </span>
            </button>
          ))}
          {levels.length > 0 && (
            <button
              type="button"
              onClick={() => setShowLevels((v) => !v)}
              aria-pressed={showLevels}
              title="Support/resistance: price levels where the stock has repeatedly bounced (support) or pulled back (resistance) in the past. See the Analysis card for details."
              className={`font-medium ${
                showLevels ? "text-slate-600 dark:text-slate-300" : "text-slate-400 dark:text-slate-600"
              }`}
            >
              S/R levels
            </button>
          )}
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        <span
          className="pointer-events-none absolute bottom-1 left-1 text-[10px] font-medium text-slate-400 dark:text-slate-600"
          title="Each bar is that period's trading volume. The number on the right edge is the most recent bar, not an average."
        >
          Volume (latest bar)
        </span>
      </div>
    </div>
  );
}
