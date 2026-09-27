import type { Metadata } from "next";

import { CustomerSummaryScreen } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Ringkasan · Pelanggan · Buloo",
};

/**
 * The Ringkasan tab — the module's front page (27 September 2026).
 *
 * GATED ON `customers:read`, unlike the two placeholder tabs beside it: this one
 * reads real customers and their till history, so it is a screen with something
 * to protect. See CustomerSummaryScreen for what it draws and why.
 */
export default function CustomerSummaryPage() {
  return (
    <RequirePermission feature="customers">
      <CustomerSummaryScreen />
    </RequirePermission>
  );
}
