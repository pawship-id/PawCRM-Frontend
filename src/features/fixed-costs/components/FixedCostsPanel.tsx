"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Plus, RotateCcw } from "lucide-react";

import {
  Alert,
  Card,
  FilterBar,
  FilterSearch,
  FilterSelect,
  HighlightText,
  ListFooter,
  Spinner,
  withAll,
  type FilterOption,
} from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

/** Tipe · Nama · Kategori · Jumlah · Jatuh Tempo · Akun · Status. */
const COLUMN_COUNT = 7;

/**
 * THE FIVE COLUMNS THE HEADER CAN ORDER BY, from the mockup's own `BT_SORT_COLS`
 * — minus the two it sorts client-side over a five-row array and the server
 * cannot: Tipe and Kategori.
 *
 * Tipe is a two-valued badge, so ordering by it is the Tipe FILTER with extra
 * steps. Kategori is assembled at render time from however many counter
 * accounts a row has, so any field the server could sort would order the rows
 * by something other than the text somebody is reading — the same rule the
 * Transaksi table's Deskripsi and Akun columns follow.
 */
const SORTABLE: Record<string, { asc: FixedCostSort; desc: FixedCostSort }> = {
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
    { value: "paused", label: "Nonaktif" },
  ],
  "Termasuk nonaktif",
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
  const {
    fixedCosts,
    pagination,
    query,
    loading,
    error,
    setQuery,
    refetch,
  } = state;

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
        <h2 className="text-xs font-semibold tracking-widest text-muted uppercase">
          Biaya tetap
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
            onChange={(kind) =>
              setQuery({ kind: kind as typeof query.kind })
            }
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

        {loading && fixedCosts.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
            <Spinner /> Memuat biaya tetap…
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <Table className={loading ? "opacity-60" : undefined}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipe</TableHead>
                    <SortHead
                      column="nama"
                      label="Nama"
                      sort={query.sort}
                      onSort={(sort) => setQuery({ sort, page: 1 })}
                    />
                    <TableHead>Kategori</TableHead>
                    <SortHead
                      column="jumlah"
                      label="Jumlah"
                      align="right"
                      sort={query.sort}
                      onSort={(sort) => setQuery({ sort, page: 1 })}
                    />
                    <SortHead
                      column="jatuhTempo"
                      label="Jatuh tempo"
                      sort={query.sort}
                      onSort={(sort) => setQuery({ sort, page: 1 })}
                    />
                    <TableHead>Akun</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fixedCosts.length === 0 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={COLUMN_COUNT}
                        className="px-4 py-16 text-center"
                      >
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
                      </TableCell>
                    </TableRow>
                  )}

                  {fixedCosts.map((fixedCost) => (
                    <FixedCostRow
                      key={fixedCost._id}
                      fixedCost={fixedCost}
                      search={query.search}
                      onOpen={() => router.push(fixedCostHref(fixedCost._id))}
                      onPost={() => setPosting(fixedCost)}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>

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
          </>
        )}

        {/*
          THE MOCKUP'S FOOTNOTE, corrected. It says a fixed cost is made through
          "+ Tambah Transaksi" with a toggle — this build gives it a form of its
          own, because the toggle would conflate "pay this now" with "expect it
          every month", and a template with no occurrence posted yet is a real
          and ordinary state. The rest of the sentence still holds.
        */}
        <p className="text-xs text-muted">
          Daftar ini menunjukkan yang berulang — masuk maupun keluar. Penjadwal
          otomatisnya belum ada, jadi tiap jatuh tempo dicatat lewat tombol{" "}
          <span className="font-semibold text-foreground">Catat</span>, dan
          transaksinya masuk ke tab Transaksi seperti biasa.
        </p>
      </div>

      <PostOccurrenceDialog
        fixedCost={posting}
        onClose={() => setPosting(null)}
        onPosted={refetch}
      />
    </Card>
  );
}

