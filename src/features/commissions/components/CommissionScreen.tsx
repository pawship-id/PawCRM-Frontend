"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, RotateCcw } from "lucide-react";

import {
  Alert,
  Card,
  FilterBar,
  FilterSearch,
  FilterSelect,
  HighlightText,
  ListFooter,
  Spinner,
  StatTile,
  withAll,
  type AppliedFilter,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FinanceReportToolbar,
  reportPresets,
  type FinanceQuery,
} from "@/features/accounting";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { cn } from "@/lib/utils";
import { ApiError } from "@/services/api-error";
import { reportService } from "@/services/report.service";
import type {
  CommissionPayment,
  CommissionRow,
  CommissionSort,
  CommissionStatus,
} from "@/types/api";
import { formatMoney, sumDecimals } from "@/utils/decimal";

import {
  COMMISSION_PAGE_SIZES,
  useCommissions,
  type CommissionsQuery,
} from "../hooks/useCommissions";
import {
  COMMISSION_STATUS_FILTERS,
  COMMISSION_STATUS_LABEL,
  commissionHref,
  formatDay,
  isSelectable,
  nextStatuses,
} from "../labels";
import { CommissionStatusBadge } from "./CommissionStatusBadge";
import { PayCommissionDialog } from "./PayCommissionDialog";

/** ☐ · Tanggal · Staf · Cabang · Nilai Layanan · Komisi · Status. */
const COLUMN_COUNT = 7;

const STATUS_OPTIONS = withAll(
  COMMISSION_STATUS_FILTERS.map((status) => ({
    value: status,
    label: COMMISSION_STATUS_LABEL[status],
  })),
  "Semua status",
);

/**
 * KOMISI — one row per booking × groomer, from the BO mockup
 * (`buloo-keuangan-komisi.html`, 21 September 2026).
 *
 * WHAT A ROW IS. A booking may be several turns (Mandi, Potong & Styling) and
 * each turn may have its own crew; the server keeps a record per turn × person
 * and this screen shows them summed per person per booking — the unit a groomer
 * is actually paid for. The turns are on the row's own page.
 *
 * APPROVAL IS REQUIRED (Owner, 21 September 2026). A row moves Menunggu
 * Persetujuan → Disetujui → Dibayar, and the status control only offers
 * Dibayar on an approved row. Paying writes ONE cash transaction and ONE
 * journal entry per row — "1 komisi = 1 jurnal" — out of one Kas & Bank
 * account chosen in the dialog.
 *
 * THE CONTEXT BAR IS THE MODULE'S — Cabang, Lini Usaha, Periode — the same
 * `FinanceReportToolbar` Ringkasan and Kas & Bank carry. Periode reads the
 * BOOKING's date, the mockup's Tanggal column.
 */
