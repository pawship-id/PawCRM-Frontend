"use client";

import { useState } from "react";
import { CalendarCheck, House, Plus } from "lucide-react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMoney, isPositive, subtractDecimals, sumDecimals } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { useBookingBridge } from "../hooks/useBookingBridge";
import { billedTripNote, owedTripsOf, pullTotalOf, tripKeysOf } from "../visitTrip";
import { AddServiceTab, type AddServiceChoice } from "./AddServiceTab";
import { BookingStatusBadge } from "./BookingStatusBadge";

/** The two halves of the modal. FR-3 requires both to be reachable every time. */
type Tab = "pull" | "adhoc";

/**
 * A LINE'S PRICE AFTER WHAT THE BOOKING TAKES OFF IT (11 October 2026, on
 * request) — its own discount and its share of "Diskon seluruh booking", the
 * same `discountAmount` the basket pulls. The price before is struck through
 * beside it when anything comes off, so the card adds up to the button.
 */
function LinePrice({
  line,
  small = false,
}: {
  line: { price: string; discountAmount?: string | null };
  small?: boolean;
}) {
  const off = line.discountAmount && isPositive(line.discountAmount) ? line.discountAmount : null;
  const size = small ? "text-xs" : "text-sm";

  return (
    <span className={`shrink-0 tabular-nums ${size}`}>
      {off && (
        <span className="mr-1.5 text-muted line-through">{formatMoney(line.price)}</span>
      )}
      <span className={off ? "font-semibold text-foreground" : "text-muted"}>
        {formatMoney(off ? subtractDecimals(line.price, off) : line.price)}
      </span>
    </span>
  );
}

/**
 * The POS Booking Bridge (FR-3).
 *
 * TWO TABS, AND BOTH ARE ALWAYS AVAILABLE — the PRD is explicit: "Kedua tab
 * tersedia setiap kali modal dibuka". A shop where half the grooming is walked in
 * would otherwise have to make an appointment retrospectively before it could
 * take the money, which is the flow the shortcut exists to remove.
 *
 * THE FIRST TAB IS "TARIK" ONLY WHEN THERE IS SOMETHING TO PULL. With nothing
 * on today, opening on an empty list and asking somebody to notice
 * a second tab is a worse first frame than opening on the tab that can actually
 * do something — so the default follows the data. The empty state still says
 * where to go, per the PRD's edge case.
 *
 * NOTHING IS WRITTEN HERE. `onPull` hands the chosen bookings back and the POS
 * decides what to do with them; marking them as pulled belongs to whatever
 * creates the cart, inside the transaction that writes it (Fase 6). A dialog that
 * marked them itself would leave bookings claimed by a cart that was never built.
 */
