"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";

import { Alert, Card } from "@/components";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Can } from "@/features/permissions";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingBelonging } from "@/types/api";

/**
 * BARANG BAWAAN PAWRENTS — what came in with each animal, and what has gone home.
 *
 * ─── TWO TICKS, NOT ONE ────────────────────────────────────────────────────
 *
 * "Sudah dikembalikan" as a single checkbox cannot tell apart the two states
 * that matter: something written down when the booking was taken and never
 * actually handed over, and something handed over and still in the drawer. Only
 * the second may hold a visit open, and a shop that ticked "returned" on things
 * that never arrived would train itself to ignore the warning.
 *
 * ─── ONE REQUEST PER TICK ──────────────────────────────────────────────────
 *
 * Each box is its own PATCH against that item's id, never a save of the whole
 * list: two counters handing back two animals' things at the same moment would
 * otherwise overwrite each other, and the loser is an item recorded as returned
 * and then quietly un-returned.
 *
 * ─── THE ROW REFLECTS THE SERVER, NOT THE CLICK ────────────────────────────
 *
 * Nothing is ticked locally and reconciled afterwards. The request goes, the
 * booking comes back, and the parent re-renders from it — so a refusal (handing
 * back something that never arrived) leaves the box exactly as it was rather
 * than flicking and flicking back.
 */
export function BookingBelongingsCard({
  booking,
  petNames,
  onChanged,
}: {
  booking: Booking;
  /** Pet id → name, so a group can be headed by the animal it belongs to. */
  petNames: Map<string, string>;
  /** Called with the updated booking, so the page redraws from the server. */
  onChanged: (booking: Booking) => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const belongings = booking.belongings ?? [];

  if (belongings.length === 0) {
    return null;
  }

  /* Grouped by animal, in the order the rows put them on the visit. */
  const byPet = new Map<string, BookingBelonging[]>();
  for (const belonging of belongings) {
    const list = byPet.get(belonging.petId) ?? [];
    list.push(belonging);
    byPet.set(belonging.petId, list);
  }

  /*
    STILL HERE: handed over, not yet given back. An item that never arrived is
    NOT outstanding — it is why these are two dates and not one flag — and
    counting it would hold the visit open over something nobody brought.
  */
  const outstanding = belongings.filter(
    (belonging) => belonging.checkedInAt && !belonging.checkedOutAt,
  );

  async function tick(
    belonging: BookingBelonging,
    patch: { checkedIn?: boolean; checkedOut?: boolean },
  ) {
    setBusyId(belonging._id);
    setError(null);

    try {
      onChanged(
        await bookingService.checkBelonging(booking._id, belonging._id, patch),
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.reason ?? err.message)
          : "Tidak bisa disimpan. Coba lagi.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card
      title="Barang bawaan"
      description="Dicentang saat diterima, dan saat dikembalikan ke pemiliknya."
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="error">{error}</Alert>}

        {/*
          THE WARNING SAYS WHAT IS MISSING, not that something is. "Masih ada
          barang" sends somebody hunting; naming the carrier tells them what to
          look for — and it is the same sentence the server refuses the
          completion with, so the two never disagree.
        */}
        {outstanding.length > 0 && (
          <Alert variant="warning">
            Belum dikembalikan:{" "}
            <strong>
              {outstanding.map((belonging) => belonging.name).join(", ")}
            </strong>
            . Booking tidak bisa diselesaikan sampai semuanya kembali.
          </Alert>
        )}

        {outstanding.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-muted">
            <PackageCheck className="size-4 text-success" aria-hidden />
            Tidak ada barang yang tertinggal.
          </p>
        )}

        {[...byPet.entries()].map(([petId, items]) => (
          <div key={petId} className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              {petNames.get(petId) ?? "Hewan"}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[22rem] text-sm">
                <thead>
                  <tr className="text-xs text-muted">
                    <th className="py-1 text-left font-medium">Barang</th>
                    <th className="w-20 py-1 text-center font-medium">Masuk</th>
                    <th className="w-20 py-1 text-center font-medium">Keluar</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((belonging) => (
                    <BelongingRow
                      key={belonging._id}
                      belonging={belonging}
                      busy={busyId === belonging._id}
                      onTick={(patch) => void tick(belonging, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BelongingRow({
  belonging,
  busy,
  onTick,
}: {
  belonging: BookingBelonging;
  busy: boolean;
  onTick: (patch: { checkedIn?: boolean; checkedOut?: boolean }) => void;
}) {
  const isIn = Boolean(belonging.checkedInAt);
  const isOut = Boolean(belonging.checkedOutAt);

  return (
    <tr className="border-t border-border">
      <td className="py-2">
        <Label htmlFor={`belonging-in-${belonging._id}`} className="font-normal">
          {belonging.name}
        </Label>
      </td>

      <td className="py-2 text-center">
        {/*
          `Can` RATHER THAN A DISABLED BOX. Somebody without the grant is not
          being stopped mid-act — they are reading the page, and a row of dead
          checkboxes reads as broken. The state still shows: a ticked-and-locked
          box would be a lie, so what they see is the tick as a mark.
        */}
        <Can feature="bookings" action="update" fallback={<Mark on={isIn} />}>
          <Checkbox
            id={`belonging-in-${belonging._id}`}
            aria-label={`${belonging.name} masuk`}
            checked={isIn}
            disabled={busy}
            onCheckedChange={(checked) => onTick({ checkedIn: checked === true })}
          />
        </Can>
      </td>

      <td className="py-2 text-center">
        <Can feature="bookings" action="update" fallback={<Mark on={isOut} />}>
          <Checkbox
            id={`belonging-out-${belonging._id}`}
            aria-label={`${belonging.name} keluar`}
            checked={isOut}
            /*
              NOT TICKABLE BEFORE IT HAS ARRIVED. The server refuses it with a
              409 naming the item; disabling the box means nobody has to read a
              refusal to learn the order the two happen in.
            */
            disabled={busy || !isIn}
            onCheckedChange={(checked) =>
              onTick({ checkedOut: checked === true })
            }
          />
        </Can>
      </td>
    </tr>
  );
}

/** The state, for somebody who may read the page but not tick it. */
function Mark({ on }: { on: boolean }) {
  return (
    <span className={on ? "text-success" : "text-muted"} aria-hidden={false}>
      {on ? "✓" : "–"}
    </span>
  );
}
