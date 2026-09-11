import type { Metadata } from "next";
import { HandCoins } from "lucide-react";

import { ModuleTabPlaceholder } from "@/features/dashboard";
import { RequirePermission } from "@/features/permissions";
import { SalesModuleHeader } from "@/features/sales";

export const metadata: Metadata = {
  title: "Piutang · Penjualan · Buloo",
};

/**
 * The Piutang tab.
 *
 * GATED, unlike the module's other two placeholders. It has nothing on it yet,
 * but what it is ABOUT — who owes the shop money — is the same commercially
 * sensitive material the invoice list guards, and the tab is only offered to
 * whoever may read that list. A placeholder that named the collections lens to
 * somebody who cannot open it would be a small leak with no upside.
 *
 * WHAT IT IS WAITING FOR is not an endpoint but a decision: piutang is a LENS on
 * the Faktur tab today — its "Belum lunas" card drills the list to every unpaid
 * invoice — so a real screen here means an aging report the API cannot yet
 * produce. That is a product call, not a layout one.
 */
export default function ReceivablesTabPage() {
  return (
    <RequirePermission feature="customerInvoices" action="read">
      <ModuleTabPlaceholder
        header={<SalesModuleHeader />}
        title="Piutang"
        note="Umur piutang, rekap per pelanggan, dan riwayat penagihan. Untuk sekarang, klik kartu Belum lunas di tab Faktur — daftarnya langsung menampilkan semua faktur yang belum lunas."
        icon={HandCoins}
      />
    </RequirePermission>
  );
}
