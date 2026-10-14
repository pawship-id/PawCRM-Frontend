import type { Metadata } from "next";

import { InventoryHub } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";
import { INVENTORY_PAGES } from "@/features/inventory/pages";

export const metadata: Metadata = { title: "Inventory · Buloo" };

export default function InventoryPage() {
  return (
    <RequirePermission feature="inventorySummary" redirectTo={INVENTORY_PAGES}>
      <InventoryHub />
    </RequirePermission>
  );
}
