"use client";

import { useEffect, useState } from "react";

import { Alert } from "@/components";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookingStatusBadge } from "@/features/booking";
import { usePermissions } from "@/features/permissions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { userService } from "@/services/user.service";
import type {
  Booking,
  CustomerInvoiceDetail,
  InvoiceBookingItem,
  BookingStatus,
} from "@/types/api";

/**
 * WHAT STILL HAS TO HAPPEN for the services on this bill — PCR-035.
 *
 * WHY IT IS ON THE INVOICE. A grooming that has been billed and not yet done is
 * work somebody owes, and the invoice is where a receptionist looking at that
 * customer already is. Making them open Booking and search for the animal to
 * answer "has this been done" is the kind of second screen that ends with nobody
 * checking.
 *
 * BOTH KINDS OF APPOINTMENT, together. One pulled in from the schedule (PCR-034)
 * and one the invoice itself raised are the same fact to the reader — a service
 * that has to happen. `origin` is what separates them, and it is SHOWN rather
 * than used to filter: "dibuat dari faktur ini" tells somebody why an
 * appointment they never made is on the day sheet.
 *
 * THE DATA COMES WITH THE INVOICE, not from a second fetch. `bookings[]` is part
 * of the detail read, which means a role holding `customerInvoices:read` and not
 * `bookings:read` still sees the panel — the invoice's own appointments are part
 * of the invoice. Only the two ACTIONS need `bookings:update`.
 *
 * THE GROOMER LIST IS BEST EFFORT, BUT ONLY A 403 IS SILENT. Reading /api/users
 * takes `users:read`, which somebody working the counter has no other reason to
 * hold — that is an ordinary arrangement, not a fault, so the control simply goes
 * away and the panel still says what is outstanding.
 *
 * ANYTHING ELSE SAYS SO OUT LOUD, and that distinction was learned the hard way:
 * the first version caught every failure alike, so a `limit` over the API's cap
 * came back 400 and turned into a permanently DISABLED dropdown with nothing on
 * screen to explain it. A dead control is worse than an error — an error can be
 * acted on.
 */

/**
 * The API's page-size cap. Asking for more is a 400, not a bigger page — the
 * same clamp `useInvoiceLookups` and `chartOfAccounts.service.ts` document.
 */
const FETCH_LIMIT = 100;

/** The "nobody yet" row. Radix Select forbids `value=""`, hence a sentinel. */
const UNASSIGNED = "belum-ditentukan";

