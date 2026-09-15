"use client";

import { Fragment, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, TriangleAlert } from "lucide-react";

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
import { BookingStatusActions } from "@/features/booking";
import { Can } from "@/features/permissions";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  isPositive,
  subtractDecimals,
  sumDecimals,
} from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { clockOf, dayOf, type BillingState, type GroomingRow } from "../board";
import { GroomingSessionSteps } from "./GroomingSessionSteps";

const BILLING: Record<BillingState, { label: string; className: string } | null> = {
  invoiced: { label: "Difakturkan", className: "bg-tint-success text-success" },
  paid: { label: "Dibayar", className: "bg-tint-success text-success" },
  in_cart: { label: "Di keranjang", className: "bg-tint-info text-info" },
  unbilled: {
    label: "Belum ditagih",
    className: "bg-tint-danger font-semibold text-danger",
  },
  not_due: null,
};

/**
 * The Grooming board's table — one row per booking (one animal, one grooming),
 * each opening onto its turns and its bill.
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
 * WHAT THE MOCKUP SHOWS AND THIS CANNOT: the breed (a booking does not carry
 * it), the invoice NUMBER (only whether one claimed the booking), and a travel
 * fee per trip (there are no trips yet).
 */
export function GroomingBookingsTable({
  rows,
  loading,
  onChanged,
  emptyMessage,
}: {
  rows: GroomingRow[];
  loading: boolean;
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

  if (!loading && rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <Table className={cn("min-w-[1080px]", loading && "opacity-60")}>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <span className="sr-only">Rincian</span>
            </TableHead>
            <TableHead>Booking</TableHead>
            <TableHead>Hewan</TableHead>
            <TableHead>Layanan</TableHead>
            <TableHead>Jam</TableHead>
            <TableHead>Groomer</TableHead>
            <TableHead>Faktur</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Nilai</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {rows.map((row) => {
            const { booking, service } = row;
            const expanded = open.has(row.key);
            const detailId = `grooming-detail-${row.key}`;
            const billing = BILLING[row.billing];
            const petLabel = booking.petName ?? "hewan";

            return (
              <Fragment key={row.key}>
                <TableRow
                  className={cn(
                    "cursor-pointer align-top",
                    expanded && "bg-surface-hover",
                  )}
                  onClick={(event) => {
                    /*
                      ONLY CLICKS THAT LAND IN THE ROW ITSELF. React bubbles
                      events out of portals, so a press inside the status
                      dialog or the crew menu would otherwise reach here and
                      fold the row away under the person using it.
                    */
                    const target = event.target as HTMLElement;
                    if (!event.currentTarget.contains(target)) return;
                    if (target.closest("a, button, input, label")) return;
                    toggle(row.key);
                  }}
                >
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={expanded}
                      aria-controls={detailId}
                      aria-label={`${expanded ? "Tutup" : "Buka"} rincian ${petLabel}`}
                      onClick={() => toggle(row.key)}
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    </Button>
                  </TableCell>

                  <TableCell>
                    {/* "—" while a draft: the number is earned by leaving it. */}
                    <Link
                      href={`/dashboard/booking/${booking._id}`}
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
                  </TableCell>

                  <TableCell className="whitespace-normal">
                    <span className="block text-sm font-semibold text-foreground">
                      {booking.petName ?? "—"}
                    </span>
                    <span className="block text-xs text-muted">
                      {booking.customerName ?? "—"}
                    </span>
                  </TableCell>

                  <TableCell className="max-w-[22rem] whitespace-normal">
                    <span className="block text-sm font-semibold text-foreground">
                      {service.name}
                    </span>

                    {(booking.location === "in_home" ||
                      booking.pickupRequested ||
                      booking.deliveryRequested) && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {booking.location === "in_home" && (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-tint-info text-info"
                          >
                            Di rumah
                          </Badge>
                        )}
                        {(booking.pickupRequested || booking.deliveryRequested) && (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-tint-info text-info"
                          >
                            Antar-jemput
                          </Badge>
                        )}
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
                  </TableCell>

                  <TableCell className="tabular-nums">
                    <span className="block text-sm font-semibold text-foreground">
                      {clockOf(booking.scheduledAt)}
                    </span>
                    <span className="block text-xs text-muted">
                      {dayOf(booking.scheduledAt)}
                      {row.durationMin !== null && ` · ${row.durationMin} mnt`}
                    </span>
                  </TableCell>

                  <TableCell className="whitespace-normal">
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
                  </TableCell>

                  <TableCell>
                    {billing ? (
                      <Badge
                        variant="outline"
                        className={cn("border-transparent", billing.className)}
                      >
                        {billing.label}
                      </Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TableCell>

                  <TableCell>
                    <BookingStatusActions
                      booking={booking}
                      onChanged={onChanged}
                      variant="status"
                    />
                  </TableCell>

                  <TableCell className="text-right text-sm font-semibold tabular-nums text-foreground">
                    {formatMoney(row.value)}
                  </TableCell>
                </TableRow>

                {expanded && (
                  <TableRow
                    id={detailId}
                    className="bg-surface-hover hover:bg-surface-hover"
                  >
                    <TableCell colSpan={9} className="whitespace-normal p-4">
                      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
                        <GroomingSessionSteps row={row} onChanged={onChanged} />
                        <RowBreakdown row={row} />
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** What a line's bill takes off — small print under it, only when something does. */
function DiscountLine({ amount }: { amount?: string | null }) {
  if (!amount || !isPositive(amount)) return null;

  return (
    <div className="flex justify-between gap-3 pl-3 text-xs text-success">
      <span>Diskon</span>
      <span className="font-semibold tabular-nums">− {formatMoney(amount)}</span>
    </div>
  );
}

/** What this booking's grooming comes to, line by line, and where to go next. */
function RowBreakdown({ row }: { row: GroomingRow }) {
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
          <Link href={`/dashboard/booking/${booking._id}`}>Buka detail</Link>
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
