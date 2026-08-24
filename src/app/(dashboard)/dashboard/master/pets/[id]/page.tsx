import type { Metadata } from "next";
import { PetForm } from "@/features/pets";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Ubah hewan · Master Data · Buloo",
};

/**
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
