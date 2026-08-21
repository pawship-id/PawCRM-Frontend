"use client";

import { useState } from "react";
import Link from "next/link";

import {
  Alert,
  ConfirmDialog,
  HighlightText,
  Pagination,
  Spinner,
} from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  // Cabang before Gudang, the way the table reads it — and the sheet's OWN
  // branch, not its warehouse's default, which is the whole reason the column
  // exists on a tenant whose central warehouse serves three shops.
  { header: "Cabang", value: (row) => row.branchName ?? "" },
  { header: "Gudang", value: (row) => row.warehouseName ?? "" },
  { header: "Status", value: (row) => row.status },
  { header: "Item dihitung", value: (row) => row.countedCount, type: "number" },
  { header: "Total item", value: (row) => row.itemCount, type: "number" },
  { header: "Selisih nilai", value: (row) => row.totalDiffValue, type: "number" },
  { header: "Disubmit oleh", value: (row) => row.submittedByName ?? "" },
  { header: "Disubmit pada", value: (row) => row.submittedAt ?? "" },
  { header: "Catatan", value: (row) => row.notes ?? "" },
];

/** Nomor, Tanggal, Cabang, Gudang, Terhitung, Selisih nilai, Status, Aksi. */
const COLUMN_COUNT = 8;

export function OpnameScreen() {
  const { can } = usePermissions();
  /**
   * `withBranches` for the new Cabang filter — it fails softly, so a role
   * holding `stockOpnames:read` without `branches:read` gets a panel whose
   * branch field offers only "Semua cabang" rather than a screen that refuses
   * to render.
   *
   * `includeInactive` because THIS IS A READ. The toolbar's own header has
   * always said the filter reaches counts taken at a warehouse closed since —
   * it could not, because the lookup asked for active ones only. The create
   * card beside it filters `isActive` itself (`warehousesForBranch`), so widening
   * the lookup does not offer a location the API would refuse a count at.
   */
  const lookups = useCatalogLookups({
    includeInactive: true,
    withBranches: true,
  });

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
   * Whether the empty table is empty BECAUSE of the panel.
   *
   * The sort is excluded — it reorders rows, it never removes one, so counting
   * it would make every empty list read as filtered. Same field the trigger's
   * `Filter (n)` badge leaves out, for the same reason.
   */
  const filtered =
    filters.search.trim() !== "" ||
    filters.branchId !== "" ||
    filters.warehouseId !== "" ||
    filters.status !== "" ||
    filters.dateFrom !== "" ||
    filters.dateTo !== "";

  /**
   * Exports the sheets ON THIS PAGE.
   *
   * Page-scoped, and the button says so. The opname endpoint streams no CSV, and
   * the history is bounded by its nature — one row per counting session, not one
   * per product — so walking every page would be a loop that mostly runs when
   * something else is already wrong.
   *
   * Names rather than ids throughout: the list response already resolves
   * `branchName`, `warehouseName` and `submittedByName`, so the file reads the
   * way the screen does instead of handing somebody a column of ObjectIds.
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

  function handleFilters(patch: Partial<OpnameFilters>) {
    setFilters((prev) => ({ ...prev, ...patch }));
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
        branches={lookups.branches}
        warehouses={lookups.warehouses}
        onChange={handleFilters}
        onExport={exportPage}
        exporting={exporting}
        canExport={!loading && opnames.length > 0}
      />

      {error && <Alert variant="error">{error}</Alert>}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nomor</TableHead>
              <TableHead>Tanggal</TableHead>
              {/* CABANG BEFORE GUDANG — which set of books, then which shelf.
                  The two are not 1:1, so a reader scanning a central
                  warehouse's counts needs both to tell them apart. */}
              <TableHead>Cabang</TableHead>
              <TableHead>Gudang</TableHead>
              <TableHead className="text-right">Terhitung</TableHead>
              <TableHead className="text-right">Selisih nilai</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-16">
                  <span className="flex items-center justify-center gap-2 text-sm text-muted">
                    <Spinner /> Memuat daftar opname…
                  </span>
                </TableCell>
              </TableRow>
            )}

            {!loading && opnames.length === 0 && (
              <TableRow>
                <TableCell colSpan={COLUMN_COUNT} className="py-16 text-center">
                  {/* TWO DIFFERENT FACTS, and telling them apart matters more
                      now than it did: with five filters in the panel, "no
                      counts here" is far more often "none matching THIS", and
                      the first message would send somebody off to start a
                      sheet that already exists one branch over. */}
                  <p className="font-medium text-foreground">
                    {filtered
                      ? "Tidak ada opname yang cocok dengan filter ini"
                      : "Belum ada opname"}
                  </p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                    {filtered
                      ? "Coba ubah kata kunci, cabang, gudang, status, atau rentang tanggalnya."
                      : "Mulai penghitungan pertama untuk mencocokkan stok fisik dengan catatan sistem."}
                  </p>
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              opnames.map((opname) => {
                const totalMinor = toMinor(opname.totalDiffValue) ?? 0n;
                const isDraft = opname.status === "draft";

                return (
                  <TableRow key={opname._id}>
                    {/* THE MATCH, MARKED. The server searches the number and
                        the sheet note; the number is the one of the two on
                        screen, so it is where a reader confirms the row in front
                        of them is the one their term found.

                        NO DEBOUNCE ON THIS SCREEN'S SEARCH, unlike the
                        stock-document list — so the marks and the rows are
                        always describing the same term, with no third of a
                        second where they disagree. */}
                    <TableCell className="tabular-nums">
                      <HighlightText
                        text={opname.opnameNumber}
                        query={filters.search}
                      />
                    </TableCell>
                    <TableCell className="tabular-nums whitespace-nowrap">
                      {new Date(opname.opnameDate).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    {/* An em dash covers both "this sheet predates the field"
                        and "the branch it named has since been deleted" — the
                        row is worth reading either way, and neither is a reason
                        to invent the warehouse's default in its place. */}
                    <TableCell className="text-muted">
                      {opname.branchName ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted">
                      {opname.warehouseName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
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
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-semibold",
                        totalMinor < 0n && "text-danger",
                        totalMinor > 0n && "text-success",
                      )}
                    >
                      {totalMinor === 0n
                        ? "—"
                        : formatMoney(opname.totalDiffValue)}
                    </TableCell>
                    <TableCell>
                      <OpnameStatusBadge status={opname.status} />
                    </TableCell>
                    <TableCell className="text-right">
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
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
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
