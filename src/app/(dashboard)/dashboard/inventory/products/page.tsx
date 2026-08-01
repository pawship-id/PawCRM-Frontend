import type { Metadata } from "next";

import { ProductsScreen } from "@/features/inventory";

export const metadata: Metadata = { title: "Produk & Varian · PawShip" };

export default function ProductsPage() {
  return <ProductsScreen />;
}
