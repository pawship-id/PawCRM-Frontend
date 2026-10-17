"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, Coins, PawPrint, UserRound } from "lucide-react";

import { ActionGroup, Alert, StatTile } from "@/components";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BookingStatusBadge } from "@/features/booking";
import { clockOf, endOfMonth } from "@/features/booking/day";
import { useExpiringAlert, useLowStockAlert } from "@/features/inventory";
import {
  MEMBERSHIP_RENEWALS_HREF,
  cardHref,
} from "@/features/memberships/labels";
import { usePermissions } from "@/features/permissions";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import { customerService } from "@/services/customer.service";
import { membershipService } from "@/services/membership.service";
import { posService } from "@/services/pos.service";
import { formatMoney, formatMoneyShort } from "@/utils/decimal";

import { useBerandaScope } from "./BerandaShell";
import { Panel, TileGrid } from "./parts";
import { DONE_STATUSES, OPEN_STATUSES, useBookingsIn } from "./useBookingsIn";
import { useRemote } from "./useRemote";

/** How many rows each "Perlu tindakan" group shows before "Lihat semua". */
const ROWS = 3;
/** "Belum datang 30+ hari" — the mockup's own window. */
const DORMANT_DAYS = 30;

const DATE = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const dateOf = (iso: string) => DATE.format(new Date(iso));

