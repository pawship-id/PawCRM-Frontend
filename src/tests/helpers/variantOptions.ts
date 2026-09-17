import { invalidateVariantOptions } from "@/hooks/useVariantOptions";
import { invalidateZones } from "@/hooks/useZones";
import type { VariantOption, Zone } from "@/types/api";

/**
 * Opsi Varian cards and zones for a suite — what `useVariantOptions()` and
 * `useZones()` load. Both are app-wide caches, so priming mocks the services
 * AND drops the caches, or the previous test's list is what renders.
 *
 * Usage:
 *
 *   jest.mock("@/services/variantOption.service");
 *   jest.mock("@/services/zone.service");
 *   beforeEach(() => primeVariantOptions(variantOptionService.list, zoneService.list));
 */
export function makeVariantOption(
  overrides: Partial<VariantOption> & Pick<VariantOption, "_id" | "name" | "source" | "axisKey">,
): VariantOption {
  return {
    tenantId: "t1",
    nameKey: overrides.name.toLowerCase(),
    description: null,
    builtIn: false,
    values: [],
    sortOrder: 0,
    serviceCount: 0,
    deletedAt: null,
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

/** The three every tenant is seeded with. */
export const BUILT_IN_VARIANT_OPTIONS: VariantOption[] = [
  makeVariantOption({ _id: "vo-species", name: "Jenis Hewan", source: "species", axisKey: "petType", builtIn: true, sortOrder: 0 }),
  makeVariantOption({ _id: "vo-size", name: "Ukuran", source: "size", axisKey: "sizeCategory", builtIn: true, sortOrder: 1 }),
  makeVariantOption({ _id: "vo-fur", name: "Jenis Bulu", source: "furType", axisKey: "furType", builtIn: true, sortOrder: 2 }),
];

export function primeVariantOptions(
  listOptions: unknown,
  listZones: unknown,
  { cards = BUILT_IN_VARIANT_OPTIONS, zones = [] as Zone[] } = {},
) {
  (listOptions as jest.Mock).mockResolvedValue({ items: cards });
  (listZones as jest.Mock).mockResolvedValue({
    items: zones,
    pagination: { page: 1, limit: 100, total: zones.length, totalPages: 1 },
  });
  invalidateVariantOptions();
  invalidateZones();
}
