"use client";

import Link from "next/link";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";

import { useSupplierOptions } from "../hooks/useSupplierOptions";
import type {
  PayablesView,
  PurchaseInvoicesQuery,
} from "../hooks/usePurchaseInvoices";

/** Radix Select forbids an empty item value, so "any supplier" needs a token. */
const ALL = "all";

/**
 * The view segmented control.
 *
 * ORDERED BY URGENCY, NOT BY THE ENUM. "Jatuh tempo" first because it is the
 * question somebody opens this screen at 9am to answer, then the planning view,
 * then the exact statuses, then everything. `unpaid`/`partial`/`paid` are the
 * API's statuses; the first two entries are its AP shorthands — both go over the
 * wire, neither is computed here.
 */
const VIEWS: Array<{ value: PayablesView; label: string; urgent?: boolean }> = [
  { value: "overdue", label: "Jatuh tempo", urgent: true },
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
 * usePurchaseInvoices. Mirrors ReceiptsToolbar, including the `ALL` sentinel.
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap rounded-lg bg-accent p-1">
          {VIEWS.map((view) => {
            const active = query.view === view.value;
            return (
              <button
                key={view.value}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ view: view.value })}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  active
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground",
                  view.urgent && !active && "text-danger/80 hover:text-danger",
                  view.urgent && active && "text-danger",
                )}
              >
                {view.label}
              </button>
            );
          })}
        </div>

        <Can feature="purchaseInvoices" action="create">
          <Button asChild>
            <Link href="/dashboard/purchasing/payables/new">
              <Plus className="size-4" />
              Catat faktur supplier
            </Link>
          </Button>
        </Can>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query.search}
            onChange={(event) => onChange({ search: event.target.value })}
            // Names exactly the two fields the API searches — a placeholder
            // promising a field the server does not match is a bug report
            // waiting to be filed.
            placeholder="Cari nomor faktur atau catatan"
            aria-label="Cari faktur"
            className="pl-9"
          />
        </div>

        <Select
          value={query.supplierId || ALL}
          onValueChange={(value) =>
            onChange({ supplierId: value === ALL ? "" : value })
          }
        >
          <SelectTrigger aria-label="Filter supplier" className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Semua supplier</SelectItem>
            {suppliers.map((supplier) => (
              <SelectItem key={supplier._id} value={supplier._id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label
          htmlFor="invoice-date-from"
          className="text-xs font-normal text-muted"
        >
          Tanggal faktur
        </Label>
        <Input
          id="invoice-date-from"
          type="date"
          value={query.dateFrom}
          onChange={(event) => onChange({ dateFrom: event.target.value })}
          aria-label="Tanggal faktur dari"
          className="w-40"
        />
        <span className="text-xs text-muted">s/d</span>
        <Input
          type="date"
          value={query.dateTo}
          onChange={(event) => onChange({ dateTo: event.target.value })}
          aria-label="Tanggal faktur sampai"
          className="w-40"
        />
        {(query.dateFrom || query.dateTo) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange({ dateFrom: "", dateTo: "" })}
          >
            Reset tanggal
          </Button>
        )}
      </div>
    </div>
  );
}
