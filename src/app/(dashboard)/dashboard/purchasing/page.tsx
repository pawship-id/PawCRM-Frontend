import type { Metadata } from "next";

import { PurchasingHub } from "@/features/purchasing";

export const metadata: Metadata = { title: "Purchasing · PawShip" };

export default function PurchasingPage() {
  return <PurchasingHub />;
}