export function CommissionScreen({ now }: { now: string }) {
  const router = useRouter();
  const { can } = usePermissions();
  const today = useMemo(() => new Date(now), [now]);
  const presets = useMemo(() => reportPresets(today), [today]);

  const state = useCommissions();
  const { data, query, setQuery, loading, error, refetch } = state;

  /*
    SELECTION IS KEPT BY KEY, WITH THE ROW, so it survives a page change and the
    bulk bar's total does not shrink when the page it was picked on scrolls away.
  */
  const [selected, setSelected] = useState<Record<string, CommissionRow>>({});
  const [paying, setPaying] = useState<{
    rows: CommissionRow[];
    /** Pending rows in the selection, left out of the payment and said so. */
    skipped: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const manages = can("journalEntries", "create");
  const rows = data?.rows ?? [];
  const picked = Object.values(selected);
  const pickedTotal = sumDecimals(picked.map((row) => row.amount));

  const contextQuery: FinanceQuery = {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    branchId: query.branchId,
    businessLineId: query.businessLineId,
  };

  const filtered =
    query.search.trim() !== "" ||
    query.status !== "" ||
    query.branchId !== "" ||
    query.businessLineId !== "" ||
    query.dateFrom !== "" ||
    query.dateTo !== "";

  const selectable = rows.filter(isSelectable);
  const pageChecked = selectable.filter((row) => selected[row.key]).length;

  function toggle(row: CommissionRow, on: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      if (on) next[row.key] = row;
      else delete next[row.key];
      return next;
    });
  }

  function togglePage(on: boolean) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const row of selectable) {
        if (on) next[row.key] = row;
        else delete next[row.key];
      }
      return next;
    });
  }

  /** Drops rows from the selection once an action has moved them on. */
  function forget(keys: string[]) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  async function approve(targets: CommissionRow[]) {
    const pending = targets.filter((row) => row.status === "pending");

    if (pending.length === 0) {
      safeToast("Tidak ada komisi yang menunggu persetujuan di pilihan ini.", "error");
      return;
    }

    setBusy(true);

    try {
      const result = await reportService.approveCommissions(
        pending.map(({ bookingId, groomerUserId }) => ({ bookingId, groomerUserId })),
      );
      forget(pending.map((row) => row.key));
      refetch();
      safeToast(`${result.approved} komisi disetujui.`);
    } catch (err) {
      safeToast(errorText(err, "Komisi tidak bisa disetujui. Coba lagi."), "error");
    } finally {
      setBusy(false);
    }
  }

  async function unapprove(row: CommissionRow) {
    setBusy(true);

    try {
      await reportService.unapproveCommissions([
        { bookingId: row.bookingId, groomerUserId: row.groomerUserId },
      ]);
      refetch();
      safeToast("Persetujuan dibatalkan.");
    } catch (err) {
      safeToast(errorText(err, "Persetujuan tidak bisa dibatalkan. Coba lagi."), "error");
    } finally {
      setBusy(false);
    }
  }

  /**
   * BAYAR TERPILIH pays the APPROVED rows of the selection. A pending one is
   * left out and the dialog says how many — approving is a separate decision,
   * and paying it by accident is what the approval step exists to stop.
   */
  function startPayment(targets: CommissionRow[]) {
    const approved = targets.filter((row) => row.status === "approved");

    if (approved.length === 0) {
      safeToast("Setujui dulu komisinya sebelum dibayar.", "error");
      return;
    }

    setPaying({
      rows: approved,
      skipped: targets.filter((row) => row.status === "pending").length,
    });
  }

  function changeStatus(row: CommissionRow, next: CommissionStatus) {
    if (next === row.status) return;
    if (next === "approved") void approve([row]);
    else if (next === "pending") void unapprove(row);
    else if (next === "paid") startPayment([row]);
  }

  function onPaid(payments: CommissionPayment[]) {
    const keys = payments.map((row) => `${row.bookingId}:${row.groomerUserId}`);
    forget(keys);
    setPaying(null);
    refetch();
    safeToast(
      payments.length === 1
        ? `Komisi dibayar — ${payments[0].number ?? "transaksi"}, jurnal ${payments[0].entryNumber ?? "dibuat"}.`
        : `${payments.length} komisi dibayar, ${payments.length} jurnal dibuat.`,
    );
  }

  const chips: AppliedFilter[] = [];
  if (query.status) {
    chips.push({
      key: "status",
      label: COMMISSION_STATUS_LABEL[query.status],
      onRemove: () => setQuery({ status: "" }),
    });
  }

  const sortHead = (sort: CommissionSort, label: string, align?: "right") => (
    <SortHead
      sort={sort}
      label={label}
      align={align}
      query={query}
      onSort={(next) => setQuery(next)}
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <FinanceReportToolbar
        query={contextQuery}
        branches={state.branches}
        businessLines={state.businessLines}
        presets={presets}
        disabled={loading}
        onChange={(patch) =>
          setQuery({
            ...(patch.dateFrom !== undefined && { dateFrom: patch.dateFrom }),
            ...(patch.dateTo !== undefined && { dateTo: patch.dateTo }),
            ...(patch.branchId !== undefined && { branchId: patch.branchId }),
            ...(patch.businessLineId !== undefined && {
              businessLineId: patch.businessLineId,
            }),
          })
        }
      />

      {/*
        THE THREE CARDS COVER THE CONTEXT BAR'S SCOPE, not the page and not the
        status filter: they say what the period and the branch owe, whichever
        rows happen to be on screen.
      */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Komisi total"
          value={data ? formatMoney(data.cards.total) : "—"}
          caption="Cabang, lini & periode aktif"
          loading={!data && !error}
          error={Boolean(error) && !data}
        />
        <StatTile
          label="Komisi terbayar"
          value={data ? formatMoney(data.cards.paid) : "—"}
          caption="Sudah dibayarkan"
          loading={!data && !error}
          error={Boolean(error) && !data}
        />
        <StatTile
          label="Komisi pending"
          value={data ? formatMoney(data.cards.pending) : "—"}
          caption="Total dikurangi terbayar"
          loading={!data && !error}
          error={Boolean(error) && !data}
        />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
            Komisi per booking
          </h2>

          {error && (
            <Alert variant="error">
              <span className="flex flex-wrap items-center gap-3">
                {error}
                <Button variant="secondary" size="sm" onClick={refetch}>
                  <RotateCcw className="size-4" />
                  Coba lagi
                </Button>
              </span>
            </Alert>
          )}

          {/*
            ONE FILTER, SO IT STANDS ON THE BAR (§8) — the mockup puts Status
            behind a Filter button, and a button that hides one thing is worse
            than showing it. Cabang lives on the context bar above, one control
            for both, as the mockup's own note says.
          */}
          <FilterBar
            searchPlacement="leading"
            searchClassName="min-w-[12rem] flex-1"
            chips={chips}
            onClearAll={() => setQuery({ status: "" })}
            search={
              <FilterSearch
                value={query.search}
                onChange={(search) => setQuery({ search })}
                placeholder="Cari staf, cabang, atau no. booking…"
                ariaLabel="Cari komisi"
                fill
              />
            }
          >
            <FilterSelect
              layout="bar"
              label="Status"
              ariaLabel="Filter status"
              value={query.status}
              options={STATUS_OPTIONS}
              onChange={(status) => setQuery({ status })}
            />
          </FilterBar>

          {picked.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-tint-warning px-4 py-3">
              <p className="text-sm font-semibold text-secondary-foreground tabular-nums">
                {picked.length} dipilih · Total {formatMoney(pickedTotal)}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() => setSelected({})}
                >
                  Batalkan pilihan
                </Button>
                {manages && (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => void approve(picked)}
                    >
                      Setujui terpilih
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => startPayment(picked)}
                    >
                      Bayar terpilih
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {loading && !data ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <Spinner /> Memuat komisi…
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <Table className={loading ? "opacity-60" : undefined}>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          aria-label="Pilih semua di halaman ini"
                          disabled={selectable.length === 0}
                          checked={
                            pageChecked === 0
                              ? false
                              : pageChecked === selectable.length
                                ? true
                                : "indeterminate"
                          }
                          onCheckedChange={(value) => togglePage(value === true)}
                        />
                      </TableHead>
                      {sortHead("bookingDate", "Tanggal")}
                      {sortHead("groomer", "Staf")}
                      {sortHead("branch", "Cabang")}
                      {sortHead("basisAmount", "Nilai layanan", "right")}
                      {sortHead("amount", "Komisi", "right")}
                      {sortHead("status", "Status")}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell
                          colSpan={COLUMN_COUNT}
                          className="px-4 py-16 text-center"
                        >
                          <p className="font-medium text-foreground">
                            {filtered
                              ? "Tidak ada komisi di filter ini."
                              : "Belum ada komisi."}
                          </p>
                          <p className="mt-1 text-sm text-muted">
                            {filtered
                              ? "Coba longgarkan periode, cabang atau statusnya, atau hapus kata kuncinya."
                              : "Komisi muncul begitu booking grooming selesai dan fakturnya terbit."}
                          </p>
                        </TableCell>
                      </TableRow>
                    )}

                    {rows.map((row) => (
                      <CommissionTableRow
                        key={row.key}
                        row={row}
                        search={query.search}
                        checked={Boolean(selected[row.key])}
                        manages={manages}
                        busy={busy}
                        onCheck={(on) => toggle(row, on)}
                        onOpen={() => router.push(commissionHref(row))}
                        onStatus={(next) => changeStatus(row, next)}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              <ListFooter
                page={data?.page ?? query.page}
                pageSize={query.limit}
                pageSizes={COMMISSION_PAGE_SIZES}
                total={data?.total ?? 0}
                totalPages={Math.max(1, Math.ceil((data?.total ?? 0) / query.limit))}
                unit="komisi"
                onPageChange={(page) => setQuery({ page })}
                onPageSizeChange={(limit) => setQuery({ limit, page: 1 })}
              />
            </>
          )}
        </div>
      </Card>

      {paying && (
        <PayCommissionDialog
          rows={paying.rows}
          skipped={paying.skipped}
          onCancel={() => setPaying(null)}
          onPaid={onPaid}
        />
      )}
    </div>
  );
}

