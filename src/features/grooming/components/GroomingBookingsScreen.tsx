"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import {
  Alert,
  Pagination,
  PendingStatTile,
  Spinner,
  formatRangeShort,
} from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";

import {
  countFilters,
  DEFAULT_FILTERS,
  formatMoneyShort,
  matchesFilters,
  matchesLens,
  matchesSearch,
  periodRange,
  sortRows,
  summariseDay,
  summarisePeriod,
  type DateRange,
  type GroomingFilters,
  type GroomingLens,
  type GroomingPeriod,
  type GroomingScope,
} from "../board";
import { MAX_BOOKING_PAGES, useGroomingBoard } from "../hooks/useGroomingBoard";
import { useGroomingCatalog } from "../hooks/useGroomingCatalog";
import { GROOMING_LINE_FALLBACK, useGroomingLine } from "../hooks/useGroomingLine";
import { GroomingBookingsTable } from "./GroomingBookingsTable";
import { GroomingBookingsToolbar } from "./GroomingBookingsToolbar";
import { GroomingModuleHeader } from "./GroomingModuleHeader";
import { GroomingPeriodBar } from "./GroomingPeriodBar";
import { GroomingStatCard } from "./GroomingStatCard";

const PAGE_SIZE = 20;

const PERIOD_WORDS: Record<Exclude<GroomingPeriod, "custom">, string> = {
  today: "hari ini",
  week: "minggu ini",
  month: "bulan ini",
};

const LENS_WORDS: Record<Exclude<GroomingLens, "all">, string> = {
  unbilled: "belum ditagih",
  working: "sedang dikerjakan",
};

/**
 * Layanan › Grooming › Booking — the grooming day sheet, from
 * `buloo-grooming-v3.html`.
 *
 * ─── WHAT THE MOCKUP ASKS FOR THAT IS NOT DRAWN ────────────────────────────
 *
 * Built on the API as it stands (decided 13 September 2026: frontend first).
 * The "Hewan baru" card is a `PendingStatTile`, because nothing marks an
 * animal's first grooming. Neto and Potongan are gone from the first card: a
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
  const line = useGroomingLine();
  const catalog = useGroomingCatalog(line.line?._id ?? null, line.loading);

  const scope = useMemo<GroomingScope | null>(() => {
    if (line.loading || catalog.loading) return null;

    return {
      serviceIds: new Set(catalog.services.map((service) => service._id)),
      lineName: line.line?.name ?? GROOMING_LINE_FALLBACK,
    };
  }, [line.loading, line.line, catalog.loading, catalog.services]);

  const [branchId, setBranchId] = useState("");
  const [period, setPeriod] = useState<GroomingPeriod>("month");
  const [custom, setCustom] = useState<DateRange>({ from: "", to: "" });
  const [filters, setFilters] = useState<GroomingFilters>(DEFAULT_FILTERS);
  const [search, setSearch] = useState("");
  const [lens, setLens] = useState<GroomingLens>("all");
  const [page, setPage] = useState(1);

  const range = useMemo(
    () => (period === "custom" ? custom : periodRange(period)),
    [period, custom],
  );

  const board = useGroomingBoard(scope, branchId, range);

  const filtered = useMemo(
    () => board.periodRows.filter((row) => matchesFilters(row, filters)),
    [board.periodRows, filters],
  );
  const summary = useMemo(() => summarisePeriod(filtered), [filtered]);
  const day = useMemo(
    () =>
      summariseDay(board.todayRows.filter((row) => matchesFilters(row, filters))),
    [board.todayRows, filters],
  );
  const visible = useMemo(
    () =>
      sortRows(
        filtered.filter(
          (row) => matchesLens(row, lens) && matchesSearch(row, search),
        ),
        filters.sort,
      ),
    [filtered, lens, search, filters.sort],
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
              <Link href="/dashboard/booking/new">
                <Plus className="size-4" />
                Booking baru
              </Link>
            </Button>
          </Can>
        }
      />

      <GroomingPeriodBar
        branchId={branchId}
        onBranchChange={(next) => {
          setBranchId(next);
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
      />

      {line.missing && (
        <Alert variant="warning">
          Belum ada lini bisnis bernama Grooming, jadi booking grooming belum bisa
          dipisahkan dari layanan lain. Buat atau ganti nama lini bisnisnya di
          Keuangan › Ringkasan › Lini Bisnis.
        </Alert>
      )}
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
          caption={`${summary.unbilledCount} hewan selesai dikerjakan, belum ditagih`}
          splits={[
            {
              label: "Terlama",
              value:
                summary.oldestUnbilledDays === null
                  ? "—"
                  : `${summary.oldestUnbilledDays} hari`,
            },
          ]}
          pressed={lens === "unbilled"}
          onPress={() => pressLens("unbilled")}
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
        <PendingStatTile
          label="Hewan baru"
          blockedBy="Sistem belum menandai kunjungan grooming pertama tiap hewan."
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
            onChanged={board.replaceBooking}
            emptyMessage={
              narrowed ? (
                "Tidak ada booking grooming yang cocok dengan saringan ini."
              ) : (
                <>
                  Belum ada booking grooming {periodWords}.{" "}
                  <Can feature="bookings" action="create">
                    <Link
                      href="/dashboard/booking/new"
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
