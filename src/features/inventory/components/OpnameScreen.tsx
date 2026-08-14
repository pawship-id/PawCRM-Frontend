"use client";

import { useState } from "react";
import Link from "next/link";

import { Alert, ConfirmDialog, Pagination, Spinner } from "@/components";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { stockOpnameService } from "@/services/stockOpname.service";
import type { Opname } from "@/types/inventory";
import { formatMoney, toMinor } from "@/utils/decimal";
import { exportToXlsx, type XlsxColumn } from "@/utils/xlsx";

import { useCatalogLookups } from "../hooks/useCatalogLookups";
import {
  EMPTY_OPNAME_FILTERS,
  useOpnames,
  type OpnameFilters,
} from "../hooks/useOpnames";
import { OpnameStartCard } from "./OpnameStartCard";
import { OpnameStatusBadge } from "./OpnameStatusBadge";
import { OpnameToolbar } from "./OpnameToolbar";

/**
 * The stock-count list: sheets in progress, and sheets already final.
 *
 * WHY A SHEET RATHER THAN A ROW-BY-ROW EDIT. Counting a warehouse takes an
 * afternoon and sales keep happening while it runs. Adjusting each product as
 * you go would write a movement per shelf, so a customer buying the item you
 * just counted would look like a second discrepancy. A sheet stays a draft —
 * moving nothing — until somebody accepts the whole count at once, which is what
 * makes it safe to start in the morning and finish after lunch.
 *
 * THE PROGRESS COLUMN IS THE POINT OF THIS SCREEN. `12 / 40` is the difference
 * between a finished stock take and an abandoned one, and it is only honest
 * because the API tracks which lines were actually visited — a sheet where every
 * line still holds the system quantity is indistinguishable from a completed one
 * that happened to agree, and submitting the first believing it was the second
 * silently certifies shelves nobody looked at.
 */
/**
 * The exported columns, in the order a printed count history is read.
 *
 * `selisih nilai` IS TYPED AS A NUMBER and the sign is preserved. A shrinkage is
 * negative, and an export that rendered it as text — or worse, as an absolute
 * value with the direction moved into another column — is one nobody can sum to
 * "what did counting cost us this quarter", which is the question the file
 * exists to answer.
 *
 * `opnameDate` is the date the shelves were walked, not the row's `createdAt`.
 * Those differ whenever a count is entered the morning after, and the shelf date
 * is the one an auditor reconciles against.
 */
const OPNAME_EXPORT_COLUMNS: XlsxColumn<Opname>[] = [
  { header: "Nomor", value: (row) => row.opnameNumber },
  { header: "Tanggal", value: (row) => row.opnameDate, type: "date" },
  { header: "Gudang", value: (row) => row.warehouseName ?? "" },
  { header: "Status", value: (row) => row.status },
  { header: "Item dihitung", value: (row) => row.countedCount, type: "number" },
  { header: "Total item", value: (row) => row.itemCount, type: "number" },
  { header: "Selisih nilai", value: (row) => row.totalDiffValue, type: "number" },
  { header: "Disubmit oleh", value: (row) => row.submittedByName ?? "" },
  { header: "Disubmit pada", value: (row) => row.submittedAt ?? "" },
  { header: "Catatan", value: (row) => row.notes ?? "" },
];

