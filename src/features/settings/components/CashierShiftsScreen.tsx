"use client";

import { RotateCcw } from "lucide-react";

import {
  Alert,
  DataTable,
  FilterBar,
  FilterSelect,
  Pagination,
  withAll,
  type DataTableColumn,
  type FilterOption,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { dayKeyOf, todayIso } from "@/features/booking/day";
import { useBranchOptions } from "@/features/inventory/hooks/useBranchOptions";
import { usePermissions } from "@/features/permissions";
import type { PosShiftListItem, PosShiftStatus } from "@/types/api";
import { formatMoney } from "@/utils/decimal";

import { useCashierShifts } from "../hooks/useCashierShifts";
import { SettingsPageHeader } from "./SettingsHeader";

const STATUSES = withAll<PosShiftStatus | "">(
  [
    { value: "open", label: "Masih buka" },
    { value: "closed", label: "Ditutup" },
  ],
  "Semua status",
);

const WHEN = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const whenOf = (iso: string | null) => (iso ? WHEN.format(new Date(iso)) : "—");

/** Whole calendar days an open shift has been left open, 0 for today's. */
function daysOpen(shift: PosShiftListItem): number {
  if (shift.status !== "open") return 0;
  // Local days, so "since yesterday" means the shop's yesterday.
  const opened = new Date(`${dayKeyOf(shift.openedAt)}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  return Math.max(0, Math.round((today.getTime() - opened.getTime()) / 86_400_000));
}

function StatusBadge({ shift }: { shift: PosShiftListItem }) {
  if (shift.status === "closed") {
    return (
      <Badge variant="outline" className="border-transparent bg-tint-neutral text-muted">
        Ditutup
      </Badge>
    );
  }
  const days = daysOpen(shift);
  // A shift still open from an earlier day is the one somebody forgot.
  return days > 0 ? (
    <Badge variant="outline" className="border-transparent bg-tint-danger text-danger">
      Belum ditutup · {days} hari
    </Badge>
  ) : (
    <Badge variant="outline" className="border-transparent bg-tint-success text-success">
      Masih buka
    </Badge>
  );
}

const COLUMNS: DataTableColumn<PosShiftListItem>[] = [
  {
    id: "shiftNumber",
    header: "No. shift",
    cellClassName: "whitespace-nowrap font-medium text-foreground tabular-nums",
    cell: (shift) => shift.shiftNumber,
  },
  { id: "branch", header: "Cabang", cell: (shift) => shift.branchName ?? "—" },
  { id: "cashier", header: "Kasir", cell: (shift) => shift.cashierName ?? "—" },
  {
    id: "openedAt",
    header: "Dibuka",
    cellClassName: "whitespace-nowrap text-muted tabular-nums",
    cell: (shift) => whenOf(shift.openedAt),
  },
  {
    id: "closedAt",
    header: "Ditutup",
    cellClassName: "whitespace-nowrap text-muted tabular-nums",
    cell: (shift) => whenOf(shift.closedAt),
  },
  {
    id: "openingCash",
    header: "Kas awal",
    align: "right",
    cellClassName: "whitespace-nowrap tabular-nums",
    cell: (shift) => formatMoney(shift.openingCash),
  },
  {
    id: "difference",
    header: "Selisih kas",
    align: "right",
    cellClassName: "whitespace-nowrap tabular-nums",
    cell: (shift) => (shift.difference === null ? "—" : formatMoney(shift.difference)),
  },
  { id: "status", header: "Status", cell: (shift) => <StatusBadge shift={shift} /> },
];

/**
 * Pengaturan › Shift kasir — every cashier shift, opening on the ones still
 * open. READ-ONLY by decision (20 October 2026): a shift is closed only from
 * the till, by the cashier who opened it, so there are no row actions here.
 */
export function CashierShiftsScreen() {
  const { can } = usePermissions();
  const { branches } = useBranchOptions(can("branches", "read"));
  const { shifts, pagination, query, loading, error, setQuery, refetch } =
    useCashierShifts();

  const branchOptions = withAll<string>(
    branches.map((b): FilterOption<string> => ({ value: b._id, label: b.name })),
    "Semua cabang",
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsPageHeader
        tab="sistem"
        title="Shift kasir"
        description="Shift yang dibuka di kasir, terbaru di atas. Shift hanya bisa ditutup dari layar kasir oleh kasir yang membukanya."
      />

      <FilterBar
        actions={
          <Button variant="secondary" onClick={refetch}>
            <RotateCcw className="size-4" />
            Muat ulang
          </Button>
        }
      >
        <FilterSelect
          label="Status"
          ariaLabel="Filter status shift"
          value={query.status}
          options={STATUSES}
          onChange={(status) => setQuery({ status })}
        />
        {branches.length > 1 && (
          <FilterSelect
            label="Cabang"
            ariaLabel="Filter cabang"
            value={query.branchId}
            options={branchOptions}
            onChange={(branchId) => setQuery({ branchId })}
          />
        )}
      </FilterBar>

      {error && <Alert variant="error">{error}</Alert>}

      <DataTable
        columns={COLUMNS}
        rows={shifts}
        rowKey={(shift) => shift._id}
        loading={loading}
        loadingLabel="Memuat shift kasir…"
        empty={
          <p className="py-8 text-center text-sm text-muted">
            {query.status === "open"
              ? "Semua shift sudah ditutup."
              : "Belum ada shift yang cocok dengan filter ini."}
          </p>
        }
      />
      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        unit="shift"
        onPageChange={(page) => setQuery({ page })}
      />
    </div>
  );
}
