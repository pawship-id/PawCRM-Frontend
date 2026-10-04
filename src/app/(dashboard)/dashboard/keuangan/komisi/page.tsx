import type { Metadata } from "next";

import { CommissionScreen } from "@/features/commissions";
import { AccountingModuleHeader } from "@/features/accounting";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Komisi · Keuangan · Buloo" };

/** `now` is read per request — the context bar's presets are dates. */
export const dynamic = "force-dynamic";

/**
 * The Komisi tab — one row per booking × groomer, from the BO mockup
 * (`buloo-keuangan-komisi.html`, 21 September 2026). It replaced the monthly
 * per-groomer recap and its Tutup bulan: accrual was dropped, commission is an
 * expense when it is paid, and it is paid only once somebody has approved it.
 *
 * GATED ON `users:read`, not on a report or finance grant. This IS payroll data:
 * it names every groomer and what they are owed. Approving and paying need
 * `journalEntries:create` on top, checked on each control and again by the API.
 *
 * THE HEADER SITS OUTSIDE THE GATE so a refused reader still gets the module's
 * title and tabs — "not this tab" rather than a broken page.
 */
export default function CommissionPage() {
  return (
    <div className="flex flex-col gap-6">
      <AccountingModuleHeader />

      <RequirePermission feature="users" action="read">
        <CommissionScreen now={new Date().toISOString()} />
      </RequirePermission>
    </div>
  );
}
