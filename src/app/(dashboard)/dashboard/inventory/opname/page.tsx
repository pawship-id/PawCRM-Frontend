import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { OpnameScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Stok Opname · PawShip" };

export default function OpnamePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Stok Opname" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Stok Opname
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Hitung fisik lalu cocokkan dengan catatan sistem. Selisihnya jadi
          penyesuaian stok dan satu jurnal — kekurangan maupun kelebihan
          dibukukan ke akun penyesuaian persediaan, sengaja dipisah dari HPP
          supaya margin tetap terbaca.
        </p>
      </div>

      {/* The nav already hides this link from a role without the grant; this
          covers direct URL entry. Opening a count and discarding a draft carry
          their own checks inside — reading the list is a different privilege. */}
      <RequirePermission feature="stockOpnames">
        <OpnameScreen />
      </RequirePermission>
    </div>
  );
}
