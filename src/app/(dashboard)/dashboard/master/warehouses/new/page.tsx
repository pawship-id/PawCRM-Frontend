import type { Metadata } from "next";

import { Card } from "@/components";
import { WarehouseCreateForm } from "@/features/warehouses";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "New warehouse · Master Data · PawShip",
};

export default function NewWarehousePage() {
  return (
    <RequirePermission feature="warehouses" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Create Warehouse
          </h1>
          <p className="mt-1 text-sm text-muted">
            Add a physical location stock is held at.
          </p>
        </div>

        <Card>
          <WarehouseCreateForm />
        </Card>
      </div>
    </RequirePermission>
  );
}
