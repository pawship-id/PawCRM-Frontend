"use client";

import { useEffect, useState } from "react";

import { bookingService } from "@/services/booking.service";
import type { GroomerAvailability } from "@/types/api";

/**
 * The staff who can be a stay's PIC or tick a task on `date` — the same list
 * grooming's crew picker reads (staff marked as groomers earn commission).
 * Fails softly: an empty list, and the picker says so.
 */
export function useHotelStaff(date: string | null) {
  const [staff, setStaff] = useState<GroomerAvailability[]>([]);
  const [loading, setLoading] = useState(Boolean(date));

  useEffect(() => {
    if (!date) return;
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading follows the day asked about
    setLoading(true);
    bookingService
      .availability(date, "groomer")
      .then((rows) => {
        if (active) setStaff(rows);
      })
      .catch(() => {
        if (active) setStaff([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [date]);

  const nameOf = (id: string | null | undefined) =>
    id ? (staff.find((row) => row._id === id)?.fullName ?? "Staf") : null;

  return { staff, loading, nameOf };
}
