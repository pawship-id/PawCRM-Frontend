import type { Metadata } from "next";
import { PetForm } from "@/features/pets";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Ubah hewan · Master Data · Buloo",
};

/**
 * Editing an animal's own details.
 *
 * A ROUTE OF ITS OWN since FR-5. It used to be the pet's landing page, which
 * meant "look at this animal" and "change this animal" were one screen gated on
 * `update` — so a groomer who may not edit could not read the allergy list
 * either. The profile is the landing page now; this is where a change is made.
 *
 * `params` is a Promise in this version of Next — awaited here so the form stays
 * a client component that only receives the id.
 */
export default async function EditPetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="pets" action="update">
      <PetForm petId={id} />
    </RequirePermission>
  );
}