function formatWhen(iso: string | null): string {
  if (!iso) return "—";

  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function InvoiceExecutionPanel({
  invoice,
  onChanged,
}: {
  invoice: CustomerInvoiceDetail;
  /**
   * Hands back JUST WHAT MOVED, so the detail screen can restate itself without
   * refetching the whole invoice.
   *
   * A PATCH RATHER THAN THE WHOLE BOOKING, because the two are not the same
   * shape: the invoice's `bookings[]` is what the invoice read assembled, while
   * these endpoints answer with a Booking document. Spreading one over the other
   * would quietly overwrite the panel's fields with a document that does not
   * carry all of them.
   */
  onChanged: (
    id: string,
    patch: { status: BookingStatus; items: InvoiceBookingItem[] },
  ) => void;
}) {
  const { can } = usePermissions();
  const mayAct = can("bookings", "update");

  const [groomers, setGroomers] = useState<{ value: string; label: string }[]>(
    [],
  );
  /** Null while it is fine — a 403 included, which is not a fault. */
  const [groomerError, setGroomerError] = useState<string | null>(null);
  /** The booking id currently being written, so only its own row is disabled. */
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    // Nothing to assign with, so nothing to fetch.
    if (!mayAct) return;

    let active = true;

    userService
      .list({ status: "active", limit: FETCH_LIMIT })
      .then((result) => {
        if (!active) return;
        setGroomers(
          result.items.map((user) => ({
            value: user._id,
            label: user.fullName,
          })),
        );
      })
      .catch((err: unknown) => {
        if (!active) return;
        setGroomers([]);
        /*
          A ROLE WITHOUT `users:read` IS NOT A FAULT, so it stays quiet and the
          control disappears below. Everything else is a real failure and has to
          be visible, or it presents as a control that does nothing.
        */
        setGroomerError(
          err instanceof ApiError && err.status === 403
            ? null
            : "Daftar staf gagal dimuat, jadi groomer belum bisa dipilih.",
        );
      });

    return () => {
      active = false;
    };
  }, [mayAct]);

  /*
    ONE HANDLER FOR BOTH ACTIONS, because the failure shape is the same and the
    server's own `reason` is what should reach the toast. A 409 here is nearly
    always somebody else having moved the booking first, and its message says
    which state it actually found — worth more than anything this screen could
    invent. 8 seconds because a refusal is read, not glanced at.
  */
  async function run(id: string, work: () => Promise<Booking>) {
    setBusy(id);

    try {
      const updated = await work();
      onChanged(id, { status: updated.status, items: updated.items });
    } catch (error: unknown) {
      swalToast(
        error instanceof ApiError
          ? (error.reason ?? error.message)
          : "Gagal menyimpan. Coba lagi.",
        "error",
        8000,
      );
    } finally {
      setBusy(null);
    }
  }

  if (invoice.bookings.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {groomerError && <Alert variant="warning">{groomerError}</Alert>}

      {!mayAct && (
        <Alert variant="info">
          Anda bisa melihat jadwalnya, tapi tidak bisa mengubah. Perlu hak{" "}
          <span className="tabular-nums text-xs">bookings:update</span>.
        </Alert>
      )}

      {invoice.bookings.map((booking) => {
        const working = busy === booking._id;
        /*
          FINAL MEANS FINAL. A completed or cancelled booking has nowhere left to
          go, and the server refuses both actions on one — offering them would be
          two buttons that only ever answer 409.
        */
        const open =
          booking.status !== "completed" && booking.status !== "cancelled";
        const groomerId = booking.items[0]?.groomerUserId ?? null;

        return (
          <div
            key={booking._id}
            className="flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                {/* The animal leads — somebody reading a day sheet thinks in
                    pets, and quotes the number afterwards. */}
                <p className="font-medium">
                  {booking.petName ?? "Hewan terhapus"}
                </p>
                <p className="text-xs text-muted tabular-nums">
                  {booking.bookingNumber ?? "—"} ·{" "}
                  {formatWhen(booking.scheduledAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/*
                  SAID OUT LOUD, because an appointment nobody remembers making
                  is exactly what an invoice-born booking looks like on a day
                  sheet.
                */}
                {booking.origin === "invoice_adhoc" && (
                  <span className="rounded-full bg-tint-info px-2 py-0.5 text-xs font-medium text-info">
                    Dari faktur ini
                  </span>
                )}
                <BookingStatusBadge status={booking.status} />
              </div>
            </div>

            <ul className="flex flex-col gap-0.5 text-sm text-muted">
              {booking.items.map((item, index) => (
                <li key={`${item.serviceId}-${index}`}>
                  {item.name} · {item.groomerName}
                </li>
              ))}
            </ul>

            {mayAct && open && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {/*
                  NOT RENDERED AT ALL with nothing to choose from, rather than
                  rendered greyed out. A disabled control says "not now"; an
                  absent one says "not here", and an empty staff list is the
                  second — either the role cannot read /api/users or the list
                  genuinely failed, and the banner above covers the second case.
                */}
                {groomers.length > 0 && (
                  <Select
                    value={groomerId ?? UNASSIGNED}
                    disabled={working}
                    onValueChange={(value) =>
                      run(booking._id, () =>
                        bookingService.assignGroomer(
                          booking._id,
                          value === UNASSIGNED ? null : value,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="Pilih groomer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNASSIGNED}>
                        Belum ditentukan
                      </SelectItem>
                      {groomers.map((groomer) => (
                        <SelectItem key={groomer.value} value={groomer.value}>
                          {groomer.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={working}
                  onClick={() =>
                    run(booking._id, () =>
                      bookingService.changeStatus(booking._id, "completed"),
                    )
                  }
                >
                  Tandai selesai
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
