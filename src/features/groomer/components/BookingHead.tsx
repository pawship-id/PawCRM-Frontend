import { PawPrint, TriangleAlert } from "lucide-react";

import type { GroomerBooking } from "@/types/groomer";
import { clock } from "../dates";
import { Pill } from "./Pill";

/**
 * The animal, said once — the top of a card and of the detail screen.
 *
 * THE ANIMAL, NEVER ITS OWNER. There is no owner, phone, address or price in the
 * data this draws from, so nothing here could show one.
 */
export function BookingHead({
  booking,
  showHandling = true,
}: {
  booking: GroomerBooking;
  /** A collapsed card leaves the note to the expanded one; the warning tags stay. */
  showHandling?: boolean;
}) {
  const { pet } = booking;
  const facts = [pet.breed ?? pet.species, pet.weightKg != null ? `${pet.weightKg} kg` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 flex-none items-center justify-center rounded-xl bg-tint-warning text-warning"
        >
          <PawPrint className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-bold">{pet.name ?? "Hewan"}</h3>
          {facts && <p className="text-xs text-muted">{facts}</p>}
        </div>
        <p className="flex-none text-sm font-bold tabular-nums">{clock(booking.scheduledAt)}</p>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {pet.size && <Pill>{pet.size}</Pill>}
        {pet.furType && <Pill>{pet.furType}</Pill>}
        {pet.tags.map((tag) => (
          <Pill key={tag} tone="warning" icon={<TriangleAlert className="size-3" aria-hidden="true" />}>
            {tag}
          </Pill>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted">
        {booking.serviceName}
        {booking.addons.length > 0 && ` · + ${booking.addons.join(", ")}`}
      </p>

      {showHandling && pet.handling && (
        <div className="mt-3 rounded-lg bg-tint-warning px-3 py-2 text-sm text-warning">
          <p className="text-xs font-semibold">Catatan penanganan</p>
          {pet.handling}
        </div>
      )}
    </>
  );
}
