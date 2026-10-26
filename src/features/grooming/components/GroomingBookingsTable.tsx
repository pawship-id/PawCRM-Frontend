"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, TriangleAlert } from "lucide-react";

import { DataTable, type DataTableColumn } from "@/components";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  BILLING_BADGES,
  BookingSessionSteps,
  BookingStatusActions,
} from "@/features/booking";
import { Can } from "@/features/permissions";
import { bookingDetailPath } from "@/features/antar-jemput/paths";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  isPositive,
  subtractDecimals,
  sumDecimals,
} from "@/utils/decimal";
import type { Booking } from "@/types/api";

import {
  BOOKING_SORT_OPTIONS,
  clockOf,
  dayOf,
  type GroomingRow,
  type GroomingSort,
} from "../board";

/**
 * Keeps a click on a control inside the row from also folding the row. React
 * bubbles out of portals too, so a press inside the status dialog or the crew
 * menu is stopped here before it reaches the row.
 */
const stop = (event: MouseEvent) => event.stopPropagation();

/**
 * The status cell's guard: a press on its control, or anywhere in the dialog or
 * menu it opens (portalled, so the target is outside the cell), is the
 * control's own — but a click on the plain badge a read-only role sees still
 * reaches the row, as it always did.
 */
function stopControl(event: MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (
    !event.currentTarget.contains(target) ||
    target.closest("a, button, input, label, select")
  ) {
    event.stopPropagation();
  }
}

/**
 * The Grooming board's table — one row per booking (one animal, one grooming),
 * each opening onto its turns and its bill. Drawn by the shared `DataTable`
 * (ui-rules §10); the opened drawer is its `renderAfterRow`.
 *
 * ─── IT MOVES THINGS, UNLIKE `BookingsTable` ───────────────────────────────
 *
 * The Status column is `BookingStatusActions`' "status" variant, and the opened
 * row carries Mulai / Selesai / Ganti PIC. Decided 13 September 2026, on the
 * mockup (`buloo-grooming-v3.html`), knowing `/dashboard/booking` took the same
 * controls OFF its rows on 5 September. Every move still goes through the same
 * confirm dialog and the same server gates; what changed is where it is pressed.
 * Do not strip them as a tidy-up to match the booking list.
 *
 * THE ROW FOLDS OPEN on a click anywhere (or Enter on the focused row) —
 * `DataTable`'s `onRowClick`. The chevron and the links STOP THEIR CLICKS
 * (`stop`), and so does the status control (`stopControl`), so using them never
 * also folds the row.
 *
 * ─── SORTED FROM TWO HEADERS (BO, 20 October 2026) ─────────────────────────
 *
 * Booking (the number, A first) and Nilai (the amount printed — `value`,
 * before discount — largest first). Everything else is plain. The screen
 * sorts the whole loaded period and pages it itself; see `BOOKING_SORT_OPTIONS`
 * in `board.ts`.
 *
 * WHAT THE MOCKUP SHOWS AND THIS CANNOT: the breed (a booking does not carry
 * it), the invoice NUMBER (only whether one claimed the booking), and a travel
 * fee per trip (there are no trips yet).
 */
