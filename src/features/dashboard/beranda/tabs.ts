import type { PageTab } from "@/components";

export const BERANDA_HREF = "/dashboard";

/**
 * The tabs a role sees — the mockup gives an admin Hari Ini and Uang, and an
 * owner or manager all four. Read here off the grants that feed each tab rather
 * than off a role name, which this app does not have.
 *
 * - Hari Ini — always; each of its cards checks its own grant.
 * - Uang — the ledger (`journalEntries:read`).
 * - Operasional — the bookings (`bookings:read`).
 * - Cabang — the ledger, and only with more than one cabang: a table of one
 *   row compares nothing.
 */
export function berandaTabs({
  ledger,
  bookings,
  manyBranches,
}: {
  ledger: boolean;
  bookings: boolean;
  manyBranches: boolean;
}): PageTab[] {
  return [
    { label: "Hari Ini", href: BERANDA_HREF, exact: true },
    ...(ledger ? [{ label: "Uang", href: `${BERANDA_HREF}/uang` }] : []),
    ...(bookings
      ? [{ label: "Operasional", href: `${BERANDA_HREF}/operasional` }]
      : []),
    ...(ledger && manyBranches
      ? [{ label: "Cabang", href: `${BERANDA_HREF}/cabang` }]
      : []),
  ];
}
