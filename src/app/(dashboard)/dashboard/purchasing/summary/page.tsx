import type { Metadata } from "next";

import { PurchasingHub } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";
import { PURCHASING_TABS } from "@/features/purchasing/components/PurchasingModuleHeader";

export const metadata: Metadata = { title: "Purchasing · Buloo" };

export default function PurchasingPage() {
  return (
    <RequirePermission feature="purchasingSummary" redirectTo={PURCHASING_TABS}>
      <PurchasingHub />
    </RequirePermission>
  );
}
