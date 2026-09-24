"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

import { FIELD_HEIGHT } from "@/components";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney, toDecimalString } from "@/utils/decimal";
import type { BookingLocation, Service } from "@/types/api";

import {
  digitsOnly,
  type DiscountMode,
  type PriceDraft,
  type PricedLine,
} from "../bookingCreateDraft";

/**
 * The pieces a booking form is built from — the customer's facts, the
 * "Harga dasar − Diskon = Efektif" row, the discount box and the Ringkasan
 * lines — from `buloo-booking-v2.html`.
 *
 * MOVED OUT OF `GroomingBookingCreateScreen` (21 September 2026) when
 * Antar-Jemput's booking form needed the same rows: BO asked for it to work
 * "persis grooming", and two copies of a price row are two places for the rule
 * about a typed price equal to the catalogue's to drift.
 */

/** Today on the shop's clock, as `<input type="date">` holds it. */
export function todayValue(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

/** The next half hour — most counter bookings are for later the same day. */
export function nextHalfHourValue(): string {
  const at = new Date();
  at.setSeconds(0, 0);
  at.setMinutes(at.getMinutes() <= 30 ? 30 : 60);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/** Wall-clock time in the browser's zone — the shop's. */
export function toScheduledAt(date: string, time: string): string | null {
  const at = new Date(`${date}T${time}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export const money = (minor: bigint) => formatMoney(toDecimalString(minor));

/** "150.000" for an input — whole rupiah, grouped the Indonesian way. */
export const grouped = (digits: string) =>
  digits === "" ? "" : Number(digits).toLocaleString("id-ID");

/** A quote's whole rupiah as digits — "150000.0000" → "150000". */
export const quoteDigits = (quote: bigint | null) =>
  quote === null ? "" : toDecimalString(quote).split(".")[0];

/** "10%" or "Rp 15.000" — how a discount was typed. */
export function discountWords(mode: DiscountMode, value: string): string {
  return mode === "percent" ? `${value}%` : formatMoney(value);
}

/** The one place a service may be done, or null when it goes either way. */
export function onlyAt(service: Service | null): BookingLocation | null {
  const at = service?.serviceLocations ?? [];
  return at.length === 1 ? at[0] : null;
}

export const badge = "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** One fact about the customer. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold wrap-break-word text-foreground">{children}</dd>
    </div>
  );
}

/** The animal's initial — a round shape, not a face. */
export function Initial({ name }: { name: string }) {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface text-sm font-bold text-primary"
    >
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function SummaryLine({
  label,
  detail,
  hint,
  value,
  tone = "main",
}: {
  label: string;
  /** A quieter second line under the label — the variant. */
  detail?: string;
  hint?: string;
  value: string;
  tone?: "main" | "sub" | "discount";
}) {
  return (
    <div className={`flex justify-between gap-3 ${tone === "discount" ? "py-0.5" : "py-1"}`}>
      <span
        className={
          /* A discount is small print under its line — 13px, the floor (§1.6). */
          tone === "discount"
            ? "pl-3 text-xs text-success"
            : tone === "sub"
              ? "pl-3 text-muted"
              : "text-foreground"
        }
      >
        {label}
        {detail && <span className="block text-xs text-muted">{detail}</span>}
        {hint && <span className="block text-xs text-warning">{hint}</span>}
      </span>
      <span
        className={`whitespace-nowrap tabular-nums ${
          tone === "discount"
            ? "text-xs font-semibold text-success"
            : tone === "sub"
              ? "text-muted"
              : "font-semibold"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/** A discount box with its Rp / % switch. Switching empties it, as the mockup does. */
export function DiscountInput({
  id,
  mode,
  value,
  disabled,
  onChange,
}: {
  id: string;
  mode: DiscountMode;
  value: string;
  disabled: boolean;
  onChange: (next: { mode: DiscountMode; value: string }) => void;
}) {
  return (
    <div className="flex">
      <Input
        id={id}
        inputMode="numeric"
        className={`${FIELD_HEIGHT} rounded-r-none text-right tabular-nums`}
        value={mode === "percent" ? value : grouped(value)}
        placeholder="0"
        disabled={disabled}
        onChange={(event) => {
          let next = digitsOnly(event.target.value);
          if (mode === "percent" && next !== "" && Number(next) > 100) next = "100";
          onChange({ mode, value: next });
        }}
      />
      <Button
        type="button"
        variant="secondary"
        className={`${FIELD_HEIGHT} min-w-12 rounded-l-none`}
        disabled={disabled}
        aria-label={mode === "percent" ? "Diskon dalam persen — ganti ke rupiah" : "Diskon dalam rupiah — ganti ke persen"}
        onClick={() => onChange({ mode: mode === "percent" ? "amount" : "percent", value: "" })}
      >
        {mode === "percent" ? "%" : "Rp"}
      </Button>
    </div>
  );
}

/**
 * "Harga dasar − Diskon = Efektif" for one line — the main service or an add-on.
 *
 * A TYPED PRICE EQUAL TO THE CATALOGUE'S IS STORED AS NONE, so the line keeps
 * following the catalogue and "Katalog Rp … · kembalikan" only shows when the two
 * really differ. Without `bookings:setPrice` it is the catalogue's price, read-only.
 */
export function PriceRow({
  name,
  line,
  draft,
  missing,
  note,
  inactive,
  mayPrice,
  disabled,
  onChange,
  onRemove,
}: {
  name: string;
  line: PricedLine;
  draft: PriceDraft;
  missing: ReactNode;
  /** A quiet line under the price — the zone it was quoted in. */
  note?: string | null;
  inactive: boolean;
  mayPrice: boolean;
  disabled: boolean;
  onChange: (next: PriceDraft) => void;
  onRemove?: () => void;
}) {
  const priceId = `price-${name}`.replace(/\s+/g, "-");
  const discountId = `discount-${name}`.replace(/\s+/g, "-");
  const overridden = line.price !== null && line.quote !== null && line.price !== line.quote;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-foreground">{name}</span>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Hapus ${name}`}
            disabled={disabled}
            onClick={onRemove}
          >
            <X className="size-4" aria-hidden />
          </Button>
        )}
      </div>

      {inactive ? (
        <p className="text-sm">
          <span className={`${badge} bg-tint-danger text-danger`}>Varian nonaktif</span>{" "}
          <span className="text-xs text-muted">Pilih layanan lain atau aktifkan variannya di katalog.</span>
        </p>
      ) : missing && line.price === null ? (
        <p className="text-sm font-semibold text-danger">{missing}</p>
      ) : !mayPrice ? (
        <p className="flex justify-between gap-3 text-sm">
          <span className="text-muted">Harga katalog</span>
          <span className="font-semibold tabular-nums">
            {line.price === null ? "—" : money(line.price)}
          </span>
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={priceId}>Harga dasar</Label>
              <Input
                id={priceId}
                inputMode="numeric"
                className={`${FIELD_HEIGHT} text-right tabular-nums`}
                value={grouped(draft.price === "" ? quoteDigits(line.quote) : draft.price)}
                disabled={disabled}
                onChange={(event) => {
                  const next = digitsOnly(event.target.value);
                  onChange({ ...draft, price: next === quoteDigits(line.quote) ? "" : next });
                }}
              />
            </div>
            <span aria-hidden className="hidden pb-3 text-center font-bold text-muted sm:block">
              −
            </span>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={discountId}>Diskon</Label>
              <DiscountInput
                id={discountId}
                mode={draft.discountMode}
                value={draft.discountValue}
                disabled={disabled}
                onChange={(next) =>
                  onChange({ ...draft, discountMode: next.mode, discountValue: next.value })
                }
              />
            </div>
            <div className="text-right sm:min-w-28">
              <span className="text-xs text-muted">Efektif</span>
              <p
                className={`text-base font-extrabold tabular-nums ${line.discount > 0n ? "text-success" : "text-foreground"}`}
              >
                {line.price === null ? "—" : money(line.net)}
              </p>
            </div>
          </div>
          {overridden && (
            <p className="mt-2 text-xs font-semibold text-warning">
              Katalog {money(line.quote!)} ·{" "}
              <button
                type="button"
                className="rounded underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                disabled={disabled}
                onClick={() => onChange({ ...draft, price: "" })}
              >
                kembalikan
              </button>
            </p>
          )}
        </>
      )}
      {note && line.price !== null && !inactive && (
        <p className="mt-2 text-xs text-muted tabular-nums">{note}</p>
      )}
    </div>
  );
}
