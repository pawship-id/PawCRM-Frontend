import type { Metadata } from "next";

import { GroomingServicesScreen } from "@/features/grooming";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Layanan & Harga · Grooming · Buloo",
};

export default function GroomingCatalogPage() {
  return (
    <RequirePermission feature="services">
      <GroomingServicesScreen />
    </RequirePermission>
  );
}
