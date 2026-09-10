import type { Metadata } from "next";
import { RefreshCw } from "lucide-react";

import { ModuleTabPlaceholder } from "@/features/dashboard";
import { SalesModuleHeader } from "@/features/sales";

export const metadata: Metadata = {
  title: "E-commerce · Penjualan · Buloo",
};

/**
 * The E-commerce tab — a placeholder since before this module had tabs, and it
 * keeps its own route: /dashboard/ecommerce-sync predates Penjualan, is
 * bookmarked, and is what the rail's `match` entry points at.
 *
 * IT WEARS THE MODULE HEADER NOW rather than `SectionPlaceholder`'s own heading,
 * which is what made it look like a section of its own. Its copy was also the
 * last English page in the rail (§12) and its icon came from the retired
 * `@/components/icons` set (§11); both are fixed here rather than left for a
 * sweep, since the file was being rewritten anyway.
 */
export default function EcommerceSyncPage() {
  return (
    <ModuleTabPlaceholder
      header={<SalesModuleHeader />}
      title="E-commerce"
      note="Sinkronisasi produk, stok, dan pesanan dengan marketplace. Untuk sekarang, pesanan dari marketplace dicatat manual sebagai faktur di tab Faktur."
      icon={RefreshCw}
    />
  );
}
