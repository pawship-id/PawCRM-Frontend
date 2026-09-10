import type { Metadata } from "next";
import { PetForm } from "@/features/pets";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Hewan baru · Pelanggan · Buloo",
};

export default function NewPetPage() {
  return (
    <RequirePermission feature="pets" action="create">
      <PetForm />
    </RequirePermission>
  );
}
