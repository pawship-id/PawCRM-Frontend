import {
  BLANK_POINT,
  pinOf,
  resolvePoint,
  type PointDraft,
  type ResolvedPoint,
} from "@/features/antar-jemput/components/TripPointFields";
import { toMinor } from "@/utils/decimal";
import type { ZoneLookup } from "@/utils/zoneDistance";
import type { Branch, Customer, HomeVisitFees, TripPointInput } from "@/types/api";

/**
 * Where the groomer goes on a home-grooming booking (10 October 2026), without
 * React — shared by the grooming booking form and the generic booking form, so
 * the two never ask "where" or say "why not" differently.
 *
 * THE SERVER MEASURES AGAIN. These are the previews and the pre-flight checks
 * that stop a save the server would refuse in the same words.
 */

type CustomerEnd = Pick<Customer, "address" | "location">;
type BranchEnd = Pick<Branch, "address" | "location">;

/** Starts from the customer's stored address and pin — the common case needs no typing. */
export const DEFAULT_VISIT_DRAFT: PointDraft = { ...BLANK_POINT, source: "customer" };

/** What the visit address draft resolves to, given the customer on the form. */
export function visitPointOf(
  draft: PointDraft,
  customer: CustomerEnd | null,
  branch: BranchEnd | null,
): ResolvedPoint {
  return resolvePoint(draft, customer, branch);
}

/** The pin of the visit address, or null — what the zone is measured to. */
export function visitPinOf(point: ResolvedPoint) {
  return pinOf(point);
}

/** `visitAddress` as the API takes it, or null while there is no pin yet. */
export function visitInputOf(point: ResolvedPoint): TripPointInput | null {
  if (point.lat === null || point.lng === null) return null;

  return { address: point.address, lat: point.lat, lng: point.lng };
}

/** "7,2" — a distance as the shop reads it. */
export const kmWords = (km: number) => String(km).replace(".", ",");

/**
 * The visit fee this address comes to, in minor units, from the shop's
 * home-grooming settings (`GET /bookings/home-visit-fees`). Zero when the zone
 * cannot be told, the settings have not loaded, or the zone has no fee — a
 * preview says nothing rather than something wrong.
 */
export function visitFeeOf(
  zone: ZoneLookup,
  fees: HomeVisitFees | null,
  animals: number,
): bigint {
  if (!zone.ok || !fees) return 0n;

  const row = fees.fees.find((one) => one.zoneId === zone.zone._id);
  const each = toMinor(row?.fee ?? "0");
  if (each === null || each <= 0n) return 0n;

  return fees.unit === "per_pet" ? each * BigInt(Math.max(animals, 1)) : each;
}

/** The Indonesian refusal the server also sends for an address no zone holds. */
export function outsideZonesMessage(distanceKm: number): string {
  return `Alamat ini berada di luar jangkauan layanan home grooming (${kmWords(distanceKm)} km dari cabang). Pilih alamat lain atau ubah ke grooming di toko.`;
}

export const NO_PHONE_MESSAGE =
  "Nomor telepon pelanggan belum diisi — isi dulu di profil pelanggan.";

/**
 * Why a home booking cannot be saved yet, or null. In the order the form asks:
 * the phone, then the pin, then the zone.
 */
export function visitProblem({
  customer,
  point,
  zone,
}: {
  customer: Pick<Customer, "phone"> | null;
  point: ResolvedPoint;
  zone: ZoneLookup;
}): string | null {
  if (customer && !(customer.phone ?? "").trim()) return NO_PHONE_MESSAGE;
  if (!pinOf(point)) return "Titik alamat kunjungan belum dipilih.";
  if (zone.ok) return null;
  if (zone.reason === "branch_location_missing") {
    return "Koordinat cabang belum diisi, jadi zona kunjungan belum bisa dihitung.";
  }
  if (zone.reason === "outside_zones") return outsideZonesMessage(zone.distanceKm);

  return "Titik alamat kunjungan belum dipilih.";
}

/** The two ends of an address, compared by what is sent — to tell whether it moved. */
export function visitKeyOf(
  point: Pick<ResolvedPoint, "lat" | "lng" | "address"> | null | undefined,
): string {
  if (!point || point.lat == null || point.lng == null) return "";
  return `${point.lat},${point.lng}|${(point.address ?? "").trim()}`;
}
