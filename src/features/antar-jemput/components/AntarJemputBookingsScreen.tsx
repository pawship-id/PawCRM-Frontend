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
  formatMoneyShort,
  matchesFilters,
  matchesLens,
  matchesSearch,
  periodRange,
  sortRows,
  summariseDay,
  type DateRange,
  type GroomingFilters,
  type GroomingLens,
  type GroomingPeriod,
  type GroomingScope,
} from "@/features/grooming/board";
import { GroomingBookingsToolbar } from "@/features/grooming/components/GroomingBookingsToolbar";
import { GroomingModuleHeader } from "@/features/grooming/components/GroomingModuleHeader";
import { GroomingPeriodBar } from "@/features/grooming/components/GroomingPeriodBar";
import { GroomingStatCard } from "@/features/grooming/components/GroomingStatCard";
import { MAX_BOOKING_PAGES, useGroomingBoard } from "@/features/grooming/hooks/useGroomingBoard";
import { useGroomingCatalog } from "@/features/grooming/hooks/useGroomingCatalog";
import { useGroomingLine } from "@/features/grooming/hooks/useGroomingLine";

import { summariseRides } from "../board";
import { ANTAR_JEMPUT_LINE } from "../line";
import { ANTAR_JEMPUT_NEW_PATH } from "../paths";
import { AntarJemputBookingsTable } from "./AntarJemputBookingsTable";

const PAGE_SIZE = 20;

const PERIOD_WORDS: Record<Exclude<GroomingPeriod, "custom">, string> = {
  today: "hari ini",
  week: "minggu ini",
  month: "bulan ini",
};

const LENS_WORDS: Record<Exclude<GroomingLens, "all">, string> = {
  unbilled: "belum ditagih",
  working: "sedang jalan",
};

/**
 * Layanan › Antar-Jemput › Booking — from `buloo-antar-jemput-v5.html` and BO's
 * notes of 21 September 2026.
 *
 * GROOMING'S BOARD, FOR RIDES. Cabang and Periode reach the server; the search
 * and the Filter panel are Grooming's own (note 5) — with Driver for Groomer
 * and Arah for Tempat — and the two pressable cards narrow the table the same
 * way. The rows are the same arithmetic (`features/grooming/board.ts`), read
 * for the Antar-Jemput line plus any booking that is a ride.
 *
 * ─── THE FOUR CARDS ─────────────────────────────────────────────────────────
 *
 * Nilai antar-jemput (after discount, with Bruto and Diskon under it) · Belum
 * ditagih (a lens) · Sedang jalan (today, a lens — a ride In Progress is a van
 * on the road) · Jumlah hewan (every animal carried, passengers included).
 *
 * STATUSES ARE THE BOOKING'S OWN LADDER, not the mockup's four: "On the Way" is
 * In Progress and "Arrived" is Completed, moved by the same control Grooming's
 * rows carry.
 *
 * A ROW OPENS THE BOOKING (23 September 2026, on request) rather than unfolding
 * under itself the way Grooming's board does — see `AntarJemputBookingsTable`.
 */
export function AntarJemputBookingsScreen() {
  const line = useGroomingLine(ANTAR_JEMPUT_LINE);
  const catalog = useGroomingCatalog(line.line?._id ?? null, line.loading);

  const scope = useMemo<GroomingScope | null>(() => {
    if (line.loading || catalog.loading) return null;

    return {
      serviceIds: new Set(catalog.services.map((service) => service._id)),
      lineName: line.line?.name ?? ANTAR_JEMPUT_LINE.fallbackName,
      /* A ride is a ride, whatever line its service was moved to since. */
      includes: (booking) => Boolean(booking.tripLeg),
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
  const summary = useMemo(() => summariseRides(filtered), [filtered]);
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
        line={ANTAR_JEMPUT_LINE}
        action={
          <Can feature="bookings" action="create">
            <Button asChild>
              <Link href={ANTAR_JEMPUT_NEW_PATH}>
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
          Belum ada lini bisnis bernama Antar-Jemput, jadi layanan antar-jemput
          belum bisa dipisahkan dari layanan lain. Buat atau ganti nama lini
          bisnisnya di Keuangan › Ringkasan › Lini Bisnis. Booking yang sudah
          punya arah tetap tampil di sini.
        </Alert>
      )}
      {board.error && (
        <Alert variant="error">
          Booking antar-jemput tidak bisa dimuat. Coba muat ulang halaman.
        </Alert>
      )}
      {board.truncated && (
        <Alert variant="warning">
          Periode ini berisi lebih dari {MAX_BOOKING_PAGES * 100} booking, jadi
          yang dihitung hanya sebagian. Persempit tanggalnya supaya angkanya
          lengkap.
        </Alert>
      )}

      <section
        aria-label="Ringkasan antar-jemput"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <GroomingStatCard
          label="Nilai antar-jemput"
          value={formatMoneyShort(summary.net)}
          caption={`${summary.bookings} booking ${periodWords}${
            summary.averagePerRide
              ? ` · rata-rata ${formatMoneyShort(summary.averagePerRide)}`
              : ""
          }`}
          splits={[
            { label: "Bruto", value: formatMoneyShort(summary.gross) },
            { label: "Diskon", value: formatMoneyShort(summary.discount) },
          ]}
          loading={board.loading}
          error={board.error !== null}
        />
        <GroomingStatCard
          label="Belum ditagih"
          tone={summary.unbilledCount > 0 ? "danger" : "default"}
          value={String(summary.unbilledCount)}
          caption={`selesai, belum ada faktur · ${formatMoneyShort(summary.unbilledValue)}`}
          pressed={lens === "unbilled"}
          onPress={() => pressLens("unbilled")}
          loading={board.loading}
          error={board.error !== null}
        />
        <GroomingStatCard
          label="Sedang jalan"
          tone="warning"
          value={String(day.working)}
          caption="In Progress — driver di jalan"
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
          label="Jumlah hewan"
          value={String(summary.animals)}
          caption={`${summary.customers} pelanggan dilayani`}
          loading={board.loading}
          error={board.error !== null}
        />
      </section>

      <GroomingBookingsToolbar
        kind="antar-jemput"
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
          <Spinner /> Memuat booking antar-jemput…
        </div>
      ) : (
        <>
          <AntarJemputBookingsTable
            rows={pageRows}
            loading={board.loading}
            onChanged={board.replaceBooking}
            emptyMessage={
              narrowed ? (
                "Tidak ada booking antar-jemput yang cocok dengan saringan ini."
              ) : (
                <>
                  Belum ada booking antar-jemput {periodWords}.{" "}
                  <Can feature="bookings" action="create">
                    <Link
                      href={ANTAR_JEMPUT_NEW_PATH}
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
      <p className="text-xs text-muted">
        Klik baris untuk membuka halaman booking — rute, tahapan, rincian
        harga, booking terkait, riwayat, dan faktur. Status bisa diubah langsung
        dari barisnya.
      </p>
    </div>
  );
}
