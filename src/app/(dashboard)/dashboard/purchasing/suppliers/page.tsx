import type { Metadata } from "next";

import { SuppliersScreen } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Supplier · Buloo" };

export default function SuppliersPage() {
  return (
    <RequirePermission feature="suppliers">
      <SuppliersScreen />
    </RequirePermission>
  );
}