export function OpnameScreen() {
  const { can } = usePermissions();
  const lookups = useCatalogLookups();

  const [filters, setFilters] = useState<OpnameFilters>(EMPTY_OPNAME_FILTERS);
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<Opname | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { opnames, pagination, loading, error } = useOpnames(
    filters,
    page,
    refreshKey,
  );

  const refresh = () => setRefreshKey((key) => key + 1);

  /**
   * Exports the sheets ON THIS PAGE.
   *
   * Page-scoped, and the button says so. The opname endpoint streams no CSV, and
   * the history is bounded by its nature — one row per counting session, not one
   * per product — so walking every page would be a loop that mostly runs when
   * something else is already wrong.
   *
   * Names rather than ids throughout: the list response already resolves
   * `warehouseName` and `submittedByName`, so the file reads the way the screen
   * does instead of handing somebody a column of ObjectIds.
   */
  const exportPage = async () => {
    setExporting(true);
    try {
      await exportToXlsx(
        OPNAME_EXPORT_COLUMNS,
        opnames,
        "riwayat-opname.xlsx",
        { sheetName: "Riwayat Opname" },
      );
    } finally {
      setExporting(false);
    }
  };

  function handleFilters(next: OpnameFilters) {
    setFilters(next);
    // A filter change re-asks the question; keeping page 4 would answer it with
    // a page that may no longer exist.
    setPage(1);
  }

  async function handleDelete() {
    if (!pendingDelete) return;

    setDeleting(true);
    setDeleteError(null);

    try {
      await stockOpnameService.remove(pendingDelete._id);
      swalToast(`Draft ${pendingDelete.opnameNumber} dibuang.`);
      setPendingDelete(null);
      refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof ApiError
          ? caught.fullMessage
          : "Draft gagal dibuang. Coba lagi.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Scope and a way through, not a form: the products are chosen on the
          create page, because a searchable picker parked above this table would
          compete with the history somebody came here to read. */}
      {can("stockOpnames", "create") && (
        <OpnameStartCard
          warehouses={lookups.warehouses}
          categories={lookups.categories}
        />
      )}

      <OpnameToolbar
        filters={filters}
        warehouses={lookups.warehouses}
        onChange={handleFilters}
        onExport={exportPage}
        exporting={exporting}
        canExport={!loading && opnames.length > 0}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-[10px] uppercase tracking-widest text-muted">
              <th className="px-4 py-2.5 text-left font-medium">Nomor</th>
              <th className="px-4 py-2.5 text-left font-medium">Tanggal</th>
              <th className="px-4 py-2.5 text-left font-medium">Gudang</th>
              <th className="px-4 py-2.5 text-right font-medium">Terhitung</th>
              <th className="px-4 py-2.5 text-right font-medium">
                Selisih nilai
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-16">
                  <div className="flex items-center justify-center gap-2 text-sm text-muted">
                    <Spinner /> Memuat daftar opname…
                  </div>
                </td>
              </tr>
            )}

            {!loading && opnames.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <p className="font-medium text-foreground">
                    Belum ada opname
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    Mulai penghitungan pertama untuk mencocokkan stok fisik
                    dengan catatan sistem.
                  </p>
                </td>
              </tr>
            )}

            {!loading &&
              opnames.map((opname) => {
                const totalMinor = toMinor(opname.totalDiffValue) ?? 0n;
                const isDraft = opname.status === "draft";

                return (
                  <tr
                    key={opname._id}
                    className="border-b border-border/60 last:border-0"
                  >
                    <td className="px-4 py-2.5 tabular-nums text-xs">
                      {opname.opnameNumber}
                    </td>
                    <td className="px-4 py-2.5 text-xs">
                      {new Date(opname.opnameDate).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {opname.warehouseName ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                      {opname.itemCount === undefined ? (
                        "—"
                      ) : (
                        <span
                          className={cn(
                            isDraft &&
                              opname.countedCount === 0 &&
                              "text-muted",
                          )}
                        >
                          {opname.countedCount ?? 0} / {opname.itemCount}
                        </span>
                      )}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right tabular-nums text-sm font-semibold",
                        totalMinor < 0n && "text-danger",
                        totalMinor > 0n && "text-success",
                      )}
                    >
                      {totalMinor === 0n
                        ? "—"
                        : formatMoney(opname.totalDiffValue)}
                    </td>
                    <td className="px-4 py-2.5">
                      <OpnameStatusBadge status={opname.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Link
                          href={`/dashboard/inventory/opname/${opname._id}`}
                          className="text-sm font-medium text-primary-hover hover:underline"
                        >
                          {isDraft ? "Lanjutkan" : "Lihat"}
                        </Link>
                        {/* Drafts only — the API refuses to discard a submitted
                            sheet, which is the supporting document for movements
                            and a journal entry that cannot be undone. */}
                        {isDraft && can("stockOpnames", "delete") && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setPendingDelete(opname);
                            }}
                            className="text-sm font-medium text-danger hover:underline"
                          >
                            Buang
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Pagination
        page={pagination.page}
        totalPages={pagination.totalPages}
        total={pagination.total}
        unit="opname"
        unitPlural="opname"
        onPageChange={setPage}
      />

      {pendingDelete && (
        <ConfirmDialog
          title="Buang draft opname?"
          confirmLabel="Buang draft"
          destructive
          busy={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => setPendingDelete(null)}
        >
          {/* Inline fragments, not <p>: DialogDescription is itself a <p>. */}
          <>
            Draft <b className="tabular-nums">{pendingDelete.opnameNumber}</b>{" "}
            beserta seluruh hitungan yang sudah diisi akan dibuang. Tidak ada
            stok yang berubah — draft memang belum pernah menulis apa pun.
            <span className="mt-2 block">
              Kalau penghitungannya sudah terlanjur jalan, lebih baik
              diselesaikan daripada dibuang: hasil hitung yang hilang tidak bisa
              diulang tanpa kembali ke rak.
            </span>
          </>
        </ConfirmDialog>
      )}
    </div>
  );
}
