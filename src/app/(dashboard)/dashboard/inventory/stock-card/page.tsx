import { Suspense } from "react";
import type { Metadata } from "next";

import { Breadcrumb, Spinner } from "@/components";
import { StockCardScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kartu stok · PawShip" };

/**
 * What the prerendered HTML shows while the search-param-dependent screen
 * hydrates. A spinner rather than a skeleton of the filter bar: the wait is the
 * length of one hydration, and a skeleton that flashes into a different layout
 * is more distracting than a plain one.
 */
function StockCardFallback() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-16 text-sm text-muted">
      <Spinner /> Menyiapkan kartu stok…
    </div>
  );
}

export default function StockCardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Breadcrumb
          items={[
            { label: "Inventory", href: "/dashboard/inventory" },
            { label: "Kartu stok & batch" },
          ]}
        />
        <h1 className="mt-1 text-2xl font-semibold text-foreground">
          Kartu stok &amp; batch
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Riwayat setiap pergerakan barang, dan urutan lot mana yang keluar
          duluan. Keduanya berasal dari catatan yang sama.
        </p>
      </div>

      {/* The nav already hides this link from a role without the grant; this
          covers direct URL entry. The batch tab carries its own check — the two
          halves of the screen are two permissions. */}
      <RequirePermission feature="stockMovements">
        {/*
          SUSPENSE IS REQUIRED, not stylistic. `StockCardScreen` reads
          `?productId=&warehouseId=` through `useSearchParams` so a product
          detail can link straight into one pair's ledger — and a statically
          prerendered route that calls it without a boundary FAILS THE
          PRODUCTION BUILD.

          Worth stating because the failure hides: in development every route is
          rendered on demand, so `useSearchParams` never suspends and this works
          perfectly right up until `next build`.
        */}
        <Suspense fallback={<StockCardFallback />}>
          <StockCardScreen />
        </Suspense>
      </RequirePermission>
    </div>
  );
}
