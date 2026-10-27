import type { Metadata } from "next";

import { CustomerCreateForm } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = {
  title: "Pelanggan baru · Pelanggan · Buloo",
};

export default function NewCustomerPage() {
  return (
    <RequirePermission feature="customers" action="create">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            Pelanggan baru
          </h1>
          <p className="mt-1 text-sm text-muted">
            Daftarkan pemilik hewan, pembeli, atau klien baru.
          </p>
        </div>

        <CustomerCreateForm />
      </div>
    </RequirePermission>
  );
}
