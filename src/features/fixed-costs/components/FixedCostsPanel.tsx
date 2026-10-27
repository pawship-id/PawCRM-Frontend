"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  Card,
  DataTable,
  FilterBar,
  FilterSearch,
  FilterSelect,
  HighlightText,
  ListFooter,
  withAll,
  type DataTableColumn,
  type FilterOption,
  type SortOptions,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CASH_TRANSACTION_DETAIL_HREF } from "@/features/cash-transactions";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";
import type { FixedCost, FixedCostSort } from "@/types/accounting";
import { formatMoney } from "@/utils/decimal";

import {
  FIXED_COST_PAGE_SIZES,
  type UseFixedCostsResult,
} from "../hooks/useFixedCosts";
import {
  categoryLabel,
  dueLabel,
  fixedCostHref,
  formatDate,
  INTERVAL_LABEL,
  KIND_BADGE,
  KIND_LABEL,
} from "../labels";
import { PostOccurrenceDialog } from "./PostOccurrenceDialog";

/**
 * THE COLUMNS THE HEADER CAN ORDER BY, from the mockup's own `BT_SORT_COLS` —
 * minus the two it sorts client-side over a five-row array and the server
 * cannot: Tipe and Kategori.
 *
 * Tipe is a two-valued badge, so ordering by it is the Tipe FILTER with extra
 * steps. Kategori is assembled at render time from however many counter
 * accounts a row has, so any field the server could sort would order the rows
 * by something other than the text somebody is reading — the same rule the
 * Transaksi table's Deskripsi and Akun columns follow.
 *
 * Every first click is `asc`: A first on a name, the soonest on the due date
 * (what somebody opens a schedule for), and the smallest amount first.
 */
const SORT_OPTIONS: SortOptions<FixedCostSort> = {
  nama: { asc: "nameAsc", desc: "nameDesc" },
  jumlah: { asc: "amountLowest", desc: "amountHighest" },
  jatuhTempo: { asc: "dueSoonest", desc: "dueLatest" },
};

const KIND_OPTIONS: FilterOption<string>[] = withAll(
  [
    { value: "other_income", label: KIND_LABEL.other_income },
    { value: "expense", label: KIND_LABEL.expense },
  ],
  "Semua tipe",
);

const STATUS_OPTIONS: FilterOption<string>[] = withAll(
  [
    { value: "active", label: "Aktif" },
    { value: "paused", label: "Dijeda" },
  ],
  "Termasuk dijeda",
);

/**
 * BIAYA TETAP — the costs a shop knows it will meet again: gaji, sewa,
 * langganan, and the standing income that comes back the same way.
 *
 * TEMPLATES, NOT MONEY. Nothing in this table has touched the ledger. It says
 * "this is due, and it looks like this"; pressing Catat turns one occurrence
 * into a real transaction in the tab next door, with its own number and its own
 * journal entry.
 *
 * THERE IS NO SCHEDULER, AND THE SCREEN DOES NOT PRETEND THERE IS. The mockup's
 * copy promises "otomatis tercatat tiap bulan" and nothing posts by itself, so
 * every row carries a **Catat** button instead: the honest version of that
 * promise is a person pressing it. `dueCount` is why the button can say how many
 * are waiting — a rent entered three months late owes three, and a screen
 * reading only "jatuh tempo" would let two of them vanish the moment the first
 * was recorded.
 */
