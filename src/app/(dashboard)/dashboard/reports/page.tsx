import type { Metadata } from "next";

import { ReportsHub } from "@/features/reports";

export const metadata: Metadata = { title: "Reports · Buloo" };

/**
 * The reports index.
 *
 * NO `RequirePermission` HERE, unlike every other dashboard route, and that is
 * deliberate: the hub gates each CARD on the grant its own destination enforces,
 * so a user with only `products:read` sees the stock reports and not the
 * consignment one. Gating the page on a single feature would either hide it from
 * people who can read half of it, or show a page whose links all lead to 403s.
 *
 * The hub renders its own message when a role can reach none of them.
 */
export default function ReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Reports</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Laporan operasional yang siap dibaca, di-print, atau diekspor ke Excel.
        </p>
      </div>

      <ReportsHub />
    </div>
  );
}
