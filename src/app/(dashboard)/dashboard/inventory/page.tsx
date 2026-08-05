import type { Metadata } from "next";

import { InventoryHub } from "@/features/inventory";

export const metadata: Metadata = { title: "Inventory · PawShip" };

export default function InventoryPage() {
  return <InventoryHub />;
}
