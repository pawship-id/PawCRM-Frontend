import type { Metadata } from "next";

import { SupplierTypesScreen } from "@/features/settings";

export const metadata: Metadata = {
  title: "Tipe Supplier · Pengaturan · Buloo",
};

/**
 * UNGATED, unlike its neighbours, and for a reason rather than an oversight:
 * the page reads nothing. It explains what `beli_putus` and `konsinyasi` do to
 * the books, which is the same answer for every reader and no tenant's data.
 */
export default function SupplierTypesPage() {
  return <SupplierTypesScreen />;
}