/**
 * A HEADER THAT ORDERS THE LIST — the third screen allowed to (§8, recorded
 * there). First click takes the column's natural direction: newest date and
 * largest amount first, A first for a name.
 */
function SortHead({
  sort,
  label,
  align,
  query,
  onSort,
}: {
  sort: CommissionSort;
  label: string;
  align?: "right";
  query: CommissionsQuery;
  onSort: (patch: Pick<CommissionsQuery, "sort" | "dir">) => void;
}) {
  const active = query.sort === sort ? query.dir : null;
  const Icon =
    active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;
  const natural: "asc" | "desc" =
    sort === "groomer" || sort === "branch" || sort === "status" ? "asc" : "desc";

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active === "asc" ? "ascending" : active === "desc" ? "descending" : "none"
      }
    >
      <button
        type="button"
        onClick={() =>
          onSort({
            sort,
            dir: active ? (active === "asc" ? "desc" : "asc") : natural,
          })
        }
        className={cn(
          "inline-flex items-center gap-1 rounded-md hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
          active && "text-foreground",
          align === "right" && "flex-row-reverse",
        )}
      >
        {label}
        <Icon
          className={cn("size-3.5", active ? "text-primary" : "text-muted/60")}
          aria-hidden
        />
      </button>
    </TableHead>
  );
}

