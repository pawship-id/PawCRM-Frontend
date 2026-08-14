import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { ConsignmentScreen } from "@/features/reports";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Konsinyasi Outstanding · PawShip" };

/**
 * Gated on `productBatches:read`, matching
 * `GET /api/product-batches/consignment-summary` — NOT on `suppliers:read`. The
 * number describes stock and the supplier is only how it is grouped, so a role
 * that may see the vendor list but not the warehouse must not learn quantities
 * through this door.
 */
export default function ConsignmentPage() {
  return (
    <RequirePermission feature="productBatches" action="read">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Reports", href: "/dashboard/reports" },
              { label: "Konsinyasi Outstanding" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Konsinyasi Outstanding
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Barang titipan supplier yang masih ada di gudang, per supplier.
          </p>
        </div>

        <ConsignmentScreen />
      </div>
    </RequirePermission>
  );
}