export function GroomingBookingsTable({
  rows,
  loading,
  sort,
  onSortChange,
  onChanged,
  emptyMessage,
}: {
  rows: GroomingRow[];
  loading: boolean;
  sort: GroomingSort;
  onSortChange: (next: GroomingSort) => void;
  onChanged: (booking: Booking) => void;
  emptyMessage: ReactNode;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());

  function toggle(key: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const columns: DataTableColumn<GroomingRow>[] = [
    {
      id: "expand",
      header: <span className="sr-only">Rincian</span>,
      headClassName: "w-12",
      cell: (row) => {
        const expanded = open.has(row.key);
        return (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-controls={`grooming-detail-${row.key}`}
            aria-label={`${expanded ? "Tutup" : "Buka"} rincian ${row.booking.petName ?? "hewan"}`}
            onClick={(event) => {
              stop(event);
              toggle(row.key);
            }}
          >
            <ChevronDown
              className={cn(
                "size-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </Button>
        );
      },
    },
    {
      id: "booking",
      header: "Booking",
      cell: ({ booking }) => (
        <>
          {/* "—" while a draft: the number is earned by leaving it. */}
          <Link
            href={bookingDetailPath(booking)}
            onClick={stop}
            aria-label={`Buka ${booking.bookingNumber ?? "booking draf"}`}
            className="rounded text-sm font-semibold tabular-nums text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {booking.bookingNumber ?? "—"}
          </Link>
          {booking.origin === "pos_adhoc" && (
            <Badge
              variant="outline"
              className="mt-1 block w-fit border-transparent bg-tint-neutral text-muted"
            >
              Dari kasir
            </Badge>
          )}
        </>
      ),
    },
    {
      id: "pet",
      header: "Hewan",
      cellClassName: "whitespace-normal",
      cell: ({ booking }) => (
        <>
          <span className="block text-sm font-semibold text-foreground">
            {booking.petName ?? "—"}
          </span>
          <span className="block text-xs text-muted">
            {booking.customerName ?? "—"}
          </span>
        </>
      ),
    },
    {
      id: "service",
      header: "Layanan",
      cellClassName: "max-w-88 whitespace-normal",
      cell: (row) => {
        const { booking, service } = row;
        return (
          <>
            <span className="block text-sm font-semibold text-foreground">
              {service.name}
            </span>

            {/*
              THE VAN, from either side: the booking's own trip flags, or a
              ride booked in its visit (21 Sep 2026).
            */}
            {(booking.pickupRequested ||
              booking.deliveryRequested ||
              (booking.trips?.length ?? 0) > 0) && (
              <span className="mt-1 flex flex-wrap gap-1">
                <Badge
                  variant="outline"
                  className="border-transparent bg-tint-info text-info"
                >
                  Antar-jemput
                </Badge>
              </span>
            )}

            {row.addons.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {row.addons.map((addon) => (
                  <span
                    key={addon.itemId}
                    className="rounded-md bg-tint-neutral px-2 py-0.5 text-xs text-muted"
                  >
                    + {addon.name}
                  </span>
                ))}
              </span>
            )}

            {/* Staff-facing only — the customer's note is not a warning. */}
            {booking.internalNotes && (
              <span className="mt-2 flex items-start gap-1.5 rounded-md bg-tint-warning px-2 py-1.5 text-xs text-foreground">
                <TriangleAlert
                  className="mt-px size-4 flex-none text-warning"
                  aria-hidden
                />
                {booking.internalNotes}
              </span>
            )}
          </>
        );
      },
    },
    /*
      WHERE THE GROOMING HAPPENS, and for a house call the trip behind it
      (12 October 2026, on request) — the trip's page is reached from here
      rather than from a list of its own.
    */
    {
      id: "location",
      header: "Tipe",
      cell: ({ booking }) => (
        <Badge
          variant="outline"
          className={cn(
            "border-transparent",
            booking.location === "in_home"
              ? "bg-tint-info text-info"
              : "bg-tint-neutral text-muted",
          )}
        >
          {booking.location === "in_home" ? "Home grooming" : "Di toko"}
        </Badge>
      ),
    },
    {
      id: "trip",
      header: "Perjalanan",
      cell: ({ booking }) => {
        /* `homeTrip` is what the list presents; the bare id is the stored pointer. */
        const tripId = booking.homeTrip?._id ?? booking.homeTripId;
        return booking.location === "in_home" && tripId ? (
          <Link
            href={`/dashboard/booking/rides/${tripId}`}
            onClick={stop}
            className="rounded text-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Buka perjalanan
          </Link>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      id: "time",
      header: "Jam",
      cellClassName: "tabular-nums",
      cell: (row) => (
        <>
          <span className="block text-sm font-semibold text-foreground">
            {clockOf(row.booking.scheduledAt)}
          </span>
          <span className="block text-xs text-muted">
            {dayOf(row.booking.scheduledAt)}
            {row.durationMin !== null && ` · ${row.durationMin} mnt`}
          </span>
        </>
      ),
    },
    {
      id: "groomer",
      header: "Groomer",
      cellClassName: "whitespace-normal",
      cell: (row) => (
        <>
          <span
            className={cn(
              "block text-sm",
              row.groomers.length ? "text-foreground" : "text-muted",
            )}
          >
            {row.groomers.length
              ? row.groomers.map((who) => who.name).join(", ")
              : "Belum ditentukan"}
          </span>
          <span className="block text-xs tabular-nums text-muted">
            {row.sessions.length
              ? `${row.sessionsDone}/${row.sessions.length} tahap`
              : "Belum ada tahap"}
          </span>
        </>
      ),
    },
    {
      id: "billing",
      header: "Faktur",
      cell: (row) => {
        const billing = BILLING_BADGES[row.billing];
        return billing ? (
          <Badge
            variant="outline"
            className={cn("border-transparent", billing.className)}
          >
            {billing.label}
          </Badge>
        ) : (
          <span className="text-muted">—</span>
        );
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ booking }) => (
        <div onClick={stopControl}>
          <BookingStatusActions
            booking={booking}
            onChanged={onChanged}
            variant="status"
          />
        </div>
      ),
    },
    {
      id: "value",
      header: "Nilai",
      align: "right",
      cellClassName: "text-sm font-semibold text-foreground",
      cell: (row) => formatMoney(row.value),
    },
  ];

  return (
    <DataTable<GroomingRow, GroomingSort>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.key}
      sort={{ value: sort, options: BOOKING_SORT_OPTIONS, onChange: onSortChange }}
      loading={loading}
      loadingLabel="Memuat booking grooming…"
      empty={
        <div className="px-6 py-12 text-center text-sm text-muted">
          {emptyMessage}
        </div>
      }
      tableClassName="min-w-320"
      rowClassName={(row) =>
        cn("align-top", open.has(row.key) && "bg-surface-hover")
      }
      onRowClick={(row) => toggle(row.key)}
      renderAfterRow={(row) =>
        open.has(row.key) && (
          <TableRow
            id={`grooming-detail-${row.key}`}
            className="bg-surface-hover hover:bg-surface-hover"
          >
            <TableCell colSpan={columns.length} className="whitespace-normal p-4">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                <BookingSessionSteps booking={row.booking} onChanged={onChanged} />
                <RowBreakdown row={row} />
              </div>
            </TableCell>
          </TableRow>
        )
      }
    />
  );
}

/** What a line's bill takes off — small print under it, only when something does. */
function DiscountLine({ amount }: { amount?: string | null }) {
  if (!amount || !isPositive(amount)) return null;

  return (
    <div className="flex justify-between gap-3 pl-3 text-xs text-success">
      <span>Diskon item</span>
      <span className="font-semibold tabular-nums">− {formatMoney(amount)}</span>
    </div>
  );
}

/**
 * What this booking comes to, line by line, and where to go next. Shared with
 * Antar-Jemput's board, whose opened row is the same two halves.
 */
export function RowBreakdown({ row }: { row: GroomingRow }) {
  const { booking, service } = row;
  const discounted = Boolean(
    booking.discountAmount && isPositive(booking.discountAmount),
  );
  /* The lines' own discounts, as each was resolved. */
  const ownDiscounts = sumDecimals([
    service.discount?.resolvedAmount ?? null,
    ...row.addons.map((addon) => addon.discount?.resolvedAmount ?? null),
  ]);
  /*
    THIS BOOKING'S SHARE OF THE SAVE'S DISCOUNT — what the bill takes off in all,
    less the lines' own. Read this way rather than off `bookingDiscount`, so a
    share the server clamped (a line re-quoted cheaper since) is shown as billed.
  */
  const bookingShare = discounted
    ? subtractDecimals(booking.discountAmount!, ownDiscounts)
    : "0";
  const subtotal = subtractDecimals(row.value, ownDiscounts);

  return (
    <section aria-label="Rincian" className="flex flex-col gap-3">
      <h3 className="text-sm font-bold text-foreground">Rincian</h3>

      {/*
        PLAIN ROWS, NOT A <dl>. A line now carries its discount under it, and a
        <dl> only allows one <div> between it and its <dt>/<dd> — the nesting
        this needs would be read out as broken pairs.
      */}
      <div className="rounded-xl border border-border bg-surface px-4 py-2">
        <div className="text-sm">
          <div className="flex flex-col border-b border-border py-1.5">
            <div className="flex justify-between gap-3">
              <span className="text-foreground">{service.name}</span>
              <span className="font-semibold tabular-nums">
                {formatMoney(service.price)}
              </span>
            </div>
            <DiscountLine amount={service.discount?.resolvedAmount} />
          </div>
          {row.addons.map((addon) => (
            <div
              key={addon.itemId}
              className="flex flex-col border-b border-border py-1.5 pl-3"
            >
              <div className="flex justify-between gap-3">
                <span className="text-muted">+ {addon.name}</span>
                <span className="tabular-nums">{formatMoney(addon.price)}</span>
              </div>
              <DiscountLine amount={addon.discount?.resolvedAmount} />
            </div>
          ))}
          {/*
            WITH A DISCOUNT, THE TOTAL IS WHAT GETS BILLED (15 September 2026).

            Each line shows ONLY ITS OWN discount. "Diskon seluruh booking" is
            not folded into them: it sits under the subtotal as one figure, the
            way the booking form's summary shows it — the subtotal being the
            lines after their own discounts.
          */}
          {discounted && (
            <div className="flex justify-between gap-3 pt-2 text-muted">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatMoney(subtotal)}</span>
            </div>
          )}
          {isPositive(bookingShare) && (
            <div className="flex justify-between gap-3 pt-1 text-xs text-success">
              <span>Diskon booking</span>
              <span className="font-semibold tabular-nums">
                − {formatMoney(bookingShare)}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-3 pt-2 pb-1 font-bold">
            <span>Total</span>
            <span className="tabular-nums">{formatMoney(row.net)}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {/*
          ONE WAY IN. "Halaman kerja" used to sit beside this, opening the
          animal's own page under its booking; a booking is one animal now and
          that page IS the booking's page, so two buttons would be one address
          offered twice.
        */}
        <Button asChild variant="secondary" size="sm">
          <Link href={bookingDetailPath(booking)}>Buka detail</Link>
        </Button>
        {row.billing === "unbilled" && (
          <Can feature="posTransactions" action="create">
            <Button asChild size="sm">
              <Link href="/dashboard/pos">Tagih di kasir</Link>
            </Button>
          </Can>
        )}
      </div>
    </section>
  );
}