function CommissionTableRow({
  row,
  search,
  checked,
  manages,
  busy,
  onCheck,
  onOpen,
  onStatus,
}: {
  row: CommissionRow;
  search: string;
  checked: boolean;
  manages: boolean;
  busy: boolean;
  onCheck: (on: boolean) => void;
  onOpen: () => void;
  onStatus: (next: CommissionStatus) => void;
}) {
  const reversed = row.status === "reversed";
  const options = nextStatuses(row.status);

  return (
    <TableRow
      onClick={onOpen}
      className={cn(
        "cursor-pointer",
        checked && "bg-navy-100",
        reversed && "text-muted",
      )}
    >
      <TableCell className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
        <Checkbox
          aria-label={`Pilih komisi ${row.groomerName ?? ""} ${row.bookingNumber ?? ""}`.trim()}
          checked={checked}
          disabled={!isSelectable(row)}
          title={isSelectable(row) ? undefined : COMMISSION_STATUS_LABEL[row.status]}
          onCheckedChange={(value) => onCheck(value === true)}
        />
      </TableCell>

      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap">
        <Link
          href={commissionHref(row)}
          onClick={(event) => event.stopPropagation()}
          className="rounded-md font-semibold tabular-nums underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <HighlightText text={row.bookingNumber ?? "Tanpa nomor"} query={search} />
        </Link>
        <p className="text-xs text-muted tabular-nums">{formatDay(row.bookingDate)}</p>
      </TableCell>

      <TableCell className="px-4 py-2.5 text-sm">
        <p className="font-semibold">
          <HighlightText text={row.groomerName ?? "—"} query={search} />
        </p>
        {row.petName && (
          <p className="text-xs text-muted">
            {row.petName}
            {row.serviceName ? ` · ${row.serviceName}` : ""}
          </p>
        )}
      </TableCell>

      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap">
        <HighlightText text={row.branchName ?? "—"} query={search} />
      </TableCell>

      <TableCell className="px-4 py-2.5 text-right text-sm tabular-nums whitespace-nowrap">
        {formatMoney(row.basisAmount)}
      </TableCell>

      <TableCell
        className={cn(
          "px-4 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap",
          reversed && "line-through",
        )}
      >
        {formatMoney(row.amount)}
        {row.overridden && (
          <p className="text-xs font-normal text-muted">disesuaikan</p>
        )}
      </TableCell>

      <TableCell className="px-4 py-2.5" onClick={(event) => event.stopPropagation()}>
        {/*
          THE MOCKUP'S STATUS DROPDOWN, for whoever may decide — and only the
          moves the Owner allowed: approve a pending row, take an approval back,
          pay an approved one. Everything else is a badge.
        */}
        {manages && options.length > 1 ? (
          /*
            `bar`, not `field`: a control in a table cell draws the value alone,
            with no caption stacked above it — the column header already says
            "Status".
          */
          <FilterSelect
            layout="bar"
            label="Status"
            ariaLabel={`Ubah status komisi ${row.groomerName ?? ""}`.trim()}
            value={row.status}
            active={false}
            disabled={busy}
            options={options.map((status) => ({
              value: status,
              label: COMMISSION_STATUS_LABEL[status],
            }))}
            onChange={onStatus}
          />
        ) : (
          <CommissionStatusBadge status={row.status} />
        )}
      </TableCell>
    </TableRow>
  );
}

/** Chrome must never be able to fail an action — see BookingForm. */
function safeToast(message: string, icon: "success" | "error" = "success") {
  try {
    swalToast(message, icon);
  } catch {
    /* The list itself shows what happened. */
  }
}

function errorText(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.fullMessage : fallback;
}
