"use client";

import { ScopeFilterCard } from "@/components";
import { Button } from "@/components/ui/button";
/**
 * PROMOTED TO `utils/date` (29 September 2026) when Pembelian's own scope card
 * needed the same phrase. Re-exported here because the tests and one import
 * still name this module — see ui-rules §14 on promotion.
 */
import { formatDateRange } from "@/utils/date";
import type { CustomerInvoiceFilterOptions } from "@/types/api";

import type { CustomerInvoicesQuery } from "../hooks/useCustomerInvoices";
import { toScopeWarehouses } from "./ReceivablesToolbar";

export { formatDateRange };

/**
 * The Faktur tab's scope row — the shared `ScopeFilterCard` (12 October 2026,
 * on request), so it is the same Cabang / Gudang / Periode row Ringkasan wears.
 *
 * ONE QUERY, TWO PLACES TO CHANGE IT. The row applies on its own; the Filter
 * panel holds the same three beside the fields the row has no room for. Both
 * read and write the same `query`, so whatever the panel applies shows here at
 * once, and the panel opens seeded with whatever was picked here.
 */
export function InvoiceScopeCard({
  query,
  options,
  filterCount,
  onChange,
  onReset,
}: {
  query: CustomerInvoicesQuery;
  options: CustomerInvoiceFilterOptions;
  /** How many filters narrow the list — see `countInvoiceFilters`. */
  filterCount: number;
  onChange: (patch: Partial<CustomerInvoicesQuery>) => void;
  /** Clears them all in one press. Nothing is drawn while none are on. */
  onReset: () => void;
}) {
  return (
    <ScopeFilterCard
      branches={options.branches}
      branchIds={query.branchIds}
      warehouses={toScopeWarehouses(options.warehouses)}
      warehouseIds={query.warehouseIds}
      onScopeChange={onChange}
      period={{
        value: query.period,
        /* Leaving Custom drops the typed dates: a named period carries its
           own, and stale ones would travel beside it. */
        onChange: (period) =>
          onChange(
            period === "custom"
              ? { period }
              : { period, dateFrom: "", dateTo: "" },
          ),
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        onDateRangeChange: ({ from, to }) =>
          onChange({ dateFrom: from, dateTo: to }),
        dateLabel: "Tanggal faktur",
      }}
      trailing={
        /*
          ONE WAY OUT OF A NARROWED LIST (16 September 2026, on request) — the
          same "Reset filter (n)" the grooming catalogue puts on its own
          context card. It counts every panel field, not only the three here.
        */
        filterCount > 0 ? (
          <Button
            type="button"
            variant="link"
            className="min-h-11 px-0"
            onClick={onReset}
          >
            Reset filter ({filterCount})
          </Button>
        ) : undefined
      }
    />
  );
}
