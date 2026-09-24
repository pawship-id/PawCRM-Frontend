"use client";

import { FilterSelect, TextareaField, TextField } from "@/components";
import type { Branch, Customer, GeoLocation, TripLeg, TripPoint } from "@/types/api";

import { customerEndOf } from "../ride";

/**
 * ─── THE TWO ENDS OF A JOURNEY, WHEREVER ONE IS ASKED FOR ──────────────────
 *
 * Written for `AntarJemputBookingForm` on 23 September 2026 and lifted out of
 * it on 24 September, when the till started selling rides too. A cashier and a
 * receptionist are agreeing the SAME journey, and two copies of "where does the
 * van go" is how the two screens come to ask it differently — one offering the
 * branch's address, the other not; one demanding a pin, the other saving an
 * address that no fare can be measured from.
 *
 * The state lives with the caller (`PointDraft`), because the two screens
 * default it differently: the diary keeps a draft per direction, the till one
 * per line in the basket.
 */

/** Mirrors TRIP_ADDRESS_MAX_LENGTH in trip.schema.js. */
export const ADDRESS_MAX_LENGTH = 300;

/**
 * Where an end came from. "map" — the Google Places picker — is offered and
 * disabled: it is the reason `location` is a subdocument on the server, and it
 * lands here without a change to the shape.
 */
export type PointSource = "customer" | "branch" | "manual" | "map";

export interface PointDraft {
  source: PointSource;
  address: string;
  lat: string;
  lng: string;
}

export const BLANK_POINT: PointDraft = {
  source: "manual",
  address: "",
  lat: "",
  lng: "",
};

export const POINT_SOURCES: {
  value: PointSource;
  label: string;
  disabled?: boolean;
}[] = [
  { value: "customer", label: "Alamat pelanggan" },
  { value: "branch", label: "Alamat cabang" },
  { value: "manual", label: "Ketik manual" },
  { value: "map", label: "Pilih dari peta (segera)", disabled: true },
];

/** A number a person typed, or null when they have not typed one yet. */
export function coordOf(typed: string): number | null {
  const value = Number(typed);
  return typed.trim() !== "" && Number.isFinite(value) ? value : null;
}

export interface ResolvedPoint {
  address: string | null;
  lat: number | null;
  lng: number | null;
}

/** What an end actually resolves to — the record it points at, or what was typed. */
export function resolvePoint(
  draft: PointDraft,
  customer: Pick<Customer, "address" | "location"> | null,
  branch: Pick<Branch, "address" | "location"> | null,
): ResolvedPoint {
  if (draft.source === "customer") {
    return {
      address: customer?.address ?? null,
      lat: customer?.location?.lat ?? null,
      lng: customer?.location?.lng ?? null,
    };
  }

  if (draft.source === "branch") {
    return {
      address: branch?.address ?? null,
      lat: branch?.location?.lat ?? null,
      lng: branch?.location?.lng ?? null,
    };
  }

  return {
    address: draft.address.trim() || null,
    lat: coordOf(draft.lat),
    lng: coordOf(draft.lng),
  };
}

/** A saved end, back in the form as typed values — every end stays editable. */
export function storedDraft(point: TripPoint | null | undefined): PointDraft {
  return {
    source: "manual",
    address: point?.address ?? "",
    lat: point?.lat == null ? "" : String(point.lat),
    lng: point?.lng == null ? "" : String(point.lng),
  };
}

/** An end's pin, or null when it has none — a fare is a band of distance. */
export function pinOf(
  point: ResolvedPoint,
): Pick<GeoLocation, "lat" | "lng"> | null {
  return point.lat !== null && point.lng !== null
    ? { lat: point.lat, lng: point.lng }
    : null;
}

/** One journey's two ends, as a screen holds them while they are being typed. */
export interface LegPoints {
  origin: PointDraft;
  destination: PointDraft;
}

/**
 * The ends a direction fills in by itself: a pickup starts at the customer's
 * door, a delivery finishes there. Both stay editable — a van may start at
 * another branch or at a groomer's house (23 September 2026), which is why the
 * booking stores both rather than inferring one.
 */
export function defaultDrafts(leg: TripLeg): LegPoints {
  const customerFirst = customerEndOf(leg) === "origin";

  return {
    origin: { ...BLANK_POINT, source: customerFirst ? "customer" : "branch" },
    destination: { ...BLANK_POINT, source: customerFirst ? "branch" : "customer" },
  };
}

export interface ResolvedLeg {
  origin: ResolvedPoint;
  destination: ResolvedPoint;
}

export function resolveLeg(
  leg: LegPoints,
  customer: Pick<Customer, "address" | "location"> | null,
  branch: Pick<Branch, "address" | "location"> | null,
): ResolvedLeg {
  return {
    origin: resolvePoint(leg.origin, customer, branch),
    destination: resolvePoint(leg.destination, customer, branch),
  };
}

/**
 * ONE END OF THE TRIP — where it is, and where that came from.
 *
 * The two registers a shop already keeps (the customer's address and the
 * branch's) are offered before the keyboard, because they carry a pin somebody
 * has already checked. Typing one means typing its coordinates too: the fare
 * is measured between the ends, so an address with no point has no price.
 */
export function TripPointFields({
  label,
  draft,
  point,
  customer,
  branch,
  disabled,
  onChange,
}: {
  label: string;
  draft: PointDraft;
  point: ResolvedPoint;
  customer: Pick<Customer, "name" | "address" | "location"> | null;
  branch: Pick<Branch, "name" | "address" | "location"> | null;
  disabled: boolean;
  onChange: (next: PointDraft) => void;
}) {
  const typed = draft.source === "manual";
  const missingPin = point.lat === null || point.lng === null;
  const from =
    draft.source === "customer"
      ? (customer?.name ?? "pelanggan")
      : (branch?.name ?? "cabang");

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4">
      <FilterSelect
        layout="form"
        label={label}
        ariaLabel={`Sumber ${label.toLowerCase()}`}
        value={draft.source}
        onChange={(next) => onChange({ ...draft, source: next as PointSource })}
        options={POINT_SOURCES}
        active={false}
        placeholder="Pilih sumber alamat"
        disabled={disabled}
      />

      {typed ? (
        <>
          <TextareaField
            label="Alamat"
            name={`${label}-address`}
            value={draft.address}
            onChange={(event) => onChange({ ...draft, address: event.target.value })}
            maxLength={ADDRESS_MAX_LENGTH}
            rows={2}
            placeholder="Nama jalan, nomor, patokan"
            disabled={disabled}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label="Latitude"
              name={`${label}-lat`}
              value={draft.lat}
              onChange={(event) => onChange({ ...draft, lat: event.target.value })}
              placeholder="-6.2088"
              disabled={disabled}
              required
            />
            <TextField
              label="Longitude"
              name={`${label}-lng`}
              value={draft.lng}
              onChange={(event) => onChange({ ...draft, lng: event.target.value })}
              placeholder="106.8456"
              disabled={disabled}
              required
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-foreground">
            {point.address ?? "Belum ada alamat tersimpan"}
          </p>
          <p className="text-xs text-muted">
            Dari data {from}.{" "}
            {missingPin
              ? "Titik lokasinya belum ada — pilih Ketik manual, atau lengkapi di data itu."
              : `Titik: ${point.lat}, ${point.lng}`}
          </p>
        </div>
      )}

      {missingPin && (
        <p className="text-xs font-semibold text-danger" role="alert">
          Titik lokasi wajib diisi.
        </p>
      )}
    </div>
  );
}
