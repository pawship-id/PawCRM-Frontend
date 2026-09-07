"use client";

import Link from "next/link";

import { AXIS_LABEL } from "@/utils/serviceVariant";
import type { Pet, ServiceVariantAxis } from "@/types/api";

/**
 * "Lengkapi jenis bulu Cocoi →" — the way out of a price that cannot be worked
 * out yet.
 *
 * ─── A REFUSAL WITH NOWHERE TO GO IS A DEAD END ────────────────────────────
 *
 * A service priced by size cannot be quoted for an animal whose size nobody
 * recorded, and neither the booking form nor the till will guess one — a quote
 * is a promise, and one derived from a missing fact is a promise nobody made.
 * That leaves somebody holding a refusal about a field they cannot see, on a
 * screen that is not about the animal. This is the step after it.
 *
 * A NEW TAB, DELIBERATELY. Both callers are mid-act — a booking half filled in,
 * a basket half built — and navigating away to fix one field would throw that
 * away. The cashier fills in the coat, comes back to the tab that is still
 * open, and re-picks the animal.
 *
 * IT NAMES THE ANIMAL AND THE FIELD. "Lengkapi data hewan" sends somebody to a
 * form with fifteen boxes to hunt through; this says which one.
 *
 * ─── PROMOTED FROM `BookingPetGroupCard` ───────────────────────────────────
 *
 * It was a private helper there until the till's service picker became the
 * second screen that had to offer the same way out. Copying it would have been
 * the copy that drifts — the two would eventually name the same missing fact
 * with two different words, on two screens the same person uses in one sitting.
 */
export function PetFixLink({
  pet,
  axis,
}: {
  pet: Pet | null;
  /** Null when the price failed for a reason the animal cannot fix. */
  axis: ServiceVariantAxis | null;
}) {
  /* No animal chosen yet — there is nothing to link to, and saying so is the
     honest answer rather than a link that goes nowhere. */
  if (!pet) return <>Pilih hewannya dulu.</>;
  if (!axis) return null;

  return (
    <Link
      href={`/dashboard/master/pets/${pet._id}/edit`}
      className="underline underline-offset-2"
      target="_blank"
    >
      Lengkapi {AXIS_LABEL[axis]} {pet.name} →
    </Link>
  );
}
