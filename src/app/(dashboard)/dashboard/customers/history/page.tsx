import type { Metadata } from "next";

import { CustomerHistoryScreen } from "@/features/customers";
import { CUSTOMER_TABS } from "@/features/customers/components/CustomerModuleHeader";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Riwayat · Pelanggan · Buloo",
};

/**
 * The Riwayat tab (25 October 2026) — every customer's services, purchases and
 * back-office invoices in one timeline. See CustomerHistoryScreen.
 */
export default function CustomerHistoryPage() {
  return (
    <RequirePermission feature="customerHistory" redirectTo={CUSTOMER_TABS}>
      <CustomerHistoryScreen />
    </RequirePermission>
  );
}
