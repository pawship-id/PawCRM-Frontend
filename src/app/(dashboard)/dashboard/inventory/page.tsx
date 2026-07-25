import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { InventoryIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Inventory · PawShip" };

export default function InventoryPage() {
  return (
    <SectionPlaceholder
      title="Inventory"
      description="Track stock levels for products, food and supplies."
      icon={InventoryIcon}
    />
  );
}
