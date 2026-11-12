"use client";

import { use } from "react";

import { Alert, Spinner } from "@/components";
import { RequirePermission } from "@/features/permissions";
import { PromoForm, usePromo } from "@/features/promos";

/**
 * Ubah promo. A CLIENT PAGE because the form is handed the current promo —
 * its `locked` flag decides whether items and prices may still change.
 */
export default function EditPromoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { promo, loading, error } = usePromo(id);

  return (
    <RequirePermission feature="promos" action="update">
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} />
        </div>
      ) : error || !promo ? (
        <Alert variant="error">{error ?? "Promo tidak ditemukan."}</Alert>
      ) : (
        <PromoForm promo={promo} />
      )}
    </RequirePermission>
  );
}
