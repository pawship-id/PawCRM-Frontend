"use client";

import { useState } from "react";

import { Alert, Pagination, Spinner } from "@/components";
import { swalToast } from "@/lib/swal";

import { useBookings } from "../hooks/useBookings";
import { BookingCreateDialog } from "./BookingCreateDialog";
import { BookingsTable } from "./BookingsTable";
import { BookingsToolbar } from "./BookingsToolbar";

/**
 * The Booking list screen.
 *
 * WHY IT EXISTS: until now the only way to check whether a booking had been
 * created, pulled, or completed was to open the database. Every rule the till
 * enforces about bookings was invisible to the person who owns the shop.
 *
 * DEFAULTS TO EVERYTHING, not to today. A day sheet defaulting to today is the
 * obvious choice and the wrong first one here: the first question anybody asks
 * this screen is "did that grooming I just rang up actually get recorded", and
 * an empty list filtered to a day they have not thought about reads as "no".
 * The date filter is one tap away with "Hari ini" as its first preset.
 *
 * IT TAKES BOOKINGS NOW, not only shows them. Until the dialog existed the only
 * way to make one was to sell it at the till, which cannot answer the phone call
 * that books Thursday.
 */
export function BookingsScreen() {
  const { bookings, pagination, query, loading, error, setQuery, refetch } =
    useBookings();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Booking</h1>
        <p className="mt-1 text-sm text-muted">
          Janji grooming dan layanan lain, ditambah yang sudah dicatat di kasir
          tapi belum dibayar.
        </p>
      </div>

      <BookingsToolbar
        query={query}
        onChange={setQuery}
        onCreate={() => setCreating(true)}
      />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && bookings.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat booking…
        </div>
      ) : (
        <>
          <BookingsTable bookings={bookings} />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="booking"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}

      <BookingCreateDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(booking) => {
          /*
            The whole list is re-asked rather than the new row spliced in: the
            server sorts by `scheduledAt` and pages the result, so a booking made
            for next month belongs on a page this screen is not showing — and a
            local insert would put it at the top, which is a lie about where it
            will be after the next refresh.
          */
          refetch();
          swalToast(`Booking ${booking.bookingNumber} dibuat.`);
        }}
      />
    </div>
  );
}
