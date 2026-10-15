import type { PageTab } from "@/components";
import type { CanCheck, GatedTab } from "@/features/permissions/gatedTabs";

export const BERANDA_HREF = "/dashboard";

/**
 * The tabs a role sees. Since 15 October 2026 each answers to its own "Lihat"
 * in the role editor (Beranda › Hari Ini, Uang, Operasional, Cabang), and a
 * tab that shows data also needs the grant of that data — the tab grant alone
 * would open an empty screen:
 *
 * - Hari Ini — `berandaToday`; each of its cards checks its own grant.
 * - Uang — `berandaMoney` and the ledger (`journalEntries:read`).
 * - Operasional — `berandaOperations` and the bookings (`bookings:read`).
 * - Cabang — `berandaBranches` and the ledger, and only with more than one
 *   cabang: a table of one row compares nothing.
 */
export function berandaTabAccess(can: CanCheck, manyBranches: boolean) {
  const ledger = can("journalEntries", "read");
  return {
    today: can("berandaToday", "read"),
    money: ledger && can("berandaMoney", "read"),
    operations: can("bookings", "read") && can("berandaOperations", "read"),
    branches: ledger && manyBranches && can("berandaBranches", "read"),
  };
}

export function berandaTabs(
  access: ReturnType<typeof berandaTabAccess>,
): PageTab[] {
  return [
    ...(access.today
      ? [{ label: "Hari Ini", href: BERANDA_HREF, exact: true }]
      : []),
    ...(access.money ? [{ label: "Uang", href: `${BERANDA_HREF}/uang` }] : []),
    ...(access.operations
      ? [{ label: "Operasional", href: `${BERANDA_HREF}/operasional` }]
      : []),
    ...(access.branches
      ? [{ label: "Cabang", href: `${BERANDA_HREF}/cabang` }]
      : []),
  ];
}

/**
 * Where Hari Ini sends a role that may not see it — the first other tab whose
 * own grant it holds. Each of those pages checks its data grant again.
 */
export const BERANDA_TABS: GatedTab[] = [
  { label: "Hari Ini", href: BERANDA_HREF, exact: true, anyOf: [{ feature: "berandaToday" }] },
  { label: "Uang", href: `${BERANDA_HREF}/uang`, anyOf: [{ feature: "berandaMoney" }] },
  {
    label: "Operasional",
    href: `${BERANDA_HREF}/operasional`,
    anyOf: [{ feature: "berandaOperations" }],
  },
  { label: "Cabang", href: `${BERANDA_HREF}/cabang`, anyOf: [{ feature: "berandaBranches" }] },
];
