import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { MyCommissionScreen } from "@/features/reports";

export const metadata: Metadata = { title: "Komisi saya · Buloo" };

/**
 * KOMISI SAYA — FR-6.
 *
 * NO `RequirePermission`, and that is deliberate — the only page in this app
 * without one. It answers about the signed-in person and nobody else: the server
 * reads the id from the SESSION, and the query has no parameter that could name
 * somebody different.
 *
 * Rekap Komisi beside it is the whole shop's payroll and is gated on
 * `users:read`. Requiring a grant HERE would mean handing a groomer the staff
 * register to be told what they themselves earned — which is the leak this page
 * exists to close.
 *
 * DECLARED UNDER "commissions/" rather than at the top level so the two live
 * together: somebody changing one should see the other.
 */
export default function MyCommissionPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Laporan", href: "/dashboard/reports" },
            { label: "Komisi saya" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Komisi saya
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Berapa yang Anda hasilkan per bulan, dan berapa yang belum dibayar.
          Hanya milik Anda sendiri.
        </p>
      </div>

      <MyCommissionScreen />
    </div>
  );
}
