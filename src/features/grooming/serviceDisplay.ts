import {
  buildVariantCombos,
  servicePriceBounds,
} from "@/features/services";
import type {
  Branch,
  Service,
  ServiceLocation,
  ServiceVariantAxis,
} from "@/types/api";

import { formatMoneyShort } from "./board";

/**
 * How a service is SAID on the Layanan & Harga table and on its detail page —
 * one file, so the row and the page a click away never describe one service two
 * ways.
 */

/** Where somebody who wants to change a service is sent: the one editor. */
export function serviceEditPath(serviceId: string): string {
  return `/dashboard/master/layanan/${serviceId}`;
}

export type ServicePlace = "store" | "home" | "both";

/** An old service has no locations stored — it was a shop service. */
export function placeOf(locations: ServiceLocation[] | undefined): ServicePlace {
  const list = locations ?? [];
  const home = list.includes("in_home");
  const store = list.length === 0 || list.includes("in_store");

  if (home && store) return "both";
  return home ? "home" : "store";
}

/** The table's badge. */
export const PLACE_SHORT: Record<ServicePlace, string> = {
  store: "Di toko",
  home: "Di rumah",
  both: "Keduanya",
};

/** The detail page's sentence. */
export const PLACE_LONG: Record<ServicePlace, string> = {
  store: "Di toko saja",
  home: "Di rumah pelanggan saja",
  both: "Di toko dan di rumah pelanggan",
};

export const AXIS_LABELS: Record<ServiceVariantAxis, string> = {
  petType: "Jenis hewan",
  sizeCategory: "Ukuran",
  furType: "Jenis bulu",
};

/** "Ukuran × Jenis bulu" — the axes a service's price depends on. */
export function axesLabel(service: Pick<Service, "variantAxes">): string {
  return (service.variantAxes ?? []).map((axis) => AXIS_LABELS[axis]).join(" × ");
}

/**
 * Deleted wins over inactive when both are true: a record that should not exist
 * is a more urgent thing to say than one that is merely no longer sold.
 *
 * NO PORTAL BADGE. The mockup's "Portal" / "Internal" needs a publish flag the
 * catalogue does not have; a badge that always read "Internal" would be a word
 * with nothing behind it.
 */
export function statusOf(
  service: Pick<Service, "deletedAt" | "isActive">,
): { label: string; className: string } {
  if (service.deletedAt !== null) {
    return { label: "Terhapus", className: "bg-tint-neutral text-muted" };
  }
  return service.isActive
    ? { label: "Aktif", className: "bg-tint-success text-success" }
    : { label: "Nonaktif", className: "bg-tint-neutral text-muted" };
}

export interface VariantRow {
  key: string;
  label: string;
  /** The stored decimal string, or null for a combination nobody priced. */
  price: string | null;
}

/**
 * Every combination the service's axes allow, with the price stored for it.
 *
 * GENERATED FROM THE AXES, not read off `variants`, so a combination nobody
 * priced still shows up — as a gap — instead of silently not existing. The form
 * refuses to save a gap today; a service priced before it did may have one.
 */
export function variantRows(
  service: Pick<Service, "variantAxes" | "variants">,
): VariantRow[] {
  const axes = service.variantAxes ?? [];

  return buildVariantCombos(axes).map((combo) => {
    const match = (service.variants ?? []).find((variant) =>
      axes.every((axis) => variant[axis] === combo[axis]),
    );

    return { key: combo.key, label: combo.label, price: match?.price ?? null };
  });
}

/**
 * "6 / 6" — combinations priced out of combinations possible.
 *
 * NOT THE MOCKUP'S "active / total": a variant here has no on/off of its own,
 * so the honest fraction is how much of the grid carries a price.
 */
export function variantCoverage(
  service: Pick<Service, "variantAxes" | "variants">,
): { priced: number; possible: number } {
  const rows = variantRows(service);

  return {
    priced: rows.filter((row) => row.price !== null).length,
    possible: rows.length,
  };
}

/** "Rp 89 rb – Rp 249 rb", or one amount, or "—" with no price at all. */
export function priceRangeShort(
  service: Pick<Service, "hasVariants" | "price" | "variants">,
): string {
  const bounds = servicePriceBounds(service);
  if (!bounds) return "—";

  const low = formatMoneyShort(bounds.low);
  const high = formatMoneyShort(bounds.high);

  return low === high ? low : `${low} – ${high}`;
}

/**
 * Each tahapan with its share of the commission — the stored weight, or `null`
 * when the weights are empty and the share is an even split.
 */
export function sessionShares(
  service: Pick<Service, "sessions" | "sessionWeights">,
): { name: string; weight: number | null }[] {
  const sessions = service.sessions ?? [];
  const weights = service.sessionWeights ?? [];
  const weighted = weights.length > 0 && weights.length === sessions.length;

  return sessions.map((name, index) => ({
    name,
    weight: weighted ? weights[index] : null,
  }));
}

/** "Barat, Timur" when every name is known, "2 cabang" when not. */
export function branchesText(
  service: Pick<Service, "allBranches" | "branchIds">,
  branches: Branch[] | null,
): string {
  if (service.allBranches) return "Semua cabang";

  const ids = service.branchIds ?? [];
  const names = (branches ?? [])
    .filter((branch) => ids.includes(branch._id))
    .map((branch) => branch.name);

  return names.length > 0 && names.length === ids.length
    ? names.join(", ")
    : `${ids.length} cabang`;
}

/**
 * The detail page's "Yang perlu dilengkapi" — only what the data can actually
 * show is missing. `addons` is null while the add-ons are unknown, and then says
 * nothing about them rather than guessing.
 */
export function missingPieces(
  service: Service,
  addons: Service[] | null,
): string[] {
  const missing: string[] = [];

  if (service.durationMin === null) {
    missing.push("Durasi belum diisi — kalender menebak setengah jam untuk layanan ini.");
  }
  if (service.serviceType === "main" && (service.sessions ?? []).length === 0) {
    missing.push("Belum ada tahapan.");
  }
  if (service.hasVariants) {
    const { priced, possible } = variantCoverage(service);
    if (possible > priced) {
      missing.push(`${possible - priced} kombinasi varian belum diberi harga.`);
    }
  }
  if (addons) {
    const retired = addons.filter(
      (addon) => addon.deletedAt !== null || !addon.isActive,
    ).length;
    if (retired > 0) {
      missing.push(`${retired} add-on terpasang sudah nonaktif atau terhapus.`);
    }
  }

  return missing;
}
