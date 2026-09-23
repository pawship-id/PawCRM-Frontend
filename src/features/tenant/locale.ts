import {
  CURRENCIES,
  FISCAL_YEAR_START_MONTHS,
  TIMEZONES,
  type FiscalYearStartMonth,
  type Timezone,
} from "@/types/api";

/**
 * Words for the tenant's locale preferences — timezone, currency, date format
 * and fiscal year start (23 September 2026). Shared by the identity form and
 * its read-only summary on Pengaturan › Umum, so neither drifts from the other.
 */

/** "Asia/Jakarta (WIB)" — the IANA zone plus the abbreviation Indonesians say. */
const TIMEZONE_LABELS: Record<Timezone, string> = {
  "Asia/Jakarta": "Asia/Jakarta (WIB)",
  "Asia/Makassar": "Asia/Makassar (WITA)",
  "Asia/Jayapura": "Asia/Jayapura (WIT)",
};

export const TIMEZONE_OPTIONS = TIMEZONES.map((value) => ({
  value,
  label: TIMEZONE_LABELS[value],
}));

/**
 * A zone this app does not have a label for is shown verbatim rather than
 * dropped — the enum only started being enforced on 23 September 2026, so a
 * tenant written earlier could in principle carry something else.
 */
export function timezoneLabel(value: string): string {
  return TIMEZONE_LABELS[value as Timezone] ?? value;
}

/**
 * Only one currency exists today. A single-option picker rather than a plain
 * value, so the field reads the same way its neighbours do and is ready the
 * day a second currency is real.
 */
export const CURRENCY_OPTIONS = CURRENCIES.map((value) => ({
  value,
  label: "Rupiah (IDR)",
}));

export function currencyLabel(value: string): string {
  return (
    CURRENCY_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

/** "Januari – Desember" — the twelve months starting from the given month. */
const FISCAL_YEAR_LABELS: Record<FiscalYearStartMonth, string> = {
  1: "Januari – Desember",
  4: "April – Maret",
  7: "Juli – Juni",
};

export const FISCAL_YEAR_OPTIONS = FISCAL_YEAR_START_MONTHS.map((value) => ({
  value: String(value),
  label: FISCAL_YEAR_LABELS[value],
}));

/** A start month outside the three offered is named by its number, not hidden. */
export function fiscalYearLabel(value: number): string {
  return (
    FISCAL_YEAR_LABELS[value as FiscalYearStartMonth] ?? `Bulan ke-${value}`
  );
}
