"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterSearch,
  FilterSelect,
  namedOptions,
  withAll,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";
import type { PurchaseReturnStatus } from "@/types/api";

import { useReceiptFilterOptions } from "../hooks/useReceiptFilterOptions";
import type { PurchaseReturnsQuery } from "../hooks/usePurchaseReturns";

/**
 * The purchase-return list controls: free-text search, supplier, warehouse,
 * status, a date range, and the way to the create screen.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * usePurchaseReturns. Mirrors ReceiptsToolbar.
 *
 * REUSES useReceiptFilterOptions rather than declaring its own. The two screens
 * filter by the same two things for the same reason, and that hook is already
 * deliberately UNFILTERED — a vendor deactivated last month still received
 * everything they received, and a filter that cannot name them cannot find their
 * returns either.
 *
 * THE SEARCH BOX PROMISES ONLY THE RETURN NUMBER, because that is the only field
 * the API matches. There is no `notes` on a return to search — a return explains
 * itself per line, in `items[].reason`, which the list does not carry. Naming a
 * field the server does not match is a bug report waiting to be filed.
 *
 * THE DATE RANGE BOUNDS `returnDate`, the day the goods physically went back —
 * never the day the row was keyed in. A collection the courier made on the 31st
 * and entered on the 2nd belongs to the 31st on every report, and that is the
 * date somebody reconciling a supplier's credit note is searching by.
 */
const STATUSES = withAll<PurchaseReturnStatus | "">(
  [
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Final" },
  ],
  "Semua status",
);

export function PurchaseReturnsToolbar({
  query,
  onChange,
}: {
  query: PurchaseReturnsQuery;
  onChange: (patch: Partial<PurchaseReturnsQuery>) => void;
}) {
  const { suppliers, warehouses } = useReceiptFilterOptions();

  return (
    <FilterBar
      search={
        <FilterSearch
          value={query.search}
          onChange={(search) => onChange({ search })}
          placeholder="Cari nomor retur"
          ariaLabel="Cari retur"
        />
      }
      actions={
        <Can feature="purchaseReturns" action="create">
          <Button asChild>
            <Link href="/dashboard/purchasing/returns/new">
              <Plus className="size-4" />
              Buat retur
            </Link>
          </Button>
        </Can>
      }
    >
      <FilterSelect
        label="Supplier"
        ariaLabel="Filter supplier"
        value={query.supplierId}
        options={withAll(namedOptions(suppliers), "Semua supplier")}
        onChange={(supplierId) => onChange({ supplierId })}
      />
      <FilterSelect
        label="Gudang"
        ariaLabel="Filter gudang"
        value={query.warehouseId}
        options={withAll(namedOptions(warehouses), "Semua gudang")}
        onChange={(warehouseId) => onChange({ warehouseId })}
      />
      <FilterSelect
        label="Status"
        ariaLabel="Filter status"
        value={query.status}
        options={STATUSES}
        onChange={(status) => onChange({ status })}
      />
      <FilterDateRange
        label="Tanggal retur"
        from={query.dateFrom}
        to={query.dateTo}
        onApply={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
      />
    </FilterBar>
  );
}