/**
 * A column header that orders the list — first click takes the column's natural
 * direction, second flips it. The arrow is on every sortable header, greyed
 * when that column is not the active one, so the row says which columns can be
 * clicked rather than only which one is on (§8).
 */
function SortHead({
  column,
  label,
  align = "left",
  sort,
  onSort,
}: {
  column: keyof typeof SORTABLE;
  label: string;
  align?: "left" | "right";
  sort: FixedCostSort;
  onSort: (next: FixedCostSort) => void;
}) {
  const { asc, desc } = SORTABLE[column];
  const active = sort === asc ? "asc" : sort === desc ? "desc" : null;
  const Icon =
    active === "asc" ? ArrowUp : active === "desc" ? ArrowDown : ChevronsUpDown;

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active === "asc"
          ? "ascending"
          : active === "desc"
            ? "descending"
            : "none"
      }
    >
      <button
        type="button"
        // `asc` on a name, where A is the top of the list; `asc` on the due date
        // too, because the soonest is what somebody opens a schedule for.
        onClick={() => onSort(active === "asc" ? desc : asc)}
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

function FixedCostRow({
  fixedCost,
  search,
  onOpen,
  onPost,
}: {
  fixedCost: FixedCost;
  search: string;
  onOpen: () => void;
  onPost: () => void;
}) {
  const masuk = fixedCost.direction === "in";
  const paused = !fixedCost.isActive;
  const due = dueLabel(fixedCost);
  const category = categoryLabel(fixedCost.counterAccounts);

  return (
    // The whole row opens the schedule, as the Transaksi table's rows do; the
    // name is the keyboard's way in.
    <TableRow
      onClick={onOpen}
      className={cn("cursor-pointer", paused && "text-muted")}
    >
      <TableCell className="px-4 py-2.5 whitespace-nowrap">
        {/*
          A WORD, NOT A COLOUR (§1.3). The mockup tints the Masuk badge green
          and leaves Keluar grey; both carry their label either way.
        */}
        <Badge variant="outline" className={cn(masuk && "text-success")}>
          {KIND_BADGE[fixedCost.kind]}
        </Badge>
      </TableCell>

      <TableCell className="max-w-xs px-4 py-2.5">
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
      </TableCell>

      <TableCell className="max-w-44 px-4 py-2.5 text-sm">
        {category ?? <span className="text-muted">—</span>}
      </TableCell>

      {/*
        UNSIGNED, unlike the Transaksi table's amount. Nothing here has moved:
        a signed figure would read as money that went out, and this column is
        "how much it will be".
      */}
      <TableCell
        className={cn(
          "px-4 py-2.5 text-right text-sm font-semibold tabular-nums whitespace-nowrap",
          masuk && !paused && "text-success",
        )}
      >
        {formatMoney(fixedCost.amount)}
      </TableCell>

      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap tabular-nums">
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
      </TableCell>

      <TableCell className="px-4 py-2.5 text-sm whitespace-nowrap">
        {fixedCost.accountName ?? "—"}
      </TableCell>

      <TableCell className="px-4 py-2.5 whitespace-nowrap">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
              paused
                ? "bg-tint-neutral text-muted"
                : "bg-tint-success text-success",
            )}
          >
            {paused ? "Nonaktif" : "Aktif"}
          </span>

          {/*
            THE BUTTON THE MOCKUP DOES NOT HAVE, and the honest substitute for
            the automation it promises. Offered only while something is actually
            due — a schedule whose next date has not arrived has nothing to
            record, and a button that refuses is worse than no button.
          */}
          {!paused && fixedCost.dueCount > 0 && (
            <Can feature="fixedCosts" action="post">
              <Button
                variant="secondary"
                size="sm"
                onClick={(event) => {
                  // The row navigates; this one act must not also do that.
                  event.stopPropagation();
                  onPost();
                }}
              >
                Catat
              </Button>
            </Can>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
}
