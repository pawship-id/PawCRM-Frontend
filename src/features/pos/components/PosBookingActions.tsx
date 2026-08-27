"use client";

import { CalendarPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The way into the Booking Bridge that does NOT depend on the banner (FR-3).
 *
 * FR-3 says the modal opens "dari banner **atau tombol booking**", and for a
 * while only the banner existed. That made the whole ad-hoc half unreachable for
 * exactly the customer it was built for: somebody walking in with no appointment
 * — because the banner only appears when there IS an appointment. A shortcut you
 * can only reach by already having the thing it replaces is not a shortcut.
 *
 * IT OPENS ON THE SECOND TAB. A cashier who pressed "Tambah layanan" has already
 * said what they came for; landing them on the pull list would make them find
 * the tab they had just chosen. The banner's own "Tarik" opens the first tab —
 * two verbs, two intents, one modal.
 *
 * A CUSTOMER IS REQUIRED and this renders nothing without one, rather than
 * appearing disabled. An ad-hoc booking needs a pet and a pet needs an owner, so
 * there is no half-state to explain — and `PosCustomerSection` directly above is
 * already inviting the cashier to choose somebody.
 */
export function PosBookingActions({
  disabled = false,
  onOpen,
}: {
  disabled?: boolean;
  onOpen: () => void;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      className="w-full"
      disabled={disabled}
      onClick={onOpen}
    >
      <CalendarPlus className="size-4" />
      Tambah layanan untuk hewan
    </Button>
  );
}