export function FixedCostsPanel({ state }: { state: UseFixedCostsResult }) {
  const router = useRouter();
  const { fixedCosts, pagination, query, loading, error, setQuery, refetch } =
    state;

  /** The row whose occurrence is being recorded, or null. */
  const [posting, setPosting] = useState<FixedCost | null>(null);

  const filtered =
    query.search.trim() !== "" ||
    query.kind !== "" ||
    query.accountId !== "" ||
    query.status !== "active";

  return (
    <Card>
      <div className="flex flex-col gap-4">
        {/*
          The caption and the stack follow the Transaksi tab exactly — one card
          holds the controls, the table and the footer, so the search box is
          visibly about the rows beneath it.
        */}
        <h2 className="text-lg font-bold">Biaya tetap</h2>

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

        <FilterBar
          searchPlacement="leading"
          searchClassName="min-w-[12rem] flex-1"
          search={
            <FilterSearch
              value={query.search}
              onChange={(search) => setQuery({ search })}
              placeholder="Cari nama biaya, penerima, atau referensi…"
              ariaLabel="Cari biaya tetap"
              fill
            />
          }
          actions={
            /*
              THE SAME FORM THE TRANSAKSI TAB OPENS, at the same URL (21
              September 2026, on request). A fixed cost IS a transaction
              somebody also means to repeat, and after the two forms merged a
              second route was a second name for one screen. The switch on that
              form — "Jadikan biaya tetap" — is now the only thing that decides
              which of the two gets written.

              GATED ON `fixedCosts:create` HERE and on `cashTransactions:create`
              at the Transaksi tab's own button: the two tabs offer the same
              form for different reasons, and each asks for the grant its own
              reader came with. The form re-checks both for itself.
            */
            <Can feature="fixedCosts" action="create">
              <Button asChild>
                <Link href={`${CASH_TRANSACTION_DETAIL_HREF}/new`}>
                  <Plus className="size-4" />
                  Tambah biaya tetap
                </Link>
              </Button>
            </Can>
          }
        >
          {/*
            TWO SELECTS ON THE BAR, not behind a panel button: §8 puts a panel
            behind five fields or any multi-select, and this screen has neither.
            Each applies on click — one click, one result.
          */}
          <FilterSelect
            label="Tipe"
            ariaLabel="Filter tipe"
            value={query.kind}
            options={KIND_OPTIONS}
            onChange={(kind) => setQuery({ kind: kind as typeof query.kind })}
          />
          <FilterSelect
            label="Status"
            ariaLabel="Filter status"
            value={query.status === "active" ? "active" : query.status}
            options={STATUS_OPTIONS}
            onChange={(status) =>
              setQuery({ status: status as typeof query.status })
            }
          />
        </FilterBar>

        <DataTable
          columns={fixedCostColumns({
            search: query.search,
            onPost: setPosting,
          })}
          rows={fixedCosts}
          rowKey={(fixedCost) => fixedCost._id}
          sort={{
            value: query.sort,
            options: SORT_OPTIONS,
            onChange: (sort) => setQuery({ sort, page: 1 }),
          }}
          loading={loading}
          loadingLabel="Memuat biaya tetap…"
          // The whole row opens the schedule, as the Transaksi table's rows
          // do; the name is the keyboard's way in.
          onRowClick={(fixedCost) => router.push(fixedCostHref(fixedCost._id))}
          rowClassName={(fixedCost) => !fixedCost.isActive && "text-muted"}
          empty={
            <div className="px-4 py-16 text-center">
              <p className="font-medium text-foreground">
                {filtered
                  ? "Tidak ada biaya tetap di filter ini."
                  : "Belum ada biaya tetap."}
              </p>
              <p className="mt-1 text-sm text-muted">
                {filtered
                  ? "Coba longgarkan tipe atau statusnya, atau hapus kata kuncinya."
                  : "Catat gaji, sewa, atau langganan yang berulang tiap bulan supaya jatuh temponya muncul di sini."}
              </p>
            </div>
          }
        />

        {/* The footer waits for the first rows, as it always has. */}
        {!(loading && fixedCosts.length === 0) && (
          <ListFooter
            page={pagination.page}
            pageSize={query.limit}
            pageSizes={FIXED_COST_PAGE_SIZES}
            total={pagination.total}
            totalPages={pagination.totalPages}
            unit="biaya tetap"
            onPageChange={(page) => setQuery({ page })}
            onPageSizeChange={(limit) => setQuery({ limit, page: 1 })}
          />
        )}
      </div>

      <PostOccurrenceDialog
        fixedCost={posting}
        onClose={() => setPosting(null)}
        onPosted={refetch}
      />
    </Card>
  );
}

