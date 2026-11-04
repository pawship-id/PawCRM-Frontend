import type { Metadata } from "next";

import { StoreSettingsScreen } from "@/features/ecommerce";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Pengaturan · E-commerce · Buloo",
};

export const dynamic = "force-dynamic";

export default async function EcommerceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string | string[] }>;
}) {
  const params = await searchParams;
  const store = Array.isArray(params.store) ? params.store[0] : params.store;

  return (
    <RequirePermission feature="ecommerce">
      <StoreSettingsScreen key={store ?? ""} initialStoreId={store ?? null} />
    </RequirePermission>
  );
}
