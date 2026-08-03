import type { Metadata } from "next";

import { ProductsScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Produk & Varian · PawShip" };

export default function ProductsPage() {
  return (
    <RequirePermission feature="products">
      <ProductsScreen />
    </RequirePermission>
  );
}