/** Tipe · Nama · Kategori · Jumlah · Jatuh tempo · Akun · Status. */
function fixedCostColumns({
  search,
  onPost,
}: {
  search: string;
  onPost: (fixedCost: FixedCost) => void;
}): DataTableColumn<FixedCost>[] {
  return [
    {
      id: "tipe",
      header: "Tipe",
      cellClassName: "px-4 py-2.5 whitespace-nowrap",
      /*
        A WORD, NOT A COLOUR (§1.3). The mockup tints the Masuk badge green and
        leaves Keluar grey; both carry their label either way.
      */
      cell: (fixedCost) => (
        <Badge
          variant="outline"
          className={cn(fixedCost.direction === "in" && "text-success")}
        >
          {KIND_BADGE[fixedCost.kind]}
        </Badge>
      ),
    },
    {
      id: "nama",
      header: "Nama",
      cellClassName: "max-w-xs px-4 py-2.5",
      cell: (fixedCost) => (
        <>
          <p className="truncate text-sm font-semibold">
            <Link
              href={fixedCostHref(fixedCost._id)}
              onClick={(event) => event.stopPropagation()}
              className="rounded-md underline-offset-4 hover:text-primary-hover hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <HighlightText text={fixedCost.name} query={search} />
            </Link>
          </p>
          <p className="truncate text-xs text-muted">
            {INTERVAL_LABEL[fixedCost.interval]}
            {fixedCost.partyName && (
              <>
                {" · "}
                <HighlightText text={fixedCost.partyName} query={search} />
              </>
            )}
          </p>
        </>
      ),
    },
    {
      id: "kategori",
      header: "Kategori",
      /*
        WRAPS, never runs on (27 October 2026). The table cell is `nowrap` by
        default, and "Beban Administrasi & Umum" spilled across the Jumlah
        beside it. A wrapping cell also lets the table shrink to its card, so
        the Catat button at the far end is not cut off.
      */
      cellClassName: "min-w-32 max-w-44 px-4 py-2.5 text-sm whitespace-normal",
      cell: (fixedCost) =>
        categoryLabel(fixedCost.counterAccounts) ?? (
          <span className="text-muted">—</span>
        ),
    },
    {
      /*
        UNSIGNED, unlike the Transaksi table's amount. Nothing here has moved:
        a signed figure would read as money that went out, and this column is
        "how much it will be".
      */
      id: "jumlah",
      header: "Jumlah",
      align: "right",
      cellClassName: (fixedCost) =>
        cn(
          "px-4 py-2.5 text-sm font-semibold whitespace-nowrap",
          fixedCost.direction === "in" && fixedCost.isActive && "text-success",
        ),
      cell: (fixedCost) => formatMoney(fixedCost.amount),
    },
    {
      id: "jatuhTempo",
      header: "Jatuh tempo",
      cellClassName: "px-4 py-2.5 text-sm whitespace-nowrap tabular-nums",
      cell: (fixedCost) => {
        const due = dueLabel(fixedCost);
        return (
          <span className="flex flex-wrap items-center gap-2">
            {formatDate(fixedCost.nextDueAt)}
            {due && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  due.tone === "danger"
                    ? "bg-tint-danger text-danger-ink"
                    : "bg-tint-warning text-warning",
                )}
              >
                {due.text}
              </span>
            )}
          </span>
        );
      },
    },
    {
      id: "akun",
      header: "Akun",
      // Wraps for the same reason Kategori does — "1111 · Kas Cabang Barat".
      cellClassName: "min-w-28 max-w-40 px-4 py-2.5 text-sm whitespace-normal",
      cell: (fixedCost) => fixedCost.accountName ?? "—",
    },
    {
      id: "status",
      header: "Status",
      cellClassName: "px-4 py-2.5 whitespace-nowrap",
      cell: (fixedCost) => {
        const paused = !fixedCost.isActive;
        return (
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                paused
                  ? "bg-tint-neutral text-muted"
                  : "bg-tint-success text-success",
              )}
            >
              {paused ? "Dijeda" : "Aktif"}
            </span>

            {/*
              THE BUTTON THE MOCKUP DOES NOT HAVE, and the honest substitute for
              the automation it promises. Offered only while something is
              actually due — a schedule whose next date has not arrived has
              nothing to record, and a button that refuses is worse than no
              button.
            */}
            {!paused && fixedCost.dueCount > 0 && (
              <Can feature="fixedCosts" action="post">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(event) => {
                    // The row navigates; this one act must not also do that.
                    event.stopPropagation();
                    onPost(fixedCost);
                  }}
                >
                  Catat
                </Button>
              </Can>
            )}
          </span>
        );
      },
    },
  ];
}
