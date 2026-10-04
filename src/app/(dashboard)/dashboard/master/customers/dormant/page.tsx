import type { Metadata } from "next";

import { Breadcrumb } from "@/components";
import { DormantCustomersScreen } from "@/features/customers";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Pelanggan tidak aktif · Buloo" };

/**
 * Rendered per request, not at build time — same reason as the Ringkasan tab
 * and Kas & Bank: `?days=` changes what this page's own searchParams resolve
 * to, and a cached render would keep answering with whichever window was
 * current the first time anybody opened this route.
 */
export const dynamic = "force-dynamic";

/**
 * Every customer whose last visit (or, lacking one, their registration) is
 * older than the chosen window.
 *
 * REACHED FROM THE RINGKASAN TAB'S CARD rather than from the sidebar, or from
 * `CustomerModuleHeader`'s tab row — the same placement decision
 * `negative-stock/page.tsx` makes and for the same reason: this is a drilled-
 * into report, not one of the module's own tabs, so it carries its own
 * breadcrumb and heading instead of borrowing the tabbed header (which
 * dropped its breadcrumb on 2 October 2026 for the opposite reason — see
 * `CustomerModuleHeader`'s own doc comment).
 *
 * `?days=` SEEDS THE WINDOW the Ringkasan panel was showing when "Lihat
 * semua" was clicked — see `customersQueryFromParams`'s sibling,
 * `DormantCustomersScreen`'s own query. Anything else, or nothing at all,
 * falls back to the screen's own default (60).
 *
 * `key={JSON.stringify(initialQuery)}` IS WHAT MAKES THE URL THE ONLY SOURCE
 * OF TRUTH (2 October 2026, fixing a bug report) — changing the window used
 * to update the screen's own React state directly AND write the URL
 * separately, two independent paths racing each other, so the table could
 * (and did) show the new window's rows while the address bar still read the
 * old one. Keying on the resolved query forces React to throw the whole
 * screen away and mount a fresh one the moment `?days=` actually changes —
 * see `DormantCustomersScreen`'s own doc comment for the other half of this.
 */
export default async function DormantCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.days) ? params.days[0] : params.days;
  const days = raw ? Number.parseInt(raw, 10) : NaN;
  const initialQuery = Number.isFinite(days) && days > 0 ? { days } : {};

  return (
    <RequirePermission feature="customers">
      <div className="flex flex-col gap-6">
        <div>
          <Breadcrumb
            items={[
              { label: "Pelanggan", href: "/dashboard/master/customers/ringkasan" },
              { label: "Pelanggan tidak aktif" },
            ]}
          />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Pelanggan tidak aktif
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Pelanggan yang sudah lama tidak bertransaksi, diurutkan dari yang
            paling lama tidak datang.
          </p>
        </div>

        <DormantCustomersScreen
          key={JSON.stringify(initialQuery)}
          initialQuery={initialQuery}
        />
      </div>
    </RequirePermission>
  );
}
