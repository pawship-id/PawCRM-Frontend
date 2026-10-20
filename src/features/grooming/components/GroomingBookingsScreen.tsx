"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Pagination, Spinner, formatRangeShort } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";

import {
  countFilters,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  formatMoneyShort,
  matchesFilters,
  matchesLens,
  matchesSearch,
  periodRange,
  PERIOD_WORDS,
  sortRows,
  summariseDay,
  summariseNewAnimals,
  summarisePeriod,
  type DateRange,
  type GroomingFilters,
  type GroomingLens,
  type GroomingPeriod,
  type GroomingScope,
  type GroomingSort,
} from "../board";
import { MAX_BOOKING_PAGES, useGroomingBoard } from "../hooks/useGroomingBoard";
import { useFirstVisits } from "../hooks/useFirstVisits";
import { useGroomingCatalog } from "../hooks/useGroomingCatalog";
import { GROOMING_LINE } from "../line";
import { GroomingBookingsTable } from "./GroomingBookingsTable";
import { GroomingBookingsToolbar } from "./GroomingBookingsToolbar";
import { GroomingModuleHeader } from "./GroomingModuleHeader";
import { GroomingPeriodBar } from "./GroomingPeriodBar";
import { GroomingStatCard } from "./GroomingStatCard";
import { GROOMING_NEW_BOOKING_PATH } from "../paths";

const PAGE_SIZE = 20;

const LENS_WORDS: Record<Exclude<GroomingLens, "all">, string> = {
  unbilled: "belum ditagih",
  unpulled: "belum ditagih",
  working: "sedang dikerjakan",
};

/**
 * Layanan › Grooming › Booking — the grooming day sheet, from
 * `buloo-grooming-v3.html`.
 *
 * ─── WHAT THE MOCKUP ASKS FOR THAT IS NOT DRAWN ────────────────────────────
 *
 * Built on the API as it stands (decided 13 September 2026: frontend first).
 * "Hewan baru" counts animals whose first grooming ever is on the board — read
 * from `GET /bookings/first-visits` since 12 October 2026, because that first
 * visit may lie before the period. Neto and Potongan are gone from the first card: a
 * booking carries prices, not what was charged. Trips, zones and the travel fee
 * wait for the backend to have them.
 *
 * ─── WHERE EACH CONTROL APPLIES ────────────────────────────────────────────
 *
 * Cabang and Periode reach the server; everything else narrows the loaded
 * period here (see `board.ts` for why). The cards follow Cabang, Periode and
 * the Filter panel, never the search box or the pressed card: a total that
 * shrank while somebody typed a dog's name would be a total of nothing.
 */
