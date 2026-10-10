import type { PetOption } from "@/types/api";

/**
 * A pet's size, worked out from its weight — the same lookup the server makes
 * (`PetOptionService#resolveSizeForWeight`), so a form can show the answer
 * before it is saved. The server stays the authority: this only previews.
 *
 * NOTHING HERE NAMES AN ANIMAL OR A SIZE. What belongs to what is the tenant's
 * data — each size's own `speciesId` and `[minWeightKg, maxWeightKg)`.
 */

/** Sizes that state a weight range. Their presence is "this tenant works by weight". */
function rangedSizes(options: readonly PetOption[]): PetOption[] {
  return options.filter(
    (option) =>
      option.type === "size" &&
      option.deletedAt === null &&
      option.minWeightKg !== null &&
      option.minWeightKg !== undefined,
  );
}

/**
 * Whether sizes are decided by weight for this tenant. Until some size has a
 * range the form keeps asking for the size by hand, so nobody is locked out of
 * registering an animal while the ranges are being filled in.
 */
export function usesWeightSizes(options: readonly PetOption[]): boolean {
  return rangedSizes(options).length > 0;
}

/**
 * The size whose range holds `weightKg` for this animal: that animal's own
 * sizes first, then the ones filed under no animal. Lower bound included, upper
 * excluded; retired sizes are not offered. Null when nothing fits.
 */
export function sizeForWeight(
  options: readonly PetOption[],
  speciesId: string | null | undefined,
  weightKg: number | null | undefined,
): PetOption | null {
  if (weightKg === null || weightKg === undefined || Number.isNaN(weightKg)) {
    return null;
  }

  const fits = (size: PetOption) =>
    weightKg >= (size.minWeightKg as number) &&
    (size.maxWeightKg === null ||
      size.maxWeightKg === undefined ||
      weightKg < size.maxWeightKg);

  const live = rangedSizes(options).filter((size) => size.isActive);
  const own = speciesId
    ? live.find((size) => size.speciesId === speciesId && fits(size))
    : undefined;

  return own ?? live.find((size) => !size.speciesId && fits(size)) ?? null;
}
