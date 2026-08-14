import type { Metadata } from "next";

import { InventoryHub } from "@/features/inventory";

export const metadata: Metadata = { title: "Inventory · Buloo" };

export default function InventoryPage() {
  return <InventoryHub />;
}