export function BookingBridgeDialog({
  customerId,
  customerName,
  open,
  initialTab,
  busy = false,
  onOpenChange,
  onPull,
  onAdd,
}: {
  customerId: string;
  customerName?: string;
  open: boolean;
  /**
   * Which half to land on, when the caller knows what the cashier came for.
   *
   * A CASHIER WHO PRESSED "Tambah layanan" HAS ALREADY SAID SO, and opening them
   * on the pull list would make them find the tab they had just chosen. Left
   * undefined the tab follows the data — see `activeTab` below.
   */
  initialTab?: Tab;
  onOpenChange: (open: boolean) => void;
  /** True while a cart write started from here is still in flight. */
  busy?: boolean;
  /**
   * Handed every booking the cashier ticked on the first tab — and every trip
   * left behind they ticked (11 October 2026), billed on its own.
   */
  onPull: (bookings: Booking[], tripIds?: string[]) => void;
  /**
   * Handed every animal the cashier ticked something for on the second tab.
   *
   * A LIST, because one opening may cover a customer's whole household (FR-3:
   * "pilih hewan bisa lebih dari satu"). It reaches the server as ONE cart
   * patch, so either all of it lands or none does.
   *
   * CHOICES, NOT BOOKINGS. Nothing has been written yet — see `AddServiceTab`.
   */
  onAdd: (choices: AddServiceChoice[]) => void;
}) {
  /*
    `refetch` is gone with the ad-hoc tab's write. That tab used to create a
    booking, which meant the pull list beside it had gone stale; now it writes
    nothing, so there is nothing to re-ask about.
  */
  const { bookings, trips, loading, error } = useBookingBridge(
    open ? customerId : null,
  );
  /*
    `null` MEANS "THE CASHIER HAS NOT CHOSEN", which is not the same as "pull".
    The default is DERIVED during render from what came back rather than pushed
    into state by an effect, and the difference is a real bug rather than a lint
    preference: an effect that flipped the tab when the fetch landed would move
    somebody who had already tapped "Tambah layanan baru" — or, on a slow
    connection, move them after they had started ticking services.

    Once `tab` is set, it wins for the life of the dialog.
  */
  const [tab, setTab] = useState<Tab | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [tickedTrips, setTickedTrips] = useState<Set<string>>(new Set());
  const chosenOrphans = trips.filter((trip) => tickedTrips.has(trip.tripId));
  const nothingToPull = bookings.length === 0 && trips.length === 0;

  const chosen = bookings.filter((booking) => ticked.has(booking._id));
  const chosenTrips = tripKeysOf(chosen);

  const activeTab: Tab =
    tab ?? initialTab ?? (!loading && nothingToPull ? "adhoc" : "pull");

  /** Closing forgets everything — the next customer starts clean. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setTicked(new Set());
      setTickedTrips(new Set());
      setTab(null);
    }
    onOpenChange(next);
  }

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTrip(id: string) {
    setTickedTrips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function confirmPull() {
    onPull(
      bookings.filter((booking) => ticked.has(booking._id)),
      chosenOrphans.map((trip) => trip.tripId),
    );
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Layanan untuk {customerName ?? "pelanggan ini"}
          </DialogTitle>
          <DialogDescription>
            Tarik booking yang sudah ada, atau tambahkan layanan baru langsung
            di sini.
          </DialogDescription>
        </DialogHeader>

        {/* Two buttons acting as tabs. `aria-pressed` rather than a tablist
            because there are two panels and no roving focus to manage. */}
        <div className="flex gap-2 border-b border-border pb-3">
          <Button
            type="button"
            variant={activeTab === "pull" ? "default" : "secondary"}
            size="sm"
            aria-pressed={activeTab === "pull"}
            onClick={() => setTab("pull")}
          >
            <CalendarCheck className="size-4" />
            Tarik booking
            {bookings.length + trips.length > 0 && ` (${bookings.length + trips.length})`}
          </Button>
          <Button
            type="button"
            variant={activeTab === "adhoc" ? "default" : "secondary"}
            size="sm"
            aria-pressed={activeTab === "adhoc"}
            onClick={() => setTab("adhoc")}
          >
            <Plus className="size-4" />
            Tambah layanan baru
          </Button>
        </div>

        {error && <Alert variant="error">{error}</Alert>}

        {activeTab === "pull" ? (
          loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted">
              <Spinner /> Memuat booking…
            </div>
          ) : nothingToPull ? (
            /* The PRD's edge case: a customer with no booking today is pointed
               at the other tab rather than left on an empty list. */
            <div className="flex flex-col items-start gap-3 py-8">
              <p className="text-sm text-muted">
                Tidak ada booking yang bisa ditarik hari ini.
              </p>
              <Button type="button" onClick={() => setTab("adhoc")}>
                <Plus className="size-4" />
                Tambah layanan baru
              </Button>
            </div>
          ) : (
            <>
              {/*
                ONE ROW PER BOOKING, headed by its animal (FR-3's "dikelompokkan
                per hewan"). A booking is one animal and one main service, so the
                name on the row is the whole answer to "whose is this" — a
                customer with two dogs reads as two named rows, not as four
                indistinguishable ones.

                TWO BOOKINGS FOR ONE ANIMAL STAY TWO ROWS. That is the PRD's own
                edge case ("keduanya tetap ditampilkan sebagai baris terpisah,
                tidak digabung otomatis"): they may be a morning bath and an
                afternoon nail trim, and merging them would make the cashier
                untangle one line into two invoices.

                ORDER IS PRESERVED — the server sorts by `scheduledAt`, so the
                animal arriving first heads the list.
              */}
              <ul className="flex max-h-80 flex-col gap-2 overflow-y-auto">
                {bookings.map((booking) => {
                  // Null only when the reference is broken — a pet deleted
                  // outright. Named rather than left blank, because a row with
                  // no animal is a row nobody can act on.
                  const petName = booking.petName ?? "Hewan tidak diketahui";
                  const { service } = booking;

                  return (
                    <li key={booking._id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover">
                        <Checkbox
                          checked={ticked.has(booking._id)}
                          onCheckedChange={() => toggle(booking._id)}
                          /* Named by its own row: every checkbox here is
                             otherwise announced identically. */
                          aria-label={`Tarik ${booking.bookingNumber ?? "booking tanpa nomor"} untuk ${petName}`}
                          className="mt-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          {/*
                            THE ANIMAL, THE NUMBER AND THE STATUS, side by side.
                            The list is not all one thing: since the bridge
                            started offering every status but `cancelled`, a row
                            can be a grooming already on the table, one finished
                            an hour ago, or an appointment nobody confirmed. The
                            cashier is about to charge for it either way, but
                            "Completed" and "Draft" are different conversations
                            across a counter.

                            A DRAFT HAS NO NUMBER — it earns one when it is paid
                            for (see the model) — so the number is not assumed to
                            be there. It read `null` on screen for exactly as
                            long as it took to look.
                          */}
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-foreground">
                              {petName}
                            </span>
                            <span className="text-xs tabular-nums text-warning">
                              {booking.bookingNumber ?? "Belum bernomor"}
                            </span>
                            <BookingStatusBadge status={booking.status} />
                          </span>

                          <span className="mt-1 flex items-baseline justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-foreground">
                                {service.name}
                              </span>
                              {/*
                                WHO IS DOING IT. Never blank: the server sends
                                "Belum ditentukan" for an unassigned slot (FR-3's
                                edge case), so a cashier can see the gap rather
                                than guess at an empty line.
                              */}
                              <span className="block truncate text-xs text-muted">
                                {booking.groomerName}
                              </span>
                            </span>
                            <LinePrice line={service} />
                          </span>

                          {/*
                            THE ADD-ONS, UNDER THE SERVICE they were done to —
                            the same shape the basket draws once they are pulled,
                            so the cashier checks one picture twice rather than
                            two. Each keeps its own price, because each bills as
                            a line of its own.
                          */}
                          {service.addons.some((addon) => !addon.visitFee) && (
                            <span className="mt-1 ml-1 flex flex-col gap-0.5 border-l border-border pl-2">
                              {service.addons.filter((addon) => !addon.visitFee).map((addon) => (
                                <span
                                  key={addon.itemId}
                                  className="flex items-baseline justify-between gap-3"
                                >
                                  <span className="min-w-0 truncate text-xs text-foreground">
                                    {`+ ${addon.name}`}
                                  </span>
                                  <LinePrice line={addon} small />
                                </span>
                              ))}
                            </span>
                          )}

                          {/* The trip was billed with another booking of the house. */}
                          {billedTripNote(booking.visitTrip) && (
                            <span className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
                              <House className="size-4 shrink-0" aria-hidden />
                              {billedTripNote(booking.visitTrip)}
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  );
                })}

                {/*
                  EACH TRIP STILL OWED, ONCE — not under the grooming of the
                  booking that happens to carry it (11 October 2026). No box of
                  its own: it comes along with the first booking of the trip that
                  is ticked, and the server makes sure it is billed only once.
                */}
                {owedTripsOf(bookings).map((trip) => {
                  const coming = chosenTrips.has(trip.key);

                  return (
                    <li key={`trip-${trip.key}`}>
                      <div
                        data-bridge-trip
                        data-coming={coming ? "true" : "false"}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          coming ? "border-primary bg-surface-selected" : "border-border"
                        }`}
                      >
                        <House className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-foreground">
                            Perjalanan home grooming
                          </span>
                          <span className="mt-1 flex items-baseline justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-sm text-foreground">
                                {trip.name}
                              </span>
                              {trip.petNames.length > 0 && (
                                <span className="block truncate text-xs text-muted">
                                  Untuk {trip.petNames.join(", ")}
                                </span>
                              )}
                            </span>
                            <span className="shrink-0 text-sm tabular-nums text-muted">
                              {formatMoney(trip.amount)}
                            </span>
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {coming
                              ? "Ikut ditarik ke keranjang"
                              : "Ikut ditarik bersama booking pertama yang dicentang"}
                          </span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/*
                ─── TRIPS LEFT BEHIND (11 October 2026) ─────────────────────

                Every booking of the trip was billed, the trip was not — Cici
                and Coco rung up, the journey forgotten. Nothing above can bring
                it, so it is offered here on its own, with a box of its own.
              */}
              {trips.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Perjalanan belum ditagih
                  </p>
                  <ul className="flex flex-col gap-2">
                    {trips.map((trip) => (
                      <li key={`orphan-${trip.tripId}`}>
                        <label
                          data-orphan-trip
                          className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover"
                        >
                          <Checkbox
                            checked={tickedTrips.has(trip.tripId)}
                            onCheckedChange={() => toggleTrip(trip.tripId)}
                            aria-label={`Tarik perjalanan ${trip.name}`}
                            className="mt-0.5"
                          />
                          <House className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-3">
                              <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                                {trip.name}
                              </span>
                              <span className="shrink-0 text-sm tabular-nums text-muted">
                                {formatMoney(trip.amount)}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {[
                                trip.petNames.length > 0 ? `Untuk ${trip.petNames.join(", ")}` : null,
                                trip.bookingNumbers.length > 0
                                  ? `booking ${trip.bookingNumbers.join(", ")} sudah ditagih`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleOpenChange(false)}
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={confirmPull}
                  disabled={ticked.size === 0 && tickedTrips.size === 0}
                >
                  Tarik ke keranjang
                  {(ticked.size > 0 || tickedTrips.size > 0) &&
                    ` · ${formatMoney(
                      sumDecimals([pullTotalOf(chosen), ...chosenOrphans.map((trip) => trip.amount)]),
                    )}`}
                </Button>
              </DialogFooter>
            </>
          )
        ) : (
          <AddServiceTab
            customerId={customerId}
            busy={busy}
            onAdd={(choices) => {
              onAdd(choices);
              handleOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