/** Whole days from `iso` to today, local. */
function daysSince(iso: string, today: string): number {
  const from = new Date(iso.slice(0, 10));
  const to = new Date(today);
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * Beranda › Hari Ini — what somebody has to do today: four figures, the
 * "Perlu tindakan" list, and every booking on today's schedule.
 *
 * EACH CARD ASKS FOR ITS OWN GRANT and degrades on its own. A cashier who may
 * not read invoices still gets the schedule; a card they may not read is not
 * drawn rather than drawn as a refusal.
 *
 * TODAY, ALWAYS — the shell draws no Periode chips on this tab. Cabang applies
 * where the endpoint takes one; membership and dormant customers are
 * tenant-wide on the server.
 */
export function BerandaHariIni() {
  const { today, branchIds } = useBerandaScope();
  const { can } = usePermissions();
  const branchKey = branchIds.join(",");

  const readsBookings = can("bookings", "read");
  const readsInvoices = can("customerInvoices", "read");
  const readsShifts = can("posShifts", "read");
  const readsProducts = can("products", "read");
  const readsBatches = can("productBatches", "read");
  const readsMemberships = can("petMemberships", "read");
  const readsCustomers = can("customers", "read");

  const bookings = useBookingsIn(branchIds, today, today, readsBookings);

  const sales = useRemote(
    `sales|${branchKey}|${today}`,
    () =>
      customerInvoiceService.summary({
        period: "today",
        branchIds: branchIds.length ? branchIds : undefined,
      }),
    readsInvoices,
  );

  /*
    TODAY'S SHIFTS, as two counts: all of them, and the ones still open.
    `branchId` is single on this endpoint, so several picked cabang are asked
    one by one and added up; `limit: 1` because only the totals are read.
  */
  const shifts = useRemote(
    `shifts|${branchKey}|${today}`,
    async () => {
      const opened = {
        openedFrom: new Date(`${today}T00:00:00`).toISOString(),
        openedTo: new Date(`${today}T23:59:59.999`).toISOString(),
      };
      const scopes = branchIds.length ? branchIds : [undefined];
      const counts = await Promise.all(
        scopes.map(async (branchId) => {
          const [all, open] = await Promise.all([
            posService.listShifts({ ...opened, branchId, limit: 1 }),
            posService.listShifts({
              ...opened,
              branchId,
              status: "open",
              limit: 1,
            }),
          ]);
          return { total: all.pagination.total, open: open.pagination.total };
        }),
      );
      return counts.reduce(
        (sum, c) => ({ total: sum.total + c.total, open: sum.open + c.open }),
        { total: 0, open: 0 },
      );
    },
    readsShifts,
  );

  const lowStock = useLowStockAlert(readsProducts, [], branchIds);
  const expiring = useExpiringAlert(readsBatches, [], branchIds);

  const memberships = useRemote(
    `memberships|${today}`,
    () =>
      membershipService.expiring({
        limit: ROWS,
        // Days left in this month — "habis bulan ini". At least one, so the
        // last day of the month still asks for today's.
        withinDays: Math.max(1, daysSince(today, endOfMonth(today))),
      }),
    readsMemberships,
  );

  const overdue = useRemote(
    `overdue|${branchKey}|${today}`,
    () =>
      customerInvoiceService.list({
        overdue: true,
        sort: "dueSoonest",
        limit: ROWS,
        branchIds: branchIds.length ? branchIds : undefined,
      }),
    readsInvoices,
  );

  const dormant = useRemote(
    `dormant|${today}`,
    () => customerService.dormant({ days: DORMANT_DAYS, limit: ROWS }),
    readsCustomers,
  );

  const live = bookings.rows.filter(
    (row) => row.booking.status !== "cancelled",
  );
  const working = live.filter(
    (row) => row.booking.status === "in_progress",
  ).length;
  const done = live.filter((row) =>
    DONE_STATUSES.has(row.booking.status),
  ).length;

  /* NOBODY ON ANY TURN, and the work is still ahead — a finished booking with
     no groomer recorded is a bookkeeping gap, not something to assign today. */
  const unassigned = useMemo(
    () =>
      bookings.rows
        .filter(
          (row) =>
            row.groomers.length === 0 && OPEN_STATUSES.has(row.booking.status),
        )
        .sort((a, b) => a.minutes - b.minutes),
    [bookings.rows],
  );

  const schedule = useMemo(
    () => [...bookings.rows].sort((a, b) => a.minutes - b.minutes),
    [bookings.rows],
  );

  const openShifts = shifts.data?.open ?? 0;
  const allShifts = shifts.data?.total ?? 0;
  const closedShifts = allShifts - openShifts;

  return (
    <div className="flex flex-col gap-6">
      <TileGrid>
        {readsBookings && (
          <StatTile
            label="Booking hari ini"
            value={String(live.length)}
            caption={`${working} dikerjakan · ${done} selesai`}
            loading={bookings.loading}
            error={bookings.failed}
          />
        )}
        {readsInvoices && (
          <StatTile
            label="Omzet hari ini"
            value={formatMoneyShort(sales.data?.revenue.amount ?? "0")}
            caption={`${sales.data?.revenue.invoiceCount ?? 0} faktur`}
            hint="Total faktur yang terbit hari ini — dari kasir maupun dibuat manual — sebelum pembayaran."
            loading={sales.loading}
            error={sales.failed}
          />
        )}
        {readsShifts && (
          <StatTile
            label="Shift kasir"
            value={`${closedShifts} / ${allShifts}`}
            caption={
              openShifts > 0
                ? `${openShifts} shift belum ditutup`
                : "semua shift sudah ditutup"
            }
            hint="Shift yang dibuka hari ini, berapa yang sudah ditutup. Shift yang belum ditutup tidak masuk rekonsiliasi kas hari ini."
            loading={shifts.loading}
            error={shifts.failed}
          />
        )}
        {readsProducts && (
          <StatTile
            label="Stok kritis"
            value={`${lowStock.total} SKU`}
            caption={
              readsBatches
                ? `${expiring.total} mendekati kedaluwarsa`
                : "di bawah batas minimum"
            }
            tone={lowStock.total > 0 ? "danger" : "plain"}
            loading={lowStock.loading}
            error={lowStock.error !== null}
          />
        )}
      </TileGrid>

      <Panel icon={AlertTriangle} tone="red" title="Perlu tindakan" tag="Cabang aktif">
        <div className="flex flex-col gap-2.5">
          {readsBookings && (
            <ActionGroup
              icon={PawPrint}
              tone="bad"
              title="Booking hari ini belum ada PIC"
              count={unassigned.length}
              loading={bookings.loading}
              failed={bookings.failed}
              empty="Semua booking hari ini sudah ada PIC-nya."
              rows={unassigned.slice(0, ROWS).map((row) => ({
                key: row.key,
                title: (
                  <>
                    <span className="tabular-nums">
                      {clockOf(row.booking.scheduledAt)}
                    </span>{" "}
                    · {row.booking.petName} — {row.service.name}
                  </>
                ),
                detail: `${row.booking.customerName} · ${row.line}`,
                action: {
                  label: "Tugaskan",
                  href: `/dashboard/booking/${row.key}`,
                },
              }))}
              more={
                unassigned.length > ROWS
                  ? {
                      label: `+${unassigned.length - ROWS} booking lagi`,
                      href: "/dashboard/booking",
                    }
                  : undefined
              }
            />
          )}

          {readsMemberships && (
            <ActionGroup
              icon={UserRound}
              tone="warn"
              title="Membership habis bulan ini"
              count={memberships.data?.pagination.total ?? null}
              loading={memberships.loading}
              failed={memberships.failed}
              empty="Tidak ada membership yang habis bulan ini."
              rows={(memberships.data?.items ?? []).map((card) => ({
                key: card.id,
                title: [card.petName, card.customerName]
                  .filter(Boolean)
                  .join(" · "),
                detail: (
                  <span className="tabular-nums">
                    {card.plan.name} · berakhir {dateOf(card.endDate)} ·{" "}
                    {card.daysLeft} hari lagi
                  </span>
                ),
                action: {
                  label: "Tawarkan perpanjang",
                  href: cardHref(card.id),
                },
              }))}
              more={
                (memberships.data?.pagination.total ?? 0) > ROWS
                  ? {
                      label: `+${(memberships.data?.pagination.total ?? 0) - ROWS} membership lagi`,
                      href: MEMBERSHIP_RENEWALS_HREF,
                    }
                  : undefined
              }
            />
          )}

          {readsInvoices && (
            <ActionGroup
              icon={Coins}
              title="Faktur lewat jatuh tempo"
              count={overdue.data?.pagination.total ?? null}
              loading={overdue.loading}
              failed={overdue.failed}
              empty="Tidak ada faktur yang lewat jatuh tempo."
              rows={(overdue.data?.items ?? []).map((invoice) => ({
                key: invoice._id,
                title: (
                  <>
                    <span className="tabular-nums">{invoice.invoiceNumber}</span>
                    {invoice.customerName ? ` · ${invoice.customerName}` : ""}
                  </>
                ),
                detail: (
                  <span className="tabular-nums">
                    {formatMoney(invoice.outstandingAmount)} · telat{" "}
                    {daysSince(invoice.dueDate, today)} hari
                  </span>
                ),
                action: {
                  label: "Tagih",
                  href: `/dashboard/sales/invoice/${invoice._id}`,
                },
              }))}
              more={
                (overdue.data?.pagination.total ?? 0) > ROWS
                  ? {
                      label: `+${(overdue.data?.pagination.total ?? 0) - ROWS} faktur lagi`,
                      href: "/dashboard/sales/piutang",
                    }
                  : undefined
              }
            />
          )}

          {readsCustomers && (
            <ActionGroup
              icon={PawPrint}
              title={`Belum datang ${DORMANT_DAYS}+ hari`}
              count={dormant.data?.pagination.total ?? null}
              loading={dormant.loading}
              failed={dormant.failed}
              empty="Tidak ada pelanggan yang tertinggal."
              rows={(dormant.data?.items ?? []).map((customer) => ({
                key: customer._id,
                title: customer.name,
                detail: (
                  <span className="tabular-nums">
                    {customer.lastVisitAt
                      ? `Terakhir ${dateOf(customer.lastVisitAt)} · `
                      : "Belum pernah belanja · "}
                    {customer.daysSinceLastVisit} hari lalu
                    {customer.phone ? ` · ${customer.phone}` : ""}
                  </span>
                ),
                action: {
                  label: "Hubungi",
                  href: `/dashboard/master/customers/${customer._id}`,
                },
              }))}
              more={
                (dormant.data?.pagination.total ?? 0) > ROWS
                  ? {
                      label: `+${(dormant.data?.pagination.total ?? 0) - ROWS} pelanggan lagi`,
                      href: "/dashboard/master/customers/dormant",
                    }
                  : undefined
              }
            />
          )}
        </div>
      </Panel>

      {readsBookings && (
        <Panel icon={PawPrint} title="Jadwal hari ini" tag="Semua jenis layanan">
          {bookings.failed ? (
            <Alert variant="error">
              Jadwal hari ini tidak bisa dimuat. Coba muat ulang halaman.
            </Alert>
          ) : bookings.loading ? (
            <p className="py-6 text-center text-sm text-muted">Memuat jadwal…</p>
          ) : schedule.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
              Belum ada booking hari ini.{" "}
              <Link
                href="/dashboard/booking/new"
                className="font-semibold text-primary hover:underline"
              >
                Tambah yang pertama →
              </Link>
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Jam</TableHead>
                    <TableHead>Hewan</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Kegiatan</TableHead>
                    <TableHead>PIC</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-bold tabular-nums">
                        {clockOf(row.booking.scheduledAt)}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/dashboard/booking/${row.key}`}
                          className="font-bold text-foreground hover:underline"
                        >
                          {row.booking.petName}
                        </Link>
                        <p className="text-xs text-muted">
                          {row.booking.customerName}
                        </p>
                      </TableCell>
                      <TableCell>
                        <span className="rounded-full bg-tint-info px-2 py-0.5 text-xs font-semibold text-primary">
                          {row.line}
                        </span>
                      </TableCell>
                      <TableCell>{row.service.name}</TableCell>
                      <TableCell>
                        {row.groomers.length > 0 ? (
                          row.groomers.map((who) => who.name).join(", ")
                        ) : (
                          <span className="text-xs text-muted">
                            belum ditugaskan
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BookingStatusBadge status={row.booking.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
