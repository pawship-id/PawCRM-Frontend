"use client";

import { Alert, Pagination, Spinner } from "@/components";
import { cn } from "@/lib/utils";
import { formatMoney, toMinor } from "@/utils/decimal";

import { useSuppliers } from "../hooks/useSuppliers";
import { useSupplierSummaries } from "../hooks/useSupplierSummaries";
import { PurchasingModuleHeader } from "./PurchasingModuleHeader";
import { SuppliersTable } from "./SuppliersTable";
import { SuppliersToolbar } from "./SuppliersToolbar";

/**
 * The Purchasing → Supplier list. Owns the list query (useSuppliers) and the
 * cross-supplier totals (useSupplierSummaries), and wires the toolbar, table and
 * pager together. Row mutations call `refetch` on both, since deleting or
 * deactivating a vendor changes what is owed on this screen as well as which
 * rows show. Mirrors CustomersScreen.
 *
 * THE HEADER FIGURE IS THE WHOLE BOOK, not this page. It is summed server-side
 * across every unpaid invoice, so it does not move as the user pages — a total
 * that grew while paging would be worse than no total, because it looks
 * authoritative.
 */
export function SuppliersScreen() {
  const { suppliers, pagination, query, loading, error, setQuery, refetch } =
    useSuppliers();
  const summaries = useSupplierSummaries();

  const owedMinor = toMinor(summaries.totals.outstanding) ?? 0n;

  function handleChanged() {
    refetch();
    summaries.refetch();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* The headline figure rides in the header's action slot, which is where
          it already sat — beside the title, at the top right. */}
      <PurchasingModuleHeader
        action={
          <div className="flex items-baseline gap-3 max-sm:w-full max-sm:justify-between sm:block sm:text-right">
            <p className="text-xs font-medium tracking-wide text-muted uppercase">
              Total sisa utang
            </p>
            <p
              className={cn(
                "text-lg font-semibold tabular-nums",
                owedMinor > 0n && "text-danger",
              )}
            >
              {formatMoney(summaries.totals.outstanding)}
            </p>
          </div>
        }
      />

      {/* What the module header cannot say, because it is on every tab: what
          THIS list is. */}
      <p className="max-w-2xl text-sm text-muted">
        Data pemasok, termin pembayaran, dan sisa utang yang belum dibayar.
      </p>

      <SuppliersToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && suppliers.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat data supplier…
        </div>
      ) : (
        <>
          <SuppliersTable
            suppliers={suppliers}
            outstanding={summaries.outstanding}
            purchases={summaries.purchases}
            horizonDays={summaries.horizonDays}
            loading={loading}
            onChanged={handleChanged}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="supplier"
            unitPlural="supplier"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
