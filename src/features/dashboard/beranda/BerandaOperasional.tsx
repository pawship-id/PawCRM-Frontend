"use client";

import { useMemo } from "react";
import { BarChart3, ClipboardList, UserRound } from "lucide-react";

import { Alert, PendingStatTile, StatTile } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { bookingStatusLabel } from "@/features/booking";
import { MAX_BOOKING_PAGES } from "@/features/booking/listAll";
import { usePermissions } from "@/features/permissions";
import { reportService } from "@/services/report.service";
import { formatMoneyShort, sumDecimals } from "@/utils/decimal";

import { useBerandaScope } from "./BerandaShell";
import { BarList, Panel, TileGrid } from "./parts";
import { useBookingsIn } from "./useBookingsIn";
import { useRemote } from "./useRemote";

const pct = (part: number, whole: number) =>
  whole > 0
    ? `${((part / whole) * 100).toLocaleString("id-ID", { maximumFractionDigits: 0 })}%`
    : "—";

/**
 * Beranda › Operasional — how the work went over the period: who did it, when
 * the shop was busiest, what was booked and how much of it fell through.
 *
 * EVERYTHING HERE IS READ OFF ONE LIST — the period's bookings, the same rows
 * Kalender draws — so the table, the chart and the lists cannot disagree.
 *
 * KOMISI ONLY FOR ONE MONTH. The recap endpoint is payroll and takes a month
 * (`YYYY-MM`) and a single cabang; for any other scope the column says "—"
 * rather than adding up something the server never answered.
 */
