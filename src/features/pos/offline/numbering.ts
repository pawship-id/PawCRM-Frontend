/**
 * THE TILL'S OWN SALE NUMBERS (POS offline mode, 19 October 2026).
 *
 * A registered device issues every number it prints, online or not —
 * "POS-BRT-K1-261019-0001" — and the server only CLAIMS it
 * (counterService.claimNumber). That only works if this file renders EXACTLY
 * what the server would: same prefix and padding (the tenant's overrides
 * included), same separator, and the same day — the SHOP's calendar day in its
 * own timezone, which is how documentNumbering.scopeFor buckets it.
 */
import { kvUpdate } from "./idb";

export interface NumberSeries {
  prefix: string;
  padding: number;
  reset: "never" | "yearly" | "monthly" | "daily";
  separator: string;
  timeZone: string;
}

export interface DeviceNumbering {
  series: NumberSeries;
  branchCode: string | null;
  deviceCode: string;
}

/** The calendar parts of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** The date bucket — "", "YYYY", "YYYY-MM" or "YYMMDD" — as the server cuts it. */
export function dateScope(reset: NumberSeries["reset"], date: Date, timeZone: string): string {
  if (reset === "never") return "";
  const { year, month, day } = zonedParts(date, timeZone);
  if (reset === "yearly") return year;
  if (reset === "monthly") return `${year}-${month}`;
  return `${year.slice(-2)}${month}${day}`;
}

/** The counter's bucket: branch code, device code, then the date. */
export function scopeOf(numbering: DeviceNumbering, date: Date): string {
  const { series, branchCode, deviceCode } = numbering;
  return [branchCode, deviceCode, dateScope(series.reset, date, series.timeZone)]
    .filter(Boolean)
    .join(series.separator);
}

export function formatNumber(numbering: DeviceNumbering, date: Date, sequence: number): string {
  const { series } = numbering;
  return [series.prefix, scopeOf(numbering, date), String(sequence).padStart(series.padding, "0")]
    .filter(Boolean)
    .join(series.separator);
}

interface CounterValue {
  seq: number;
}

/**
 * The next number for a sale paid at `date`, in one IndexedDB transaction so
 * two tabs cannot both take it. `floor` is the last sequence the SERVER has
 * recorded for this scope: a device whose storage was cleared resumes above
 * every number already synced instead of re-issuing one.
 */
export async function nextNumber(
  numbering: DeviceNumbering,
  date: Date,
  floor = 0,
): Promise<{ number: string; scope: string; sequence: number }> {
  const scope = scopeOf(numbering, date);
  const value = await kvUpdate<CounterValue>(`counter:${scope}`, (current) => ({
    seq: Math.max(current?.seq ?? 0, floor) + 1,
  }));
  return { number: formatNumber(numbering, date, value.seq), scope, sequence: value.seq };
}

/** Raises a scope's local counter to at least `seq` — after the server says so. */
export async function raiseCounter(scope: string, seq: number): Promise<void> {
  await kvUpdate<CounterValue>(`counter:${scope}`, (current) => ({
    seq: Math.max(current?.seq ?? 0, seq),
  }));
}
