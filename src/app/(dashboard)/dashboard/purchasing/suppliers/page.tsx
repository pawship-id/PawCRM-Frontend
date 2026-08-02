import type { Metadata } from "next";

import { SuppliersScreen } from "@/features/purchasing";

export const metadata: Metadata = { title: "Supplier · PawShip" };

export default function SuppliersPage() {
  return <SuppliersScreen />;
}
