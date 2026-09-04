import type { Metadata } from "next";

import { CommissionRecapScreen } from "@/features/reports";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Rekap Komisi · Buloo" };

/**
 * Rekap Komisi — PCR-045 / FR-6.
 *
 * GATED ON `users:read`, not on a report grant. This IS payroll data: it names
 * every groomer and what they are owed. Whoever may read the staff register may
 * read it; a "reports" grant covering stock on hand and wages alike would hand
 * somebody counting sacks of feed the payroll.
 */
export default function CommissionRecapPage() {
  return (
    <RequirePermission feature="users" action="read">
      <CommissionRecapScreen />
    </RequirePermission>
  );
}
