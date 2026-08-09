// A trend line drawn on a chart. `time1`/`time2` are whatever lightweight-charts'
// click handler resolved (a "YYYY-MM-DD" string for daily+ candles, or a
// shifted UTC timestamp number for intraday — see StockChart's toDailyTime /
// toIntradayTime). Kept as string | number here rather than importing
// lightweight-charts' `Time` type, so this module has no charting-library
// dependency.
export interface TrendLine {
  id: string;
  time1: string | number;
  price1: number;
  time2: string | number;
  price2: number;
}

export type NewTrendLine = Omit<TrendLine, "id">;
