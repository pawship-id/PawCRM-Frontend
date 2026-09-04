import type { Metadata } from "next";

import { WarehouseEditForm } from "@/features/warehouses";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Edit warehouse · Master Data · Buloo",
};

/**
 * Per-warehouse edit route. In Next 16 the `params` prop is a Promise, so this
 * is an async Server Component that awaits it and hands the id to the client
 * WarehouseEditForm (which owns the fetch + the edit sections). Mirrors the
 * branches per-id route. Wrapped in RequirePermission so a direct link without
 * `warehouses:update` shows access-denied rather than a form that cannot save.
 */
export default async function EditWarehousePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <RequirePermission feature="warehouses" action="update">
      <div className="flex flex-col gap-6">
        <WarehouseEditForm id={id} />
      </div>
    </RequirePermission>
  );
}
