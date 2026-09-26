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

/**
 * The `_id` `makePetOption` gives an option — `petOptionId("species", "Anjing")`.
 *
 * A `function`, NOT a `const` arrow: `makePetOption` calls it and the seeded
 * fixtures below run at module scope, so an arrow declared after them is in the
 * temporal dead zone by the time the first one is built.
 */
export function petOptionId(type: PetOptionType, label: string): string {
  return `opt-${type}-${label.replace(/\s+/g, "-").toLowerCase()}`;
}

/**
 * An option's `_id` is DERIVED FROM ITS LABEL here, so a suite can name one
 * without holding a table of generated ids — `petOptionId("size", "Sedang")`.
 * Nothing in the app derives an id; this is a fixture convenience.
 */
export function makePetOption(
  overrides: Partial<PetOption> & Pick<PetOption, "type" | "label">,
): PetOption {
  return {
    _id: petOptionId(overrides.type, overrides.label),
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

const seeded = (type: PetOptionType, labels: string[]) =>
  labels.map((label, sortOrder) => makePetOption({ type, label, sortOrder }));

/** Exactly what a new tenant is seeded with — DEFAULT_PET_OPTIONS on the server. */
export const PET_OPTION_FIXTURES: PetOption[] = [
  ...seeded("species", ["Kucing", "Anjing"]),
  ...seeded("breed", ["Domestic", "Poodle"]),
  ...seeded("size", ["Kecil", "Sedang", "Besar"]),
  ...seeded("furType", ["Bulu panjang", "Bulu pendek"]),
];


/**
 * The four option fields of a Pet fixture, from the LABELS a test reads.
 *
 * WHY A HELPER RATHER THAN EIGHT LINES PER FIXTURE. A pet stores an option's
 * `_id` and the server sends the resolved `…Label` beside it — eight fields
 * that must agree with each other, in every suite that renders an animal.
 * Written out by hand they drift: a fixture whose `speciesLabel` says "Anjing"
 * while `species` points at the cat would pass a label assertion and misprice
 * every variant in the same test.
 *
 * IT TOOK CODES UNTIL 25 SEPTEMBER 2026 and produced a `…Code` for each list
 * too. Options have no code now, so a test names one by the only word there is.
 *
 * Call it with what a test actually cares about:
 *
 *   const bella = { ...base, ...petOptionFields({ species: "Anjing", size: "Sedang" }) };
 *
 * EVERY FIELD IS OPTIONAL, including species — most fixtures outside the pet
 * module are partial `as Pet` objects carrying only the one fact the test is
 * about, and forcing a species on them would be noise in twenty suites. An
 * omitted list resolves to null throughout.
 *
 * A LABEL WITH NO SEEDED OPTION still gets an id and its own word back: a suite
 * priming its own list ("Kelinci", "XL") must be able to build a pet wearing it.
 */
/** The labels a fixture is described by. Every list is optional — see below. */
interface PetOptionLabels {
  species?: string | null;
  breed?: string | null;
  size?: string | null;
  furType?: string | null;
}

/** What `petOptionFields` returns: the id and the word, per list. */
interface PetOptionFields {
  species: string | null;
  speciesLabel: string | null;
  breed: string | null;
  breedLabel: string | null;
  size: string | null;
  sizeLabel: string | null;
  furType: string | null;
  furTypeLabel: string | null;
}

/*
  TWO SIGNATURES, so a full `Pet` fixture still typechecks. `Pet.species` is
  required and non-null; a partial `as Pet` fixture usually omits it. Naming a
  species narrows the result to match.
*/
export function petOptionFields(
  labels: PetOptionLabels & { species: string },
): PetOptionFields & { species: string };
export function petOptionFields(labels: PetOptionLabels): PetOptionFields;
export function petOptionFields(labels: PetOptionLabels): PetOptionFields {
  const types = ["species", "breed", "size", "furType"] as const;

  return Object.fromEntries(
    types.flatMap((type) => {
      const label = labels[type] ?? null;

      return [
        [type, label ? petOptionId(type, label) : null],
        [`${type}Label`, label],
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
