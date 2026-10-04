import type { Metadata } from "next";

import { Card } from "@/components";
import { WarehouseCreateForm } from "@/features/warehouses";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Gudang baru · Pengaturan · Buloo",
};

export default function NewWarehousePage() {
  return (
    <RequirePermission feature="warehouses" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            Gudang baru
          </h1>
          <p className="mt-1 text-sm text-muted">
            Tambah tempat stok disimpan.
          </p>
        </div>

        <Card>
          <WarehouseCreateForm />
        </Card>
      </div>
    </RequirePermission>
  );
}
