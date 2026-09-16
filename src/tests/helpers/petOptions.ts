import { invalidatePetOptions } from "@/hooks/usePetOptions";
import type { PetOption, PetOptionType } from "@/types/api";

/**
 * Pet options for a suite — the species, breeds, sizes and coats `usePetOptions`
 * loads from GET /api/pet-options.
 *
 * WHY A HELPER. The hook keeps ONE app-wide cache, so a suite that renders a
 * pet picker needs two things every time: the service mocked to return a list,
 * and the cache dropped so the previous test's list is not what renders. Doing
 * either by hand in twenty suites is how one of them forgets the second.
 *
 * Usage:
 *
 *   jest.mock("@/services/petOption.service");
 *   beforeEach(() => primePetOptions(petOptionService.list));
 */

export function makePetOption(
  overrides: Partial<PetOption> & Pick<PetOption, "type" | "code" | "label">,
): PetOption {
  return {
    _id: `opt-${overrides.type}-${overrides.code.replace(/\s+/g, "-")}`,
    tenantId: "t1",
    sortOrder: 0,
    isActive: true,
    createdBy: null,
    deletedAt: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

const seeded = (type: PetOptionType, rows: Array<[string, string]>) =>
  rows.map(([code, label], sortOrder) =>
    makePetOption({ type, code, label, sortOrder }),
  );

/** Exactly what a new tenant is seeded with — DEFAULT_PET_OPTIONS on the server. */
export const PET_OPTION_FIXTURES: PetOption[] = [
  ...seeded("species", [
    ["cat", "Kucing"],
    ["dog", "Anjing"],
  ]),
  ...seeded("breed", [
    ["domestic", "Domestic"],
    ["poodle", "Poodle"],
  ]),
  ...seeded("size", [
    ["small", "Kecil"],
    ["medium", "Sedang"],
    ["large", "Besar"],
  ]),
  ...seeded("furType", [
    ["long hair", "Bulu panjang"],
    ["short hair", "Bulu pendek"],
  ]),
];

/**
 * Points a mocked `petOptionService.list` at `options` and drops the shared
 * cache, so the next `usePetOptions()` consumer loads exactly these.
 */
export function primePetOptions(
  list: unknown,
  options: PetOption[] = PET_OPTION_FIXTURES,
) {
  (list as jest.Mock).mockResolvedValue({
    items: options,
    pagination: { page: 1, limit: 100, total: options.length, totalPages: 1 },
  });
  invalidatePetOptions();
}
