import type { OptionTrade } from "./robinhood";
import type { EntryEvaluation } from "./evaluate";

// Summary numbers and plain-English takeaways for the imported trades.
// Deliberately cautious: with a handful of trades, differences are mostly
// noise, so takeaways say how many trades they rest on and hold back until
// there are enough.

export interface GroupStats {
  closed: number;
  wins: number;
  winRate: number | null;
  totalPnl: number;
  avgPnl: number | null;
  avgHoldDays: number | null;
}

export function groupStats(trades: OptionTrade[]): GroupStats {
  const closed = trades.filter((t) => t.pnl != null);
  const wins = closed.filter((t) => t.pnl! > 0).length;
  const totalPnl = closed.reduce((s, t) => s + t.pnl!, 0);
  const holds = closed.map((t) => t.holdDays!).filter((d) => d != null);
  return {
    closed: closed.length,
    wins,
    winRate: closed.length ? wins / closed.length : null,
    totalPnl,
    avgPnl: closed.length ? totalPnl / closed.length : null,
    avgHoldDays: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : null,
  };
}

/** Takeaways need at least this many closed trades on each side of a comparison. */
export const MIN_FOR_TAKEAWAY = 3;

const money = (x: number) => `${x < 0 ? "−" : "+"}$${Math.abs(Math.round(x)).toLocaleString("en-US")}`;
const record = (g: GroupStats) => `${g.wins} of ${g.closed} made money (${money(g.totalPnl)} total)`;

export function takeaways(trades: OptionTrade[], evals: Map<string, EntryEvaluation>): string[] {
  const out: string[] = [];
  const longCalls = trades.filter((t) => t.side === "long" && t.contract.type === "Call");
  const onDip = longCalls.filter((t) => evals.get(t.id)?.entry && evals.get(t.id)!.entry !== "none");
  const offDip = longCalls.filter((t) => evals.get(t.id)?.entry === "none");
  const dip = groupStats(onDip);
  const other = groupStats(offDip);

  if (dip.closed > 0 || other.closed > 0) {
    if (dip.closed >= MIN_FOR_TAKEAWAY && other.closed >= MIN_FOR_TAKEAWAY) {
      out.push(`Calls bought on a dip signal: ${record(dip)}. Other calls: ${record(other)}.`);
    } else if (dip.closed > 0) {
      out.push(`Calls bought on a dip signal so far: ${record(dip)}. Too few trades yet to compare with your other calls.`);
    } else {
      out.push(`None of your closed calls were bought on a dip signal yet, so there's nothing to compare against.`);
    }
  }

  const belowTrend = offDip.filter((t) => evals.get(t.id)?.aboveTrend === false);
  const bt = groupStats(belowTrend);
  if (bt.closed >= MIN_FOR_TAKEAWAY) {
    out.push(`${bt.closed} closed calls were bought while the stock was below its 200-day average: ${record(bt)}.`);
  }

  const exits = onDip.map((t) => evals.get(t.id)?.exit).filter(Boolean);
  const late = exits.filter((x) => x === "late").length;
  const early = exits.filter((x) => x === "early").length;
  if (exits.length >= MIN_FOR_TAKEAWAY) {
    if (late > exits.length / 2) out.push(`On dip trades you usually held past the plan's sell day (${late} of ${exits.length}).`);
    else if (early > exits.length / 2) out.push(`On dip trades you usually sold before the plan's sell day (${early} of ${exits.length}).`);
    else out.push(`On dip trades you mostly sold on the plan's day (${exits.length - late - early} of ${exits.length}).`);
  }

  const expired = longCalls.filter((t) => t.closeReason === "expired");
  if (expired.length > 0) {
    out.push(`${expired.length} call${expired.length === 1 ? "" : "s"} expired worthless (${money(expired.reduce((s, t) => s + (t.pnl ?? 0), 0))}).`);
  }

  const short = longCalls.filter((t) => t.pnl != null && t.daysToExpiryAtOpen < 21);
  const long = longCalls.filter((t) => t.pnl != null && t.daysToExpiryAtOpen >= 21);
  const s = groupStats(short);
  const l = groupStats(long);
  if (s.closed >= MIN_FOR_TAKEAWAY && l.closed >= MIN_FOR_TAKEAWAY) {
    out.push(`Calls under 3 weeks to expiry: ${record(s)}. 3+ weeks: ${record(l)}.`);
  }
  return out;
}
