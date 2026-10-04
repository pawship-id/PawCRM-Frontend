import type { CommissionRow, CommissionStatus } from "@/types/api";

/** Where the Komisi tab lives, and where one row of it opens. */
export const COMMISSIONS_HREF = "/dashboard/keuangan/komisi";

export function commissionHref(row: {
  bookingId: string;
  groomerUserId: string;
}): string {
  return `${COMMISSIONS_HREF}/${row.bookingId}/${row.groomerUserId}`;
}

/** The mockup's words for each status, plus the two it had no row for. */
export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  pending: "Menunggu Persetujuan",
  approved: "Disetujui",
  paid: "Dibayar",
  reversed: "Dibatalkan",
  mixed: "Campuran",
};

/** The statuses a person can filter by, in the order work moves through them. */
export const COMMISSION_STATUS_FILTERS: CommissionStatus[] = [
  "pending",
  "approved",
  "paid",
  "reversed",
];

export const COMMISSION_STATUS_TONE: Record<CommissionStatus, string> = {
  pending: "bg-tint-warning text-secondary-foreground",
  approved: "bg-tint-brand text-primary",
  paid: "bg-tint-success text-success",
  reversed: "bg-tint-neutral text-muted",
  mixed: "bg-tint-neutral text-foreground",
};

/**
 * CAN THIS ROW BE TICKED? Everything live and not yet paid — the bulk bar
 * approves what is pending and pays what is approved, and says which it did.
 * A paid or cancelled row has nothing left to do, so its box is disabled, as in
 * the mockup.
 */
export function isSelectable(row: Pick<CommissionRow, "status">): boolean {
  return row.status === "pending" || row.status === "approved";
}

/**
 * The status a row may be moved to from its dropdown — the mockup's control,
 * with the rule the Owner added (21 September 2026): only an APPROVED row can
 * become Dibayar. A pending row offers approval and nothing further.
 */
export function nextStatuses(status: CommissionStatus): CommissionStatus[] {
  switch (status) {
    case "pending":
      return ["pending", "approved"];
    case "approved":
      return ["pending", "approved", "paid"];
    default:
      return [status];
  }
}

/** Selection is kept by key; the server wants the two ids. */
export function rowKeyOf(key: string): { bookingId: string; groomerUserId: string } {
  const [bookingId, groomerUserId] = key.split(":");
  return { bookingId, groomerUserId };
}

/** `YYYY-MM-DD` / ISO → "10 Sep 2026", the way the rest of Keuangan writes a date. */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
