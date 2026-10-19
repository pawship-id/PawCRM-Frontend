"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw } from "lucide-react";

import {
  Alert,
  Card,
  DataTable,
  FilterBar,
  FinanceScopeCard,
  FilterSearch,
  FilterSelect,
  HighlightText,
  ListFooter,
  StatTile,
  withAll,
  type AppliedFilter,
  type DataTableColumn,
  type SortOptions,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  reportPresets,
  SHARED_LINE_LABEL,
  SHARED_LINE_NONE,
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

import { COMMISSION_PAGE_SIZES, useCommissions } from "../hooks/useCommissions";
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

/**
 * THE HEADERS THAT ORDER THE LIST, on the server (§8). The API takes a column
 * and a direction rather than one name, so each ordering here is the pair
 * spelled `column:dir` and split again on the way out. First click takes the
 * column's natural direction: newest date and largest amount first, A first
 * for a name. Cabang and Status stopped sorting on 20 October 2026 (BO).
 */
type CommissionOrder = `${CommissionSort}:${"asc" | "desc"}`;

const SORT_OPTIONS: SortOptions<CommissionOrder> = {
  bookingDate: {
    asc: "bookingDate:asc",
    desc: "bookingDate:desc",
    first: "desc",
  },
  groomer: { asc: "groomer:asc", desc: "groomer:desc" },
  basisAmount: {
    asc: "basisAmount:asc",
    desc: "basisAmount:desc",
    first: "desc",
  },
  amount: { asc: "amount:asc", desc: "amount:desc", first: "desc" },
};

/** Keeps a click inside a cell's control from also opening the row. */
function stop(event: { stopPropagation: () => void }) {
  event.stopPropagation();
}

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

  // Approving, correcting and paying: the report's own grant, or the ledger
  // grant it used to need (every step posts a journal entry).
  const manages =
    can("commissionReports", "manage") || can("journalEntries", "create");
  const rows = data?.rows ?? [];
  const picked = Object.values(selected);
  const pickedTotal = sumDecimals(picked.map((row) => row.amount));

  /* "Reset filter (n)" on the scope row — its three fields; the status
     filter and the search box keep their own resets. */
  const scopeCount =
    (query.branchIds.length > 0 ? 1 : 0) +
    (query.businessLineIds.length > 0 ? 1 : 0) +
    (query.dateFrom || query.dateTo ? 1 : 0);

  const filtered =
    query.search.trim() !== "" ||
    query.status !== "" ||
    query.branchIds.length > 0 ||
    query.businessLineIds.length > 0 ||
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
      safeToast(
        "Tidak ada komisi yang menunggu persetujuan di pilihan ini.",
        "error",
      );
      return;
    }

    setBusy(true);

    try {
      const result = await reportService.approveCommissions(
        pending.map(({ bookingId, groomerUserId }) => ({
          bookingId,
          groomerUserId,
        })),
      );
      forget(pending.map((row) => row.key));
      refetch();
      safeToast(`${result.approved} komisi disetujui.`);
    } catch (err) {
      safeToast(
        errorText(err, "Komisi tidak bisa disetujui. Coba lagi."),
        "error",
      );
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
      safeToast(
        errorText(err, "Persetujuan tidak bisa dibatalkan. Coba lagi."),
        "error",
      );
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

  const columns = commissionColumns({
    search: query.search,
    manages,
    busy,
    selectable,
    pageChecked,
    isChecked: (row) => Boolean(selected[row.key]),
    onCheck: toggle,
    onCheckPage: togglePage,
    onStatus: changeStatus,
  });

  return (
    <div className="flex flex-col gap-6">
      <FinanceScopeCard
        branches={state.branches}
        branchIds={query.branchIds}
        onBranchIdsChange={(branchIds) => setQuery({ branchIds })}
        businessLines={state.businessLines}
        businessLineIds={query.businessLineIds}
        onBusinessLineIdsChange={(businessLineIds) =>
          setQuery({ businessLineIds })
        }
        sharedLine={{ value: SHARED_LINE_NONE, label: SHARED_LINE_LABEL }}
        presets={presets}
        dateFrom={query.dateFrom}
        dateTo={query.dateTo}
        onDateRangeChange={({ from, to }) =>
          setQuery({ dateFrom: from, dateTo: to })
        }
        dateLabel="Tanggal booking"
        trailing={
          scopeCount > 0 ? (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() =>
                setQuery({
                  branchIds: [],
                  businessLineIds: [],
                  dateFrom: "",
                  dateTo: "",
                })
              }
            >
              Reset filter ({scopeCount})
            </Button>
          ) : undefined
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
          <h2 className="text-lg font-bold">Komisi</h2>

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

          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.key}
            sort={{
              value: `${query.sort}:${query.dir}`,
              options: SORT_OPTIONS,
              onChange: (next) => {
                const [sort, dir] = next.split(":") as [
                  CommissionSort,
                  "asc" | "desc",
                ];
                setQuery({ sort, dir });
              },
            }}
            loading={loading}
            loadingLabel="Memuat komisi…"
            onRowClick={(row) => router.push(commissionHref(row))}
            rowClassName={(row) =>
              cn(
                selected[row.key] && "bg-navy-100",
                row.status === "reversed" && "text-muted",
              )
            }
            empty={
              <div className="px-4 py-16 text-center">
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
              </div>
            }
          />

          {!(loading && !data) && (
            <ListFooter
              page={data?.page ?? query.page}
              pageSize={query.limit}
              pageSizes={COMMISSION_PAGE_SIZES}
              total={data?.total ?? 0}
              totalPages={Math.max(
                1,
                Math.ceil((data?.total ?? 0) / query.limit),
              )}
              unit="komisi"
              onPageChange={(page) => setQuery({ page })}
              onPageSizeChange={(limit) => setQuery({ limit, page: 1 })}
            />
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
 * ☐ · Tanggal · Staf · Cabang · Nilai Layanan · Komisi · Status. The ticks and
 * the status control stop their clicks, so using them never opens the row.
 */
function commissionColumns({
  search,
  manages,
  busy,
  selectable,
  pageChecked,
  isChecked,
  onCheck,
  onCheckPage,
  onStatus,
}: {
  search: string;
  manages: boolean;
  busy: boolean;
  selectable: CommissionRow[];
  pageChecked: number;
  isChecked: (row: CommissionRow) => boolean;
  onCheck: (row: CommissionRow, on: boolean) => void;
  onCheckPage: (on: boolean) => void;
  onStatus: (row: CommissionRow, next: CommissionStatus) => void;
}): DataTableColumn<CommissionRow>[] {
  return [
    {
      id: "select",
      header: (
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
          onCheckedChange={(value) => onCheckPage(value === true)}
        />
      ),
      headClassName: "w-10",
      cell: (row) => (
        <div onClick={stop}>
          <Checkbox
            aria-label={`Pilih komisi ${row.groomerName ?? ""} ${row.bookingNumber ?? ""}`.trim()}
            checked={isChecked(row)}
            disabled={!isSelectable(row)}
            title={
              isSelectable(row)
                ? undefined
                : COMMISSION_STATUS_LABEL[row.status]
            }
            onCheckedChange={(value) => onCheck(row, value === true)}
          />
        </div>
      ),
    },
    {
      id: "bookingDate",
      header: "Tanggal",
      cellClassName: "text-sm whitespace-nowrap",
      cell: (row) => (
        <>
          <Link
            href={commissionHref(row)}
            onClick={stop}
            className="rounded-md font-semibold tabular-nums underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <HighlightText
              text={row.bookingNumber ?? "Tanpa nomor"}
              query={search}
            />
          </Link>
          <p className="text-xs text-muted tabular-nums">
            {formatDay(row.bookingDate)}
          </p>
        </>
      ),
    },
    {
      id: "groomer",
      header: "Staf",
      cellClassName: "text-sm",
      cell: (row) => (
        <>
          <p className="font-semibold">
            <HighlightText text={row.groomerName ?? "—"} query={search} />
          </p>
          {row.petName && (
            <p className="text-xs text-muted">
              {row.petName}
              {row.serviceName ? ` · ${row.serviceName}` : ""}
            </p>
          )}
        </>
      ),
    },
    {
      id: "branch",
      header: "Cabang",
      cellClassName: "text-sm whitespace-nowrap",
      cell: (row) => (
        <HighlightText text={row.branchName ?? "—"} query={search} />
      ),
    },
    {
      id: "basisAmount",
      header: "Nilai layanan",
      align: "right",
      cellClassName: "text-sm whitespace-nowrap",
      cell: (row) => formatMoney(row.basisAmount),
    },
    {
      id: "amount",
      header: "Komisi",
      align: "right",
      cellClassName: (row) =>
        cn(
          "text-sm font-semibold whitespace-nowrap",
          row.status === "reversed" && "line-through",
        ),
      cell: (row) => (
        <>
          {formatMoney(row.amount)}
          {row.overridden && (
            <p className="text-xs font-normal text-muted">disesuaikan</p>
          )}
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        const options = nextStatuses(row.status);
        return (
          <div onClick={stop}>
            {/*
              THE MOCKUP'S STATUS DROPDOWN, for whoever may decide — and only
              the moves the Owner allowed: approve a pending row, take an
              approval back, pay an approved one. Everything else is a badge.
            */}
            {manages && options.length > 1 ? (
              /*
                `bar`, not `field`: a control in a table cell draws the value
                alone, with no caption stacked above it — the column header
                already says "Status".
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
                onChange={(next) => onStatus(row, next)}
              />
            ) : (
              <CommissionStatusBadge status={row.status} />
            )}
          </div>
        );
      },
    },
  ];
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
