"use client";

import { Alert, Card } from "@/components";
import {
  TripPointFields,
  type PointDraft,
  type ResolvedPoint,
} from "@/features/antar-jemput/components/TripPointFields";
import { formatMoney, toDecimalString } from "@/utils/decimal";
import type { ZoneLookup } from "@/utils/zoneDistance";
import type { Branch, Customer, HomeVisitFees } from "@/types/api";

import {
  NO_PHONE_MESSAGE,
  kmWords,
  outsideZonesMessage,
  visitFeeOf,
} from "../visitAddress";

/**
 * "Alamat kunjungan" — where the groomer goes, on a home-grooming booking
 * (10 October 2026). One card for both booking forms.
 *
 * It asks the question with `TripPointFields`, the same control antar-jemput
 * uses, so a pin is typed or picked on a map in one way everywhere. It does
 * not own the answer: the form holds the draft, because the zone it resolves to
 * also prices the services and the fee line in the form's own summary.
 *
 * THE FEE IS A PREVIEW. The server measures branch -> pin again, adds the
 * "Biaya kunjungan" row itself and refuses an address outside every zone. The
 * row is never ticked, priced or removed from a form.
 */
export function VisitAddressCard({
  customer,
  branch,
  draft,
  point,
  zone,
  fees,
  animals,
  disabled,
  onChange,
  error,
  stored,
  lockedNote,
}: {
  customer: Pick<Customer, "name" | "address" | "location" | "phone"> | null;
  branch: Pick<Branch, "name" | "address" | "location"> | null;
  draft: PointDraft;
  point: ResolvedPoint;
  zone: ZoneLookup;
  /** The shop's home-grooming fees — null while loading. */
  fees: HomeVisitFees | null;
  animals: number;
  disabled: boolean;
  onChange: (next: PointDraft) => void;
  /** The server's refusal about the address — shown beside it. */
  error?: string | null;
  /** The fee row the server already added, read-only; replaces the preview. */
  stored?: { label: string; price: string } | null;
  /** Why the address cannot be touched any more, when it cannot. */
  lockedNote?: string | null;
}) {
  const hasPin = point.lat !== null && point.lng !== null;
  const noPhone = customer !== null && !(customer.phone ?? "").trim();
  const unit = fees?.unit ?? null;
  const fee = visitFeeOf(zone, fees, animals);

  return (
    <Card
      title="Alamat kunjungan"
      description="Alamat tempat groomer datang. Zona dan biaya kunjungan dihitung dari titiknya."
    >
      <div className="flex flex-col gap-3">
        {noPhone && <Alert variant="warning">{NO_PHONE_MESSAGE}</Alert>}

        {lockedNote && <Alert variant="info">{lockedNote}</Alert>}

        <TripPointFields
          label="Alamat dari"
          draft={draft}
          point={point}
          customer={customer}
          branch={branch}
          disabled={disabled || Boolean(lockedNote)}
          hideSources={["branch"]}
          onChange={onChange}
        />

        {error && (
          <p role="alert" className="text-xs font-semibold text-danger">
            {error}
          </p>
        )}

        {stored ? (
          <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-md bg-background px-3 py-2.5 text-sm">
            <span>{stored.label}</span>
            <span className="font-semibold tabular-nums">{formatMoney(stored.price)}</span>
          </div>
        ) : !hasPin ? (
          <p className="text-sm text-muted">
            Pilih titik alamat di peta — zona dan biaya kunjungan dihitung dari titik itu.
          </p>
        ) : zone.ok ? (
          <div className="flex flex-col gap-1 rounded-md bg-background px-3 py-2.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-muted">Zona</span>
              <span className="font-semibold tabular-nums">
                {zone.zone.name} · {kmWords(zone.distanceKm)} km
              </span>
            </div>
            {fee > 0n ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-muted">Biaya kunjungan</span>
                  <span className="font-semibold tabular-nums">
                    {formatMoney(toDecimalString(fee))}
                  </span>
                </div>
                {unit && (
                  <p className="text-xs text-muted">
                    {unit === "per_pet"
                      ? `Ditagih per hewan (${animals > 0 ? animals : 1} hewan).`
                      : "Ditagih sekali per kunjungan."}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-muted">Zona ini tanpa biaya kunjungan.</p>
            )}
          </div>
        ) : zone.reason === "outside_zones" ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {outsideZonesMessage(zone.distanceKm)}
          </p>
        ) : zone.reason === "branch_location_missing" ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            Koordinat cabang belum diisi, jadi zona kunjungan belum bisa dihitung.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
