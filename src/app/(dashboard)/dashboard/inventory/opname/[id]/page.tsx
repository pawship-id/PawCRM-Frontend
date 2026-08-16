import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { OpnameSheet } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Lembar opname · Buloo" };

export default async function OpnameSheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Stok Opname", href: "/dashboard/inventory/opname" },
            { label: "Lembar penghitungan" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-extrabold text-foreground">
          Lembar penghitungan
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Isi jumlah fisik hasil hitungan — tersimpan otomatis, jadi aman
          ditinggal dan dilanjutkan. Selisihnya dihitung ulang terhadap stok
          terbaru saat opname diselesaikan, sehingga penjualan yang terjadi
          selama penghitungan tidak ikut terhitung sebagai selisih.
        </p>
      </div>

      <RequirePermission feature="stockOpnames">
        <OpnameSheet opnameId={id} />
      </RequirePermission>
    </div>
  );
}
