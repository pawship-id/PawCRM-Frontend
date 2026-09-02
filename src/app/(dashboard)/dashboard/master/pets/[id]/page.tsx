import type { Metadata } from "next";
import { PetProfileScreen } from "@/features/pets";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Profil hewan · Master Data · Buloo",
};

/**
 * The pet profile — PCR-044 / FR-5.
 *
 * IT USED TO BE THE EDIT FORM AND NOTHING ELSE, gated on `pets:update`. It is
 * gated on `read` now, because three of its four tabs are things to LOOK at: a
 * groomer who may not edit an animal still has to know it is allergic to
 * strawberry shampoo. Each tab that WRITES carries its own gate — the medical
 * file has a grant of its own (`pets:medical`), so a preference and an allergy
 * list are not the same permission.
 *
 * `params` is a Promise in this version of Next — awaited here so the screen
 * stays a client component that only receives the id.
 */
export default async function PetProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="pets" action="read">
      <PetProfileScreen petId={id} />
    </RequirePermission>
  );
}
