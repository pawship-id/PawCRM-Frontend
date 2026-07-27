import type { Metadata } from "next";
import { SectionPlaceholder } from "@/features/dashboard";
import { EcommerceSyncIcon } from "@/components/icons";

export const metadata: Metadata = { title: "E-commerce Sync · PawShip" };

export default function EcommerceSyncPage() {
  return (
    <SectionPlaceholder
      title="E-commerce Sync"
      description="Sync products, stock, and orders with online marketplaces."
      icon={EcommerceSyncIcon}
    />
  );
}
