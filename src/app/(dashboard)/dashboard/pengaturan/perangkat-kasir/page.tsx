import type { Metadata } from "next";

import { RequirePermission } from "@/features/permissions";
import { PosDevicesScreen } from "@/features/pos";

export const metadata: Metadata = { title: "Perangkat kasir · Pengaturan · Buloo" };

/** Gated on `posTransactions:read`, the grant GET /api/pos/devices enforces. */
export default function PosDevicesPage() {
  return (
    <RequirePermission feature="posTransactions" action="read">
      <PosDevicesScreen />
    </RequirePermission>
  );
}
