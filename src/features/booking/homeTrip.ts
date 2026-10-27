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

/** "12 Okt · 09.05" — the day too, since a visit's rungs may straddle midnight. */
export function tripStamp(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = at.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
  const clock = `${String(at.getHours()).padStart(2, "0")}.${String(at.getMinutes()).padStart(2, "0")}`;
  return `${day} · ${clock}`;
}

/** The one rung a trip may move to from `status`; null at the end or once cancelled. */
export function nextTripRung(status: HomeTripStatus): HomeTripStatus | null {
  const index = HOME_TRIP_RUNGS.indexOf(status as (typeof HOME_TRIP_RUNGS)[number]);
  if (index < 0) return null;
  return HOME_TRIP_RUNGS[index + 1] ?? null;
}

/**
 * THE CONFIRM DIALOG BEFORE A TRIP RUNG (27 October 2026) — one wording for the
 * groomer app and the admin's trip page. A rung only moves forward, is stamped
 * with the hour, and the next rung's button appears where this one was, so a
 * double tap would otherwise record two.
 */
export function homeTripConfirmCopy(to: HomeTripStatus): {
  title: string;
  body: string;
  confirmLabel: string;
} {
  const label = HOME_TRIP_LABELS[to];
  const extra =
    to === "arrived_customer"
      ? " Hewan yang belum ditandai datang sekalian ditandai sudah datang."
      : "";

  return {
    title: `${label}?`,
    body: `"${label}" dicatat dengan jam sekarang. Langkah perjalanan tidak bisa diundur.${extra}`,
    confirmLabel: label,
  };
}
