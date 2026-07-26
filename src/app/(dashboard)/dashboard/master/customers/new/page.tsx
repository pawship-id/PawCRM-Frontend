import type { Metadata } from "next";

import { Card } from "@/components";
import { CustomerCreateForm } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "New customer · Master Data · PawShip",
};

export default function NewCustomerPage() {
  return (
    <RequirePermission feature="customers" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Create Customer
          </h1>
          <p className="mt-1 text-sm text-muted">
            Add a new pet owner, buyer or client.
          </p>
        </div>

        <Card>
          <CustomerCreateForm />
        </Card>
      </div>
    </RequirePermission>
  );
}
