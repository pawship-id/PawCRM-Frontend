import type { Metadata } from "next";

import { SupplierCategoriesScreen } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kategori Supplier · Buloo" };

export default function SupplierCategoriesPage() {
  return (
    <RequirePermission feature="supplierCategories">
      <SupplierCategoriesScreen />
    </RequirePermission>
  );
}
