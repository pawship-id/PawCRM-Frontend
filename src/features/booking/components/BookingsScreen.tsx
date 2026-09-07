"use client";

import { Alert, FilterPills, Pagination, Spinner } from "@/components";
import { formatMoney } from "@/utils/decimal";

import { useBookings } from "../hooks/useBookings";
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
 * IT TAKES BOOKINGS NOW, not only shows them. Until the form existed the only
 * way to make one was to sell it at the till, which cannot answer the phone call
 * that books Thursday.
 *
 * THE FORM IS A PAGE OF ITS OWN — `/dashboard/booking/new`. It was a dialog on
 * this screen until a booking could hold several animals; three cards of five
 * controls each is a form scrolling inside a scrolling page.
 */
export function BookingsScreen() {
  const {
    bookings,
    unbilled,
    pagination,
    query,
    loading,
    error,
    setQuery,
  } = useBookings();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Booking</h1>
        <p className="mt-1 text-sm text-muted">
          Janji grooming dan layanan lain, ditambah yang sudah dicatat di kasir
          tapi belum dibayar.
        </p>
      </div>

      {/*
        THE LENS, OUTSIDE THE BAR AND APPLYING ON CLICK — ui-rules §8's pill row.
        It stays out of the filter panel for the reason Utang Supplier's urgency
        lens does: this is what the screen is opened to USE when the question is
        "what have we forgotten to charge for", and burying it behind a button
        would hide the one control that earns its place on the row.

        THE COUNT IS THE POINT. A pill that only said "Belum ditagih" would have
        to be clicked to find out whether there is anything behind it; one that
        says "3" answers before anybody asks. It comes from the server over the
        WHOLE book, not from the page below — a count taken from a paged list
        would say "3" on a page of three and change as somebody paged through.
      */}
      <FilterPills
        ariaLabel="Tampilan booking"
        value={query.unbilled}
        options={[
          { value: false, label: "Semua" },
          {
            value: true,
            label: "Belum ditagih",
            // Absent while the summary is in flight or if it failed: no count
            // beats a wrong one.
            count: unbilled?.bookingCount,
            // The one lens on this screen that carries urgency — work done and
            // never charged for is money the shop has already lost.
            tone: unbilled?.bookingCount ? "danger" : "default",
          },
        ]}
        onChange={(value) => setQuery({ unbilled: value })}
      />

      {/*
        SAID IN MONEY, not only in rows. "3 booking" is a queue; "Rp 390.000
        belum ditagih" is what it costs to leave it alone, and that is the
        sentence that gets it done.

        ONLY WHILE THE LENS IS ON. On the ordinary day sheet it would be a
        standing reproach nobody asked for.
      */}
      {query.unbilled && unbilled && unbilled.bookingCount > 0 && (
        <p className="text-sm text-muted">
          <strong className="text-foreground tabular-nums">
            {formatMoney(unbilled.total)}
          </strong>{" "}
          belum ditagih dari {unbilled.serviceCount} layanan pada{" "}
          {unbilled.bookingCount} booking.
        </p>
      )}

      <BookingsToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {/*
        A DIFFERENT EMPTY STATE FOR THE LENS. "Belum ada booking" under a filter
        that found nothing reads as "this shop has no bookings", which is the
        wrong news entirely — the right news is that there is nothing left to
        bill, and it is good news.
      */}
      {query.unbilled && !loading && bookings.length === 0 && !error ? (
        <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          Semua layanan sudah ditagih. Tidak ada yang tertinggal.
        </p>
      ) : loading && bookings.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat booking…
        </div>
      ) : (
        <>
          {/*
            NO `onChanged`, and `refetch` is no longer pulled off the hook at
            all: the table reads and nothing else since the status menu left it
            (see `BookingsTable`), so nothing on this screen writes and there is
            nothing to re-ask after. `setQuery` still reloads the list, which is
            the only thing that changes what is on it.
          */}
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

    </div>
  );
}
