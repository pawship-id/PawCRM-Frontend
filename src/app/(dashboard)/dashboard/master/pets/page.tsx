import type { Metadata } from "next";
import { PetsScreen } from "@/features/pets";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Hewan · Master Data · Buloo",
};

export default function MasterPetsPage() {
  return (
    <RequirePermission feature="pets">
      <PetsScreen />
    </RequirePermission>
  );
}
