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
import type { PurchaseReturnStatus } from "@/types/api";

import { useReceiptFilterOptions } from "../hooks/useReceiptFilterOptions";
import type { PurchaseReturnsQuery } from "../hooks/usePurchaseReturns";

/**
 * The purchase-return list controls: free-text search, supplier, warehouse,
 * status, a date range, and the way to the create screen.
 *
 * Purely presentational — it renders the current query and reports changes up to
 * usePurchaseReturns. Mirrors ReceiptsToolbar, down to the "all" sentinel, which
 * exists because Radix Select forbids an empty item value.
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
const ALL = "all";

const STATUSES: Array<{ value: PurchaseReturnStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Final" },
];

export function PurchaseReturnsToolbar({
  query,
  onChange,
}: {
  query: PurchaseReturnsQuery;
  onChange: (patch: Partial<PurchaseReturnsQuery>) => void;
}) {
  const { suppliers, warehouses } = useReceiptFilterOptions();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query.search}
              onChange={(event) => onChange({ search: event.target.value })}
              placeholder="Cari nomor retur"
              aria-label="Cari retur"
              className="pl-9"
            />
          </div>

          <Select
            value={query.supplierId || ALL}
            onValueChange={(value) =>
              onChange({ supplierId: value === ALL ? "" : value })
            }
          >
            <SelectTrigger aria-label="Filter supplier" className="sm:w-48">
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

          <Select
            value={query.warehouseId || ALL}
            onValueChange={(value) =>
              onChange({ warehouseId: value === ALL ? "" : value })
            }
          >
            <SelectTrigger aria-label="Filter gudang" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua gudang</SelectItem>
              {warehouses.map((warehouse) => (
                <SelectItem key={warehouse._id} value={warehouse._id}>
                  {warehouse.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={query.status === "" ? ALL : query.status}
            onValueChange={(value) =>
              onChange({
                status: value === ALL ? "" : (value as PurchaseReturnStatus),
              })
            }
          >
            <SelectTrigger aria-label="Filter status" className="sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Semua status</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Can feature="purchaseReturns" action="create">
          <Button asChild>
            <Link href="/dashboard/purchasing/returns/new">
              <Plus className="size-4" />
              Buat retur
            </Link>
          </Button>
        </Can>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Label
          htmlFor="return-date-from"
          className="text-xs font-normal text-muted"
        >
          Tanggal retur
        </Label>
        <Input
          id="return-date-from"
          type="date"
          value={query.dateFrom}
          onChange={(event) => onChange({ dateFrom: event.target.value })}
          aria-label="Tanggal retur dari"
          className="w-40"
        />
        <span className="text-xs text-muted">s/d</span>
        <Input
          type="date"
          value={query.dateTo}
          onChange={(event) => onChange({ dateTo: event.target.value })}
          aria-label="Tanggal retur sampai"
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
