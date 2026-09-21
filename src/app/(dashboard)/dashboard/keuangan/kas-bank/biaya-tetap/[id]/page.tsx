"use client";

import { use } from "react";

import { Alert, Spinner } from "@/components";
import { FixedCostDetail } from "@/features/fixed-costs";
import { useFixedCost } from "@/features/fixed-costs";
import { RequirePermission } from "@/features/permissions";

/**
 * One fixed cost.
 *
 * A CLIENT PAGE, unlike the list's server one: the actions on it — Jeda, Hapus,
 * Catat — all write and then re-read, so the document has to live in state the
 * page can refresh. `params` is a Promise in this version of Next; see AGENTS.md.
 */
export default function FixedCostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <RequirePermission feature="fixedCosts" action="read">
      <FixedCostPageBody id={id} />
    </RequirePermission>
  );
}

function FixedCostPageBody({ id }: { id: string }) {
  const { fixedCost, loading, error } = useFixedCost(id);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
        <Spinner /> Memuat biaya tetap…
      </div>
    );
  }

  if (error || !fixedCost) {
    return <Alert variant="error">{error ?? "Biaya tetap tidak ditemukan."}</Alert>;
  }

  return <FixedCostDetail fixedCost={fixedCost} />;
}
