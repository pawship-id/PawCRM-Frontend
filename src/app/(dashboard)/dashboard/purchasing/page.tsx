import type { Metadata } from "next";

import { PurchasingHub } from "@/features/purchasing";

export const metadata: Metadata = { title: "Purchasing · Buloo" };

export default function PurchasingPage() {
  return <PurchasingHub />;
}
