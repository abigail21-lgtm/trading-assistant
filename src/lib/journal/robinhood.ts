// Reads Robinhood's account activity CSV (Account -> Reports and statements
// -> Reports -> Generate, then Download CSV) and rebuilds options trades.
//
// Format, as documented by several import tools (Robinhood doesn't publish
// it): header "Activity Date","Process Date","Settle Date",["Account
// Type",]"Instrument","Description","Trans Code","Quantity","Price",
// "Amount"[,"Suppressed"]. Dates are M/D/YYYY; money is "$1,234.56" with
// negatives in parentheses, "($848.27)". Option descriptions look like
// "IWM 6/12/2026 Put $232.00" ("Option Expiration for ..." on OEXP rows).
// Rows are newest first; stock descriptions can span two lines (CUSIP on the
// second); a disclaimer paragraph follows the last row; expirations have no
// amount and a quantity like "2S".
//
// Parsing is lenient on purpose: anything unrecognised is counted and
// reported rather than failing the whole file.

export interface RhTransaction {
  /** ISO date, "2026-06-05". */
  date: string;
  code: string;
  instrument: string;
  description: string;
  quantity: number | null;
  price: number | null;
  amount: number | null;
}

export interface ParseResult {
  transactions: RhTransaction[];
  /** Rows skipped because they didn't look like a transaction (e.g. the disclaimer). */
  skippedRows: number;
  error: string | null;
}

/** RFC 4180-ish: quoted fields may contain commas, newlines and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** "$1,234.56" -> 1234.56, "($848.27)" -> -848.27, "" -> null. */
export function parseMoney(raw: string | undefined): number | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (t === "") return null;
  const negative = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()$,\s-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** "4" -> 4, "2S" -> 2, "0.810399" -> 0.810399. */
export function parseQuantity(raw: string | undefined): number | null {
  if (raw == null) return null;
  const m = raw.trim().match(/^-?\d*\.?\d+/);
  return m ? Math.abs(Number(m[0])) : null;
}

/** "6/05/2026" -> "2026-06-05"; null if not a date. */
export function parseDate(raw: string | undefined): string | null {
  const m = raw?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z]/g, "");
const HEADER_ALIASES: Record<string, string[]> = {
  date: ["activitydate", "date"],
  code: ["transcode", "type", "transactiontype"],
  instrument: ["instrument", "symbol"],
  description: ["description"],
  quantity: ["quantity", "qty"],
  price: ["price"],
  amount: ["amount", "netamount"],
};

export function parseRobinhoodCsv(text: string): ParseResult {
  const rows = parseCsv(text);
  const headerIndex = rows.findIndex((r) => {
    const names = r.map(norm);
    return names.includes("activitydate") && names.includes("transcode");
  });
  if (headerIndex < 0) {
    return {
      transactions: [],
      skippedRows: 0,
      error: "This doesn't look like a Robinhood activity report. It needs the “Activity Date” and “Trans Code” columns.",
    };
  }
  const header = rows[headerIndex].map(norm);
  const col: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    col[key] = header.findIndex((h) => aliases.includes(h));
  }
  const cell = (r: string[], key: string) => (col[key] >= 0 ? (r[col[key]] ?? "") : "");

  const transactions: RhTransaction[] = [];
  let skippedRows = 0;
  for (const r of rows.slice(headerIndex + 1)) {
    if (r.every((f) => f.trim() === "")) continue;
    const date = parseDate(cell(r, "date"));
    const code = cell(r, "code").trim();
    if (!date || !code) {
      skippedRows++; // disclaimer footer, notes, anything that isn't a transaction row
      continue;
    }
    transactions.push({
      date,
      code: code.toUpperCase(),
      instrument: cell(r, "instrument").trim().toUpperCase(),
      description: cell(r, "description").replace(/\s+/g, " ").trim(),
      quantity: parseQuantity(cell(r, "quantity")),
      price: parseMoney(cell(r, "price")),
      amount: parseMoney(cell(r, "amount")),
    });
  }
  return { transactions, skippedRows, error: null };
}

/** Stable identity for merging overlapping imports without double counting. */
export function transactionKey(t: RhTransaction): string {
  return [t.date, t.code, t.instrument, t.description, t.quantity, t.price, t.amount].join("|");
}

/**
 * Merges new transactions into existing ones. Identical rows inside one file
 * are real (two fills at the same price), so duplicates are only dropped up
 * to the count already stored.
 */
export function mergeTransactions(existing: RhTransaction[], incoming: RhTransaction[]): { merged: RhTransaction[]; added: number } {
  const have = new Map<string, number>();
  for (const t of existing) have.set(transactionKey(t), (have.get(transactionKey(t)) ?? 0) + 1);
  const seenInIncoming = new Map<string, number>();
  const added: RhTransaction[] = [];
  for (const t of incoming) {
    const k = transactionKey(t);
    const n = (seenInIncoming.get(k) ?? 0) + 1;
    seenInIncoming.set(k, n);
    if (n > (have.get(k) ?? 0)) added.push(t);
  }
  return { merged: [...existing, ...added], added: added.length };
}

// ---------- rebuilding options trades ----------

export interface OptionContract {
  underlying: string;
  /** ISO date. */
  expiry: string;
  type: "Call" | "Put";
  strike: number;
}

