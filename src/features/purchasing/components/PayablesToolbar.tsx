"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import {
  FilterBar,
  FilterDateRange,
  FilterPills,
  FilterSearch,
  FilterSelect,
  namedOptions,
  withAll,
  type PillOption,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";

import { useSupplierOptions } from "../hooks/useSupplierOptions";
import type {
  PayablesView,
  PurchaseInvoicesQuery,
} from "../hooks/usePurchaseInvoices";

/**
 * The view lens.
 *
 * ORDERED BY URGENCY, NOT BY THE ENUM. "Jatuh tempo" first because it is the
 * question somebody opens this screen at 9am to answer, then what is about to
 * become that question, then the planning view, then the exact statuses, then
 * everything. `unpaid`/`partial`/`paid` are the API's statuses; the first three
 * entries are its AP shorthands — all of them go over the wire, none is computed
 * here.
 *
 * "Minggu ini" IS THE PAYMENT RUN, and it is the chip the hub's second panel
 * finally has a list behind: what falls due inside the server's horizon and is
 * not already late. Without it the only way to see that set was the hub's
 * five-row preview, because it is a window no date filter on this screen can
 * express — `Tanggal faktur` bounds when the vendor ISSUED the bill, never when
 * it comes due.
 *
 * Rendered as a pill row rather than the segmented control it used to be: a
 * small-cardinality lens that is the first thing anyone reaches for is what a
 * pill row is for (docs/ui-rules.md §8). `tone` carries the urgency the old
 * `urgent` flag did.
 */
const VIEWS: PillOption<PayablesView>[] = [
  { value: "overdue", label: "Jatuh tempo", tone: "danger" },
  { value: "dueSoon", label: "Minggu ini" },
  { value: "outstanding", label: "Belum lunas" },
  { value: "partial", label: "Sebagian" },
  { value: "paid", label: "Lunas" },
  { value: "all", label: "Semua" },
];

/**
 * The payables list controls: view, free-text search, supplier, an issue-date
 * range, and the way to file a new supplier bill.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * usePurchaseInvoices. Mirrors ReceiptsToolbar.
 *
 * THE DATE RANGE BOUNDS `invoiceDate` — the day the SUPPLIER issued the bill,
 * not when it was keyed in and not when it falls due. That is the date printed
 * on the document somebody is holding while they search, and it is what an AP
 * ageing report groups by. Lateness is the `Jatuh tempo` view's job, so the two
 * questions never share a control.
 *
 * NO "TAMPILKAN TERHAPUS" TOGGLE: no route deletes an invoice, so no invoice is
 * ever in a state to reveal.
 */
export function PayablesToolbar({
  query,
  onChange,
}: {
  query: PurchaseInvoicesQuery;
  onChange: (patch: Partial<PurchaseInvoicesQuery>) => void;
}) {
  const { suppliers } = useSupplierOptions();

  return (
    <div className="flex flex-col gap-3">
      {/* The lens sits outside the bar: it is one click, always applied, and
          never something you compose with the filters below it. */}
      <FilterPills
        ariaLabel="Tampilan faktur"
        value={query.view}
        options={VIEWS}
        onChange={(view) => onChange({ view })}
      />

      <FilterBar
        search={
          <FilterSearch
            value={query.search}
            onChange={(search) => onChange({ search })}
            // Names exactly the two fields the API searches — a placeholder
            // promising a field the server does not match is a bug report
            // waiting to be filed.
            placeholder="Cari nomor faktur atau catatan"
            ariaLabel="Cari faktur"
          />
        }
        actions={
          <Can feature="purchaseInvoices" action="create">
            <Button asChild>
              <Link href="/dashboard/purchasing/payables/new">
                <Plus className="size-4" />
                Catat faktur supplier
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
        <FilterDateRange
          label="Tanggal faktur"
          from={query.dateFrom}
          to={query.dateTo}
          onApply={({ from, to }) => onChange({ dateFrom: from, dateTo: to })}
        />
      </FilterBar>
    </div>
  );
}
