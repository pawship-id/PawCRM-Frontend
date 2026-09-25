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

/** The `_id` `makePetOption` gives an option — `petOptionId("species", "dog")`. */
export const petOptionId = (type: PetOptionType, code: string) =>
  `opt-${type}-${code.replace(/\s+/g, "-")}`;

/**
 * The four option fields of a Pet fixture, from the CODES a test reads.
 *
 * WHY A HELPER RATHER THAN TWELVE LINES PER FIXTURE. A pet stores an option's
 * `_id` since 25 September 2026, and the server sends the resolved `…Label` and
 * `…Code` beside it — twelve fields that must agree with each other, in every
 * suite that renders an animal. Written out by hand they drift: a fixture whose
 * `speciesLabel` says "Anjing" while `species` points at the cat would pass a
 * label assertion and misprice every variant in the same test.
 *
 * Call it with what a test actually cares about:
 *
 *   const bella = { ...base, ...petOptionFields({ species: "dog", size: "medium" }) };
 *
 * EVERY FIELD IS OPTIONAL, including species — most fixtures outside the pet
 * module are partial `as Pet` objects carrying only the one fact the test is
 * about (`{ _id, name, size: "small" }`), and forcing a species on them would
 * be noise in twenty suites. An omitted list resolves to null throughout.
 *
 * A CODE WITH NO SEEDED OPTION still gets an id and its own code back, with a
 * null label: a suite priming its own list ("kelinci", "xl") must be able to
 * build a pet wearing it.
 */
/** The codes a fixture is described by. Every list is optional — see below. */
interface PetOptionCodes {
  species?: string | null;
  breed?: string | null;
  size?: string | null;
  furType?: string | null;
}

/** What `petOptionFields` returns: the id, the word and the code, per list. */
interface PetOptionFields {
  species: string | null;
  speciesLabel: string | null;
  speciesCode: string | null;
  breed: string | null;
  breedLabel: string | null;
  breedCode: string | null;
  size: string | null;
  sizeLabel: string | null;
  sizeCode: string | null;
  furType: string | null;
  furTypeLabel: string | null;
  furTypeCode: string | null;
}

/*
  TWO SIGNATURES, so a full `Pet` fixture still typechecks. `Pet.species` is
  required and non-null; a partial `as Pet` fixture usually omits it. Naming a
  species narrows the result to match.
*/
export function petOptionFields(
  codes: PetOptionCodes & { species: string },
): PetOptionFields & { species: string };
export function petOptionFields(codes: PetOptionCodes): PetOptionFields;
export function petOptionFields(codes: PetOptionCodes): PetOptionFields {
  const types = ["species", "breed", "size", "furType"] as const;

  return Object.fromEntries(
    types.flatMap((type) => {
      const code = codes[type] ?? null;
      const found = code
        ? (PET_OPTION_FIXTURES.find(
            (option) => option.type === type && option.code === code,
          ) ?? null)
        : null;

      return [
        [type, code ? petOptionId(type, code) : null],
        [`${type}Label`, found?.label ?? null],
        [`${type}Code`, code],
      ];
    }),
  ) as unknown as PetOptionFields;
}

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