export function GroomingBookingsScreen() {
  const catalog = useGroomingCatalog(GROOMING_LINE.serviceKind);

  const scope = useMemo<GroomingScope | null>(() => {
    if (catalog.loading) return null;

    return {
      serviceIds: new Set(catalog.services.map((service) => service._id)),
      lineName: GROOMING_LINE.fallbackName,
    };
  }, [catalog.loading, catalog.services]);

  /** Empty = every cabang. Several since 12 October 2026. */
  const [branchIds, setBranchIds] = useState<string[]>([]);
  const [period, setPeriod] = useState<GroomingPeriod>("month");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const [filters, setFilters] = useState<GroomingFilters>(DEFAULT_FILTERS);
  /* From the table's headers; outside `filters`, so the panel's Reset keeps it. */
  const [sort, setSort] = useState<GroomingSort>(DEFAULT_SORT);
  const [search, setSearch] = useState("");
  const [lens, setLens] = useState<GroomingLens>("all");
  const [page, setPage] = useState(1);

  const range = useMemo(
    () => (period === "custom" ? custom : periodRange(period)),
    [period, custom],
  );

  const board = useGroomingBoard(scope, branchIds, range);
  const firstVisits = useFirstVisits(scope, branchIds, range);

  /*
    "RESET FILTER (n)" ON THE SCOPE ROW (12 October 2026, on request) — the
    button Penjualan's tabs wear. The period counts only off its default, Bulan
    ini, which is where Reset returns it.
  */
  const scopeCount =
    (branchIds.length > 0 ? 1 : 0) + (period !== "month" ? 1 : 0);

  const filtered = useMemo(
    () => board.periodRows.filter((row) => matchesFilters(row, filters)),
    [board.periodRows, filters],
  );
  const summary = useMemo(() => summarisePeriod(filtered), [filtered]);
  const animals = useMemo(
    () =>
      firstVisits.firstBookingIds
        ? summariseNewAnimals(filtered, firstVisits.firstBookingIds)
        : null,
    [filtered, firstVisits.firstBookingIds],
  );
  const day = useMemo(
    () =>
      summariseDay(
        board.todayRows.filter((row) => matchesFilters(row, filters)),
      ),
    [board.todayRows, filters],
  );
  const visible = useMemo(
    () =>
      sortRows(
        filtered.filter(
          (row) => matchesLens(row, lens) && matchesSearch(row, search),
        ),
        sort,
      ),
    [filtered, lens, search, sort],
  );

  const totalPages = Math.ceil(visible.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const pageRows = visible.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const periodWords =
    period === "custom"
      ? formatRangeShort(custom.from, custom.to)
      : PERIOD_WORDS[period];

  function pressLens(next: Exclude<GroomingLens, "all">) {
    setLens((current) => (current === next ? "all" : next));
    setPage(1);
  }

  const narrowed =
    lens !== "all" || search.trim() !== "" || countFilters(filters) > 0;

  return (
    <div className="flex flex-col gap-6">
      <GroomingModuleHeader
        action={
          <Can feature="bookings" action="create">
            <Button asChild>
              <Link href={GROOMING_NEW_BOOKING_PATH}>
                <Plus className="size-4" />
                Booking baru
              </Link>
            </Button>
          </Can>
        }
      />

      <GroomingPeriodBar
        branchIds={branchIds}
        onBranchesChange={(next) => {
          setBranchIds(next);
          setPage(1);
        }}
        period={period}
        customRange={custom}
        onPeriodChange={(next) => {
          setPeriod(next);
          setPage(1);
        }}
        onCustomRange={(next) => {
          // The range's own Reset hands back two empty ends: back to the default.
          if (!next.from && !next.to) {
            setPeriod("month");
          } else {
            setCustom(next);
            setPeriod("custom");
          }
          setPage(1);
        }}
        trailing={
          scopeCount > 0 ? (
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() => {
                setBranchIds([]);
                setPeriod("month");
                setPage(1);
              }}
            >
              Reset filter ({scopeCount})
            </Button>
          ) : undefined
        }
      />

      {board.error && <Alert variant="error">{board.error}</Alert>}
      {board.truncated && (
        <Alert variant="warning">
          Periode ini berisi lebih dari {MAX_BOOKING_PAGES * 100} booking, jadi
          yang dihitung hanya sebagian. Persempit tanggalnya supaya angkanya
          lengkap.
        </Alert>
      )}

      <section
        aria-label="Ringkasan grooming"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <GroomingStatCard
          label="Nilai booking"
          value={formatMoneyShort(summary.value)}
          caption={`${summary.bookings} booking ${periodWords} · sebelum diskon`}
          splits={[
            {
              label: "Rata-rata per hewan",
              value: summary.averagePerAnimal
                ? formatMoneyShort(summary.averagePerAnimal)
                : "—",
            },
            {
              label: "Pakai add-on",
              value: summary.addonRate === null ? "—" : `${summary.addonRate}%`,
            },
          ]}
          loading={board.loading}
          error={board.error !== null}
        />
        <GroomingStatCard
          label="Belum ditagih"
          tone={summary.unbilledCount > 0 ? "danger" : "default"}
          value={formatMoneyShort(summary.unbilledValue)}
          caption={`${summary.unbilledCount} booking belum masuk kasir atau faktur`}
          splits={[
            {
              label: "Terlama",
              value:
                summary.oldestUnbilledDays === null
                  ? "—"
                  : `${summary.oldestUnbilledDays} hari`,
            },
          ]}
          pressed={lens === "unpulled"}
          onPress={() => pressLens("unpulled")}
          loading={board.loading}
          error={board.error !== null}
        />
        <GroomingStatCard
          label="Sedang dikerjakan"
          tone="warning"
          value={formatMoneyShort(day.workingValue)}
          caption={`${day.working} hewan di meja groomer`}
          splits={[
            { label: "Antre", value: String(day.queued) },
            { label: "Selesai", value: String(day.finished) },
            { label: "Belum pasti", value: String(day.unconfirmed) },
          ]}
          footnote="Hari ini · tidak ikut periode"
          pressed={lens === "working"}
          onPress={() => pressLens("working")}
          loading={board.todayLoading}
          error={board.todayError}
        />
        <GroomingStatCard
          label="Hewan baru"
          value={String(animals?.newAnimals ?? 0)}
          caption={`hewan pertama kali grooming ${periodWords}`}
          splits={[
            {
              label: "Total hewan",
              value: String(animals?.animals ?? 0),
            },
            {
              label: "Kembali lagi",
              value: String(animals?.returning ?? 0),
            },
          ]}
          loading={board.loading || firstVisits.loading}
          error={board.error !== null || firstVisits.failed}
        />
      </section>

      <GroomingBookingsToolbar
        search={search}
        onSearch={(next) => {
          setSearch(next);
          setPage(1);
        }}
        filters={filters}
        onFilters={(next) => {
          setFilters(next);
          setPage(1);
        }}
        services={catalog.services}
      />

      {!board.loading && (
        <p className="text-sm text-muted">
          <span className="tabular-nums">{visible.length}</span> booking
          {lens !== "all" && ` · disaring: ${LENS_WORDS[lens]}`}
          {lens !== "all" && (
            <>
              {" "}
              <button
                type="button"
                onClick={() => pressLens(lens)}
                className="rounded font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                Hapus saringan
              </button>
            </>
          )}
        </p>
      )}

      {board.loading && board.periodRows.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat booking grooming…
        </div>
      ) : (
        <>
          <GroomingBookingsTable
            rows={pageRows}
            loading={board.loading}
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            onChanged={board.replaceBooking}
            emptyMessage={
              narrowed ? (
                "Tidak ada booking grooming yang cocok dengan saringan ini."
              ) : (
                <>
                  Belum ada booking grooming {periodWords}.{" "}
                  <Can feature="bookings" action="create">
                    <Link
                      href={GROOMING_NEW_BOOKING_PATH}
                      className="font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      Tambah yang pertama →
                    </Link>
                  </Can>
                </>
              )
            }
          />
          <Pagination
            page={currentPage}
            totalPages={totalPages}
            total={visible.length}
            unit="booking"
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}