const OPTION_RE = /([A-Z][A-Z0-9.]*) (\d{1,2}\/\d{1,2}\/\d{4}) (Call|Put) \$([\d,]+(?:\.\d+)?)/;

export function parseOptionDescription(description: string): OptionContract | null {
  const m = description.match(OPTION_RE);
  if (!m) return null;
  return { underlying: m[1], expiry: parseDate(m[2])!, type: m[3] as "Call" | "Put", strike: Number(m[4].replace(/,/g, "")) };
}

export type CloseReason = "sold" | "bought-back" | "expired" | "exercised" | "assigned";

export interface OptionTrade {
  id: string;
  contract: OptionContract;
  side: "long" | "short";
  openDate: string;
  closeDate: string | null;
  /** Total contracts opened in this trade. */
  contracts: number;
  /** Dollars paid (long: premium; short: to buy back). Positive. */
  paid: number;
  /** Dollars received (long: sales; short: premium). Positive. */
  received: number;
  /** received - paid; null while open or when exercised/assigned (the result is in the shares). */
  pnl: number | null;
  pnlPct: number | null;
  holdDays: number | null;
  closeReason: CloseReason | null;
  /** Days from the first buy to expiry. */
  daysToExpiryAtOpen: number;
}

const OPEN_LONG = "BTO";
const CLOSE_LONG = "STC";
const OPEN_SHORT = "STO";
const CLOSE_SHORT = "BTC";
const EXPIRE = "OEXP";
const EXERCISE = "OEXER";
const ASSIGN = "OASGN";
export const OPTION_CODES = [OPEN_LONG, CLOSE_LONG, OPEN_SHORT, CLOSE_SHORT, EXPIRE, EXERCISE, ASSIGN];

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
const contractKey = (c: OptionContract) => `${c.underlying} ${c.expiry} ${c.type} ${c.strike}`;

/** Dollar value of a row: the amount when present, else price x quantity x 100. */
function dollars(t: RhTransaction): number {
  if (t.amount != null) return Math.abs(t.amount);
  if (t.price != null && t.quantity != null) return t.price * t.quantity * 100;
  return 0;
}

/**
 * One trade per contract per "cycle": from opening a position until it's
 * back to zero (sold, bought back, expired, exercised or assigned). Partial
 * sells and adds stay in the same trade.
 */
export function buildOptionTrades(transactions: RhTransaction[]): { trades: OptionTrade[]; otherCount: number } {
  // Rows arrive newest-first within a file; sort oldest-first, and within a
  // day put opens before closes (a same-day round trip has to open first).
  const order = (code: string) => (code === OPEN_LONG || code === OPEN_SHORT ? 0 : 1);
  const opts = transactions
    .map((t, i) => ({ t, i, c: OPTION_CODES.includes(t.code) ? parseOptionDescription(t.description) : null }))
    .filter((x): x is { t: RhTransaction; i: number; c: OptionContract } => x.c !== null)
    .sort((a, b) => a.t.date.localeCompare(b.t.date) || order(a.t.code) - order(b.t.code) || b.i - a.i);
  const otherCount = transactions.length - opts.length;

  const open = new Map<string, { trade: OptionTrade; position: number }>();
  const trades: OptionTrade[] = [];

  for (const { t, c } of opts) {
    const key = contractKey(c);
    const qty = t.quantity ?? 0;
    const current = open.get(key);

    if (t.code === OPEN_LONG || t.code === OPEN_SHORT) {
      const side = t.code === OPEN_LONG ? "long" : "short";
      if (current && current.trade.side === side) {
        current.position += qty;
        current.trade.contracts += qty;
        if (side === "long") current.trade.paid += dollars(t);
        else current.trade.received += dollars(t);
        continue;
      }
      const trade: OptionTrade = {
        id: `${key}|${t.date}|${trades.length}`,
        contract: c,
        side,
        openDate: t.date,
        closeDate: null,
        contracts: qty,
        paid: side === "long" ? dollars(t) : 0,
        received: side === "short" ? dollars(t) : 0,
        pnl: null,
        pnlPct: null,
        holdDays: null,
        closeReason: null,
        daysToExpiryAtOpen: days(t.date, c.expiry),
      };
      trades.push(trade);
      open.set(key, { trade, position: qty });
      continue;
    }

    if (!current) continue; // a close whose open is before this import's date range
    const { trade } = current;
    let reason: CloseReason;
    if (t.code === CLOSE_LONG) {
      trade.received += dollars(t);
      reason = "sold";
    } else if (t.code === CLOSE_SHORT) {
      trade.paid += dollars(t);
      reason = "bought-back";
    } else if (t.code === EXPIRE) reason = "expired";
    else if (t.code === EXERCISE) reason = "exercised";
    else reason = "assigned";
    current.position -= qty || current.position; // an expiry row without a quantity closes everything

    if (current.position <= 1e-9) {
      trade.closeDate = t.date;
      trade.closeReason = reason;
      trade.holdDays = days(trade.openDate, t.date);
      if (reason !== "exercised" && reason !== "assigned") {
        trade.pnl = trade.received - trade.paid;
        const basis = trade.side === "long" ? trade.paid : trade.received;
        trade.pnlPct = basis > 0 ? (trade.pnl / basis) * 100 : null;
      }
      open.delete(key);
    }
  }
  return { trades, otherCount };
}
