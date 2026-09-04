import type { Metadata } from "next";

import { PetCardPrintScreen } from "@/features/pets";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kartu Hewan · Buloo" };

/**
 * KARTU PROFIL HEWAN — kriteria 5.12, the sheet handed to the groomer.
 *
 * A PAGE, NOT A DIALOG, for the reason the invoice print page gives: printing is
 * a task people come back to. The printer was out of paper; the card got wet;
 * the next groomer needs their own copy. A dialog cannot be linked to or opened
 * in a second tab, and it forces somebody to find the animal again first.
 *
 * GATED ON `pets:read` — NOT on `pets:medical`, and the difference is deliberate.
 * The card carries allergies and medication, which is exactly what the medical
 * grant protects on screen. But the person who needs this sheet is the groomer
 * holding the dog, and a grant that kept the medical file out of their hands
 * would also keep the allergy off the cage door. The shop decides who may EDIT
 * the medical file; everybody who may look up an animal may be told not to use
 * the shampoo that hurts it.
 *
 * `params` IS A PROMISE in this version of Next — see AGENTS.md.
 */
export default async function PetCardPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="pets" action="read">
      <PetCardPrintScreen petId={id} />
    </RequirePermission>
  );
}
