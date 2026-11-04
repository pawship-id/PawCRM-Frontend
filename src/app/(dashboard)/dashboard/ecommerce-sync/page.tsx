import type { Metadata } from "next";

import { EcommerceSummaryScreen } from "@/features/ecommerce";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "E-commerce · Penjualan · Buloo",
};

/**
 * Penjualan › E-commerce › Ringkasan. Keeps its own route: /dashboard/ecommerce-sync
 * predates Penjualan, is bookmarked, and is what the rail's `match` entry
 * points at. Pengikatan SKU and Pengaturan are routes under it.
 */
export default function EcommerceSyncPage() {
  return (
    <RequirePermission feature="ecommerce">
      <EcommerceSummaryScreen />
    </RequirePermission>
  );
}