export function BerandaOperasional() {
  const { branchIds, dateFrom, dateTo } = useBerandaScope();
  const { can } = usePermissions();

  const bookings = useBookingsIn(branchIds, dateFrom, dateTo, true);
  const live = useMemo(
    () => bookings.rows.filter((row) => row.booking.status !== "cancelled"),
    [bookings.rows],
  );

  const month =
    dateFrom && dateTo && dateFrom.slice(0, 7) === dateTo.slice(0, 7)
      ? dateFrom.slice(0, 7)
      : null;
  const readsCommissions = (can("commissionReports", "read") || can("users", "read")) && month !== null && branchIds.length <= 1;
  const recap = useRemote(
    `recap|${month}|${branchIds.join(",")}`,
    () =>
      reportService.commissions({
        period: month ?? undefined,
        branchId: branchIds[0],
      }),
    readsCommissions,
  );

  /* ---- tiles ---- */
  const total = bookings.rows.length;
  const cancelled = total - live.length;
  const rescheduled = bookings.rows.filter((row) =>
    row.booking.statusHistory?.some((event) => event.status === "rescheduled"),
  ).length;

  const perCustomer = new Map<string, number>();
  for (const row of live) {
    const id = row.booking.customerId;
    perCustomer.set(id, (perCustomer.get(id) ?? 0) + 1);
  }
  const returning = [...perCustomer.values()].filter((n) => n >= 2).length;

  /* ---- staff ---- */
  const staff = useMemo(() => {
    const byGroomer = new Map<
      string,
      { name: string; orders: number; values: string[] }
    >();
    for (const row of live) {
      for (const who of row.groomers) {
        const entry = byGroomer.get(who._id) ?? {
          name: who.name,
          orders: 0,
          values: [],
        };
        entry.orders += 1;
        entry.values.push(row.value);
        byGroomer.set(who._id, entry);
      }
    }
    return [...byGroomer.entries()]
      .map(([id, entry]) => ({
        id,
        name: entry.name,
        orders: entry.orders,
        value: sumDecimals(entry.values),
      }))
      .sort((a, b) => b.orders - a.orders);
  }, [live]);

  const commissionOf = new Map(
    (recap.data?.rows ?? []).map((row) => [row.groomerUserId, row.amount]),
  );

  /* ---- busiest hours ---- */
  const hours = useMemo(() => {
    const counts = new Map<number, number>();
    for (const row of live) {
      const hour = Math.floor(row.minutes / 60);
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    }
    if (counts.size === 0) return [];
    const first = Math.min(...counts.keys());
    const last = Math.max(...counts.keys());
    return Array.from({ length: last - first + 1 }, (_, i) => ({
      hour: first + i,
      count: counts.get(first + i) ?? 0,
    }));
  }, [live]);
  const peak = Math.max(0, ...hours.map((h) => h.count));

  /* ---- distributions ---- */
  const statuses = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of bookings.rows) {
      const label = bookingStatusLabel(row.booking.status);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, display: `${value}` }))
      .sort((a, b) => b.value - a.value);
  }, [bookings.rows]);

  const services = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of live) {
      counts.set(row.service.name, (counts.get(row.service.name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, value]) => ({ label, value, display: `${value}` }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [live]);

  const state = { loading: bookings.loading, error: bookings.failed };

  return (
    <div className="flex flex-col gap-6">
      {bookings.truncated && (
        <Alert variant="warning">
          Periode ini berisi lebih dari {MAX_BOOKING_PAGES * 100} booking, jadi
          angka di bawah hanya dari sebagian. Persempit periodenya supaya
          lengkap.
        </Alert>
      )}

      <TileGrid>
        <PendingStatTile
          label="Okupansi hotel"
          blockedBy="Kamar belum ada di sistem."
        />
        <PendingStatTile
          label="Selesai tepat waktu"
          blockedBy="Jam selesai belum dibandingkan dengan estimasi."
        />
        <StatTile
          label="Pelanggan kembali"
          value={pct(returning, perCustomer.size)}
          caption={`${returning} dari ${perCustomer.size} pelanggan`}
          hint="Pelanggan yang booking dua kali atau lebih di periode ini, dibagi semua pelanggan yang booking di periode ini."
          {...state}
        />
        <StatTile
          label="Batal & reschedule"
          value={pct(cancelled + rescheduled, total)}
          caption={`${cancelled} batal · ${rescheduled} jadwal ulang`}
          hint="Booking yang dibatalkan atau pernah dijadwal ulang, dibagi semua booking di periode ini."
          {...state}
        />
      </TileGrid>

      <Panel icon={UserRound} title="Performa staf" tag="Periode berjalan">
        {bookings.failed ? (
          <Alert variant="error">Booking periode ini tidak bisa dimuat.</Alert>
        ) : staff.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            {bookings.loading
              ? "Memuat…"
              : "Belum ada booking dengan groomer di periode ini."}
          </p>
        ) : (
          <>
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Staf</TableHead>
                    <TableHead className="text-right">Order</TableHead>
                    <TableHead className="text-right">Nilai layanan</TableHead>
                    <TableHead className="text-right">Komisi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staff.map((who) => (
                    <TableRow key={who.id}>
                      <TableCell className="font-bold">{who.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {who.orders}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoneyShort(who.value)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {readsCommissions && !recap.loading
                          ? formatMoneyShort(commissionOf.get(who.id) ?? "0")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="mt-3 text-xs text-muted">
              Nilai layanan sebelum diskon; booking yang dikerjakan berdua
              dihitung penuh di masing-masing groomer.
              {readsCommissions
                ? ""
                : " Komisi tampil kalau periodenya satu bulan dan cabangnya satu."}
            </p>
          </>
        )}
      </Panel>

      <Panel icon={BarChart3} tone="orange" title="Jam tersibuk" tag="Booking per jam mulai">
        {hours.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">
            {bookings.loading ? "Memuat…" : "Belum ada booking di periode ini."}
          </p>
        ) : (
          <ol
            aria-label="Jumlah booking per jam"
            className="flex h-44 items-end gap-1.5"
          >
            {hours.map(({ hour, count }) => (
              <li
                key={hour}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
              >
                <span className="text-xs font-semibold text-muted tabular-nums">
                  {count}
                </span>
                <span
                  aria-hidden
                  className={
                    count === peak && peak > 0
                      ? "w-full max-w-10 rounded-t-md bg-chart-net"
                      : "w-full max-w-10 rounded-t-md bg-chart-gross"
                  }
                  style={{ height: `${peak ? (count / peak) * 100 : 0}%` }}
                />
                <span className="text-xs text-muted tabular-nums">
                  <span className="sr-only">jam </span>
                  {String(hour).padStart(2, "0")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon={ClipboardList} title="Distribusi status booking">
          <BarList
            title="Booking"
            rows={statuses}
            empty="Belum ada booking di periode ini."
          />
        </Panel>
        <Panel icon={ClipboardList} title="Layanan terlaris">
          <BarList
            title="Booking"
            rows={services}
            empty="Belum ada booking di periode ini."
          />
        </Panel>
      </div>
    </div>
  );
}
