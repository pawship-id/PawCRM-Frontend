"use client";

import { use } from "react";

import { Alert } from "@/components";
import { RequirePermission } from "@/features/permissions";
import { PromoForm } from "@/features/promos";
import { AVAILABLE_PROMO_TYPES, type PromoType } from "@/types/promo";

/**
 * Buat promo — `?type=coret`. V1 builds Harga coret only; any other type the
 * dialog marks "Menyusul" is refused here too rather than opening a coret form
 * under its name.
 */
export default function NewPromoPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type = "coret" } = use(searchParams);
  const available = AVAILABLE_PROMO_TYPES.includes(type as PromoType);

  return (
    <RequirePermission feature="promos" action="create">
      {available ? (
        <PromoForm />
      ) : (
        <Alert variant="error">Jenis promo ini belum tersedia. Saat ini baru Harga coret.</Alert>
      )}
    </RequirePermission>
  );
}
