import type { Metadata } from "next";

import { AccountingModuleHeader } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";
import { CommissionRecapScreen } from "@/features/reports";

export const metadata: Metadata = { title: "Komisi · Keuangan · Buloo" };

/**
 * The Komisi tab — the recap that used to live at /dashboard/reports/commissions
 * and still answers from there via a redirect.
 *
 * IT MOVED RATHER THAN BEING COPIED. The mockup files commissions under
 * Keuangan, and a tab pointing out of its own module would leave the reader on a
 * screen with no tab row and nothing marked in the rail. The SCREEN is unchanged
 * and the reports hub still links to it — only the address moved.
 *
 * GATED ON `users:read`, not on a report or finance grant. This IS payroll data:
 * it names every groomer and what they are owed. Whoever may read the staff
 * register may read it; a finance grant covering the ledger and wages alike
 * would hand a bookkeeper the payroll by accident.
 *
 * THE HEADER SITS OUTSIDE THE GATE so a refused reader still gets the module's
 * title and tabs — "not this tab" rather than a broken page. The header draws no
 * Komisi tab for them either; it gates each tab itself.
 */
export default function CommissionRecapPage() {
  return (
    <div className="flex flex-col gap-6">
      <AccountingModuleHeader />

      <RequirePermission feature="users" action="read">
        <CommissionRecapScreen />
      </RequirePermission>
    </div>
  );
}
