// A line drawn on a chart -- either a two-point "trend" line (connecting a
// start and end point, at possibly different prices, to trace a slope) or a
// one-point "horizontal" line (a single price, spanning the full chart, for
// a user-marked support/resistance level). `time1`/`time2` are whatever
// lightweight-charts' click handler resolved (a "YYYY-MM-DD" string for
// daily+ candles, or a shifted UTC timestamp number for intraday — see
// StockChart's toDailyTime / toIntradayTime). Kept as string | number here
// rather than importing lightweight-charts' `Time` type, so this module has
// no charting-library dependency.
//
// `type` is optional so lines saved before this distinction existed (all
// two-point trend lines) still load correctly -- treat a missing `type` as
// "trend". For a horizontal line, time2/price2 just mirror time1/price1;
// only price1 is actually used when rendering one.
export interface TrendLine {
  id: string;
  type?: "trend" | "horizontal";
  time1: string | number;
  price1: number;
  time2: string | number;
  price2: number;
}

export type NewTrendLine = Omit<TrendLine, "id">;
