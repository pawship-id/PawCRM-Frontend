import type { Metadata } from "next";

import { SkuBindingScreen } from "@/features/ecommerce";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Pengikatan SKU · E-commerce · Buloo",
};

export const dynamic = "force-dynamic";

/** `?store=` opens a given store — the cards on Ringkasan link here with it. */
export default async function EcommerceSkuPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string | string[] }>;
}) {
  const params = await searchParams;
  const store = Array.isArray(params.store) ? params.store[0] : params.store;

  return (
    <RequirePermission feature="ecommerce">
      <SkuBindingScreen key={store ?? ""} initialStoreId={store ?? null} />
    </RequirePermission>
  );
}
