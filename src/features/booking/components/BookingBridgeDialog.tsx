"use client";

import { useState } from "react";
import { CalendarCheck, Plus } from "lucide-react";

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
import { formatMoney } from "@/utils/decimal";
import type { Booking } from "@/types/api";

import { useBookingBridge } from "../hooks/useBookingBridge";
import { AddServiceTab } from "./AddServiceTab";

/** The two halves of the modal. FR-3 requires both to be reachable every time. */
type Tab = "pull" | "adhoc";

/**
 * The bookings, gathered under the animal each is for (FR-3).
 *
 * "Daftar booking dikelompokkan per hewan peliharaan" — a customer with two dogs
 * booked for the same morning otherwise reads as four indistinguishable rows,
 * and the cashier has to open each one to find out whose it is.
 *
 * TWO BOOKINGS FOR ONE ANIMAL STAY TWO ROWS inside its group. That is the PRD's
 * own edge case ("keduanya tetap ditampilkan sebagai baris terpisah, tidak
 * digabung otomatis"): they may be a morning bath and an afternoon nail trim,
 * and merging them would make the cashier untangle one line into two invoices.
 *
 * ORDER IS PRESERVED — the server sorts by `scheduledAt`, so the animal arriving
 * first heads the list.
 */
function groupByPet(
  bookings: Booking[],
): Array<{ petId: string; petName: string; bookings: Booking[] }> {
  const groups: ReturnType<typeof groupByPet> = [];

  bookings.forEach((booking) => {
    const existing = groups.find((group) => group.petId === booking.petId);

    if (existing) {
      existing.bookings.push(booking);
      return;
    }

    groups.push({
      petId: booking.petId,
      // Null only when the reference is broken — a pet deleted outright. Named
      // rather than left blank, because a group with no title is a group nobody
      // can act on.
      petName: booking.petName ?? "Hewan tidak diketahui",
      bookings: [booking],
    });
  });

  return groups;
}

/** The sum of a booking's items, as a decimal string the formatter can read. */
function bookingTotal(booking: Booking): string {
  return booking.items
    .reduce((total, item) => total + Number(item.price), 0)
    .toFixed(4);
}

/**
 * The POS Booking Bridge (FR-3).
 *
 * TWO TABS, AND BOTH ARE ALWAYS AVAILABLE — the PRD is explicit: "Kedua tab
 * tersedia setiap kali modal dibuka". A shop where half the grooming is walked in
 * would otherwise have to make an appointment retrospectively before it could
 * take the money, which is the flow the shortcut exists to remove.
 *
 * THE FIRST TAB IS "TARIK" ONLY WHEN THERE IS SOMETHING TO PULL. With no
 * confirmed booking today, opening on an empty list and asking somebody to notice
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
  onOpenChange,
  onPull,
}: {
  customerId: string;
  customerName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Handed every booking the cashier ticked, or the one just created ad-hoc. */
  onPull: (bookings: Booking[]) => void;
}) {
  const { bookings, loading, error, refetch } = useBookingBridge(
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

  const activeTab: Tab =
    tab ?? (!loading && bookings.length === 0 ? "adhoc" : "pull");

  /** Closing forgets everything — the next customer starts clean. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setTicked(new Set());
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

  function confirmPull() {
    onPull(bookings.filter((booking) => ticked.has(booking._id)));
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Layanan untuk {customerName ?? "pelanggan ini"}</DialogTitle>
          <DialogDescription>
            Tarik booking yang sudah ada, atau tambahkan layanan baru langsung di
            sini.
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
            {bookings.length > 0 && ` (${bookings.length})`}
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
          ) : bookings.length === 0 ? (
            /* The PRD's edge case: a customer with no booking today is pointed
               at the other tab rather than left on an empty list. */
            <div className="flex flex-col items-start gap-3 py-8">
              <p className="text-sm text-muted">
                Tidak ada booking terkonfirmasi untuk hari ini.
              </p>
              <Button type="button" onClick={() => setTab("adhoc")}>
                <Plus className="size-4" />
                Tambah layanan baru
              </Button>
            </div>
          ) : (
            <>
              <div className="flex max-h-80 flex-col gap-4 overflow-y-auto">
                {groupByPet(bookings).map((group) => (
                  <section key={group.petId} className="flex flex-col gap-2">
                    {/* The animal heads its own bookings — FR-3's grouping. */}
                    <h3 className="text-sm font-semibold text-foreground">
                      {group.petName}
                    </h3>

                    <ul className="flex flex-col gap-2">
                      {group.bookings.map((booking) => (
                        <li key={booking._id}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-surface-hover">
                            <Checkbox
                              checked={ticked.has(booking._id)}
                              onCheckedChange={() => toggle(booking._id)}
                              /* Named by its own row: every checkbox here is
                                 otherwise announced identically. */
                              aria-label={`Tarik ${booking.bookingNumber} untuk ${group.petName}`}
                              className="mt-0.5"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs tabular-nums text-warning">
                                {booking.bookingNumber}
                              </span>
                              <span className="mt-1 block">
                                {booking.items.map((item) => (
                                  <span
                                    key={item.serviceId}
                                    className="flex items-baseline justify-between gap-3"
                                  >
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-medium text-foreground">
                                        {item.name}
                                      </span>
                                      {/*
                                        WHO IS DOING IT. Never blank: the server
                                        sends "Belum ditentukan" for an
                                        unassigned slot (FR-3's edge case), so a
                                        cashier can see the gap rather than
                                        guess at an empty line.
                                      */}
                                      <span className="block truncate text-xs text-muted">
                                        {item.groomerName}
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-sm tabular-nums text-muted">
                                      {formatMoney(item.price)}
                                    </span>
                                  </span>
                                ))}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>

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
                  disabled={ticked.size === 0}
                >
                  Tarik ke keranjang
                  {ticked.size > 0 &&
                    ` · ${formatMoney(
                      bookings
                        .filter((b) => ticked.has(b._id))
                        .reduce((sum, b) => sum + Number(bookingTotal(b)), 0)
                        .toFixed(4),
                    )}`}
                </Button>
              </DialogFooter>
            </>
          )
        ) : (
          <AddServiceTab
            customerId={customerId}
            onCreated={(booking) => {
              // A fresh ad-hoc booking is handed straight to the cart, and the
              // pull list is re-asked so it does not offer the same one twice.
              refetch();
              onPull([booking]);
              handleOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
