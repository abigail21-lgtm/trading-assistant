// Display helpers shared by the dip signal screens.

/** "Fri Oct 2", in New York time (where the market's days are). */
export function sessionDate(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "America/New_York",
  });
}

/** "Mon" */
export function sessionWeekday(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString("en-US", { weekday: "short", timeZone: "America/New_York" });
}

export const money = (x: number) =>
  `$${x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const wholeDollars = (x: number) => `$${Math.round(Math.abs(x)).toLocaleString("en-US")}`;

export const signedPct = (x: number, digits = 0) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(digits)}%`;

export const signedDollars = (x: number) => `${x >= 0 ? "+" : "−"}${wholeDollars(x)}`;

/** 95% Wilson score interval for k successes out of n, as fractions. */
export function wilsonInterval(k: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, center - half), Math.min(1, center + half)];
}
