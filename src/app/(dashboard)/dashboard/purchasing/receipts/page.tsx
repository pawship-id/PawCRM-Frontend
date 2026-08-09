import type { Metadata } from "next";

import { ReceiptsScreen } from "@/features/purchasing";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Penerimaan Barang · PawShip" };

export default function ReceiptsPage() {
  return (
    <RequirePermission feature="goodsReceipts" action="read">
      <ReceiptsScreen />
    </RequirePermission>
  );
}
