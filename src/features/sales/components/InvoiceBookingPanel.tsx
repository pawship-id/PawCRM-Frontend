"use client";

import { useEffect, useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button as UIButton } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { formatMoney } from "@/utils/decimal";
import type { Booking } from "@/types/api";

/**
 * THE CUSTOMER'S BOOKINGS, ready to be billed on this invoice — PCR-034.
 *
 * WHY THE WINDOW IS 30 DAYS AND NOT TODAY. The till's bridge answers "what is
 * happening in front of me"; an invoice bills what has ALREADY happened — a
 * month of boarding, last week's grooming. A one-day window would leave this
 * panel empty for exactly the cases it exists to serve. Backwards only: an
 * appointment booked for next Friday has not been earned yet.
 *
 * ONE ROW PER ANIMAL, showing every service on that booking. A bill for three
 * cats has to say which three — the customer checking it and the groomer reading
 * it both need the names, and "Grooming ×3" tells neither of them whose bath was
 * missed.
 *
 * THE LIST IS ALREADY FILTERED BY THE SERVER to confirmed bookings this customer
 * has not been billed for — in a basket OR on another invoice. Filtering here
 * would be a second definition of "already billed", and the two would eventually
 * disagree about whether a grooming had been paid for.
 *
 * IT DISAPPEARS WITHOUT A CUSTOMER, rather than showing an empty state. "Which
 * bookings" has no meaning until "whose" is answered, and an empty panel above
 * an unanswered question reads as "this customer has none".
 */
const WINDOW_DAYS = 30;

export function InvoiceBookingPanel({
  customerId,
  selected,
  onChange,
  disabled = false,
}: {
  customerId: string;
  /** Booking ids currently on the invoice. */
  selected: string[];
  /**
   * Reports the CHOSEN BOOKINGS, not just their ids.
   *
   * The form sends ids and nothing else — the server reads each booking's own
   * frozen prices — but it still has to SHOW what the bill comes to before
   * anybody approves it. Handing the whole booking up is what lets the recap add
   * them in; passing ids alone left it reading Rp 0 with two groomings ticked.
   */
  onChange: (bookings: Booking[]) => void;
  disabled?: boolean;
}) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  /*
    STARTS LOADING, rather than being switched on inside the effect. The
    component remounts per customer, so "loading" IS its initial state — and a
    synchronous `setLoading(true)` in an effect is a cascading render for a value
    that was always going to be true.
  */
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /*
    NO SYNCHRONOUS RESET FOR A CHANGED CUSTOMER, because there is nothing to
    reset: the form gives this component `key={customerId}`, so a different
    customer is a different component with fresh state. Clearing the rows inside
    the effect instead would be a cascading render, and it is also the shape that
    leaves one customer's bookings on screen for a moment under another's name.
  */
  useEffect(() => {
    // Nothing to ask for yet. No state is touched here — the guard that was
    // removed set state synchronously, which is the cascading render the lint
    // rule catches; a bare return is not.
    if (!customerId) return;

    let active = true;

    bookingService
      .bridge(customerId, WINDOW_DAYS)
      .then((rows) => {
        if (active) setBookings(rows);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setBookings([]);
        /*
          SHOWN, NOT SWALLOWED — but it does not take down the form. `bookings:read`
          is a separate grant, and a role that raises invoices without seeing the
          schedule is an ordinary arrangement rather than a misconfiguration. The
          invoice can still be typed by hand.
        */
        setError(
          err instanceof ApiError && err.status === 403
            ? "Role Anda tidak punya akses ke Booking, jadi daftarnya tidak bisa dimuat."
            : "Daftar booking gagal dimuat.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [customerId]);

  if (!customerId) return null;

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((value) => value !== id)
      : [...selected, id];

    onChange(bookings.filter((booking) => next.includes(booking._id)));
  }

  return (
    <div className="flex flex-col gap-3">
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> Memuat booking pelanggan…
        </p>
      )}

      {error && <Alert variant="warning">{error} Faktur tetap bisa dibuat.</Alert>}

      {!loading && !error && bookings.length === 0 && (
        <p className="text-sm text-muted">
          Tidak ada booking pelanggan ini dalam {WINDOW_DAYS} hari terakhir yang
          belum ditagih.
        </p>
      )}

      {bookings.map((booking) => {
        const id = booking._id;
        const total = booking.items.reduce(
          (sum, item) => sum + Number(item.price),
          0,
        );

        return (
          <label
            key={id}
            htmlFor={`booking-${id}`}
            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 hover:bg-surface-hover"
          >
            <Checkbox
              id={`booking-${id}`}
              checked={selected.includes(id)}
              onCheckedChange={() => toggle(id)}
              disabled={disabled}
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                {/* THE ANIMAL LEADS, not the booking number: somebody billing a
                    grooming thinks in pets, and the number is what they quote
                    afterwards. */}
                <span className="font-medium">
                  {booking.petName ?? "Hewan terhapus"}
                </span>
                <span className="tabular-nums text-sm">
                  {formatMoney(String(total))}
                </span>
              </span>
              <span className="block text-xs text-muted">
                {booking.bookingNumber ?? "—"}
              </span>
              <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted">
                {booking.items.map((item, index) => (
                  <li key={`${item.serviceId}-${index}`}>
                    {item.name}
                    {/* Never null — the server resolves an unassigned slot to
                        "Belum ditentukan" once, rather than three screens each
                        inventing their own word for it. */}
                    {item.groomerName ? ` · ${item.groomerName}` : ""}
                  </li>
                ))}
              </ul>
            </span>
          </label>
        );
      })}

      {selected.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <Label className="text-xs text-muted">
            {selected.length} booking akan ditagih di faktur ini
          </Label>
          <UIButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            disabled={disabled}
          >
            Kosongkan
          </UIButton>
        </div>
      )}
    </div>
  );
}
