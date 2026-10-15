import type { Metadata } from "next";

import { ProductsScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";
import { INVENTORY_TAB } from "@/features/inventory/pages";

export const metadata: Metadata = { title: "Produk & Varian · Buloo" };

export default function ProductsPage() {
  return (
    <RequirePermission
      feature="products"
      redirectTo={[INVENTORY_TAB.categories]}
    >
      <ProductsScreen />
    </RequirePermission>
  );
}
