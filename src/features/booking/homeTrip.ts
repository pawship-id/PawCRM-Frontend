import type { HomeTripStatus } from "@/types/api";

/** The rungs of a visit's journey, in the order they are walked. */
export const HOME_TRIP_RUNGS = [
  "scheduled",
  "otw_customer",
  "arrived_customer",
  "otw_store",
  "arrived_store",
] as const satisfies readonly HomeTripStatus[];

/**
 * One word per rung — the same word a rung's button carries and the chip says
 * once it is reached ("Berangkat" is both the act and where the trip stands).
 */
export const HOME_TRIP_LABELS: Record<HomeTripStatus, string> = {
  scheduled: "Dijadwalkan",
  otw_customer: "Berangkat",
  arrived_customer: "Sampai di rumah",
  otw_store: "Pulang",
  arrived_store: "Sampai di toko",
  cancelled: "Dibatalkan",
};

/** The one rung a trip may move to from `status`; null at the end or once cancelled. */
export function nextTripRung(status: HomeTripStatus): HomeTripStatus | null {
  const index = HOME_TRIP_RUNGS.indexOf(status as (typeof HOME_TRIP_RUNGS)[number]);
  if (index < 0) return null;
  return HOME_TRIP_RUNGS[index + 1] ?? null;
}
