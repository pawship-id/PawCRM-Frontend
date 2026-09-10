"use client";

import type { ReactNode } from "react";

import { Breadcrumb, PageTabs, type PageTab } from "@/components";
import { Badge } from "@/components/ui/badge";
import { usePermissions } from "@/features/permissions";

import {
  useRegistryCounts,
  type RegistryCount,
} from "../hooks/useRegistryCounts";

/**
 * The head of the Pelanggan module, shared by every tab under it — the title,
 * the tab row, and the two numbers that describe the register.
 *
 * ONE HEADER FOR TWO ROUTES. /master/customers and /master/pets are separate
 * screens with separate grants, but the mockup (buloo-navbar-v3.html) draws them
 * as one page with tabs, and the rail now has one row for both. Rendering the
 * same header from both screens is what makes the two routes read as the one
 * module the menu says they are; a second copy would drift within a sprint.
 *
 * THE TITLE IS "Pelanggan" ON BOTH TABS, deliberately — the tab says which list
 * you are looking at, the title says which module you are in. The mockup does
 * the same, and it is why the breadcrumb has one level rather than two.
 *
 * WHAT IS NOT HERE: the mockup's Cabang/Gudang scope row. A customer has no
 * branch in this database — the register is tenant-wide, exactly as the product
 * catalogue is — so the row would be a control that filters nothing, and
 * somebody would set it and believe the list had narrowed. TENANT SCOPING IS
 * UNAFFECTED and is not what this is about: every customer query filters on
 * `tenantId` derived from the session cookie (customer.repository.js), and a
 * cross-tenant id is answered 404. This is only about branches INSIDE one
 * tenant.
 *
 * A paragraph explaining that used to sit under the table. It is a comment now:
 * it answered a question the reader had not asked, and cost a block of the
 * screen to raise a doubt about tenant isolation that the code does not have.
 * The next person reaching for a scope row will land here instead.
 */
export function CustomerModuleHeader({
  /** The create button for the tab you are on — "+ Pelanggan", "+ Hewan". */
  action,
}: {
  action?: ReactNode;
}) {
  const { can } = usePermissions();
  const mayReadCustomers = can("customers", "read");
  const mayReadPets = can("pets", "read");

  const counts = useRegistryCounts(mayReadCustomers, mayReadPets);

  const tabs: PageTab[] = [
    ...(mayReadCustomers
      ? [
          {
            label: "Pelanggan",
            href: "/dashboard/master/customers",
            // EXACT, because the other two tabs are routes UNDER this one. Left
            // prefix-matched it would sit lit beside whichever of them the
            // reader had actually opened.
            exact: true,
          },
        ]
      : []),
    ...(mayReadPets
      ? [{ label: "Hewan", href: "/dashboard/master/pets" }]
      : []),
    // Both open on a "belum tersedia" panel wearing this same header. Ungated:
    // there is no membership feature in the RBAC catalogue to gate them on, and
    // neither page holds anything to protect.
    { label: "Membership", href: "/dashboard/master/customers/membership" },
    { label: "Riwayat", href: "/dashboard/master/customers/riwayat" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <Breadcrumb items={[{ label: "Pelanggan" }]} />
          <h1 className="mt-1 text-2xl font-extrabold text-foreground">
            Pelanggan
          </h1>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian pelanggan" />

      <section
        aria-label="Ringkasan pelanggan"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {mayReadCustomers && (
          <CountTile
            label="Pelanggan terdaftar"
            count={counts.customers}
            caption="tidak termasuk yang dihapus"
          />
        )}
        {mayReadPets && (
          <CountTile
            label="Hewan terdaftar"
            count={counts.pets}
            caption={perOwner(counts.pets, counts.customers)}
          />
        )}

        {/*
          THE TWO THE MOCKUP ASKS FOR AND THE DATABASE CANNOT ANSWER, drawn as
          the landing page draws its dead tiles: badged "Segera", with the reason
          under them. A made-up 23 would be indistinguishable from a real one,
          and a "—" reads as a number that failed to load.
        */}
        {PENDING_TILES.map((tile) => (
          <div
            key={tile.label}
            aria-disabled="true"
            className="rounded-2xl border border-border bg-surface p-5 opacity-60"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-muted">{tile.label}</p>
              <Badge variant="outline">Segera</Badge>
            </div>
            <p className="mt-2 text-xs text-muted">{tile.blockedBy}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

/** The mockup's other two tiles, and what each one is waiting for. */
const PENDING_TILES = [
  {
    label: "Baru bulan ini",
    blockedBy: "Daftar pelanggan belum bisa disaring per tanggal",
  },
  {
    label: "Membership habis ≤30 hari",
    blockedBy: "Membership belum ada di sistem",
  },
];

const NUMBER = new Intl.NumberFormat("id-ID");
const ONE_DECIMAL = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * "1,4 per pelanggan" — the mockup's caption under the animal count, and the one
 * derived number on this header that is genuinely derivable. Empty while either
 * side is unknown, and on an empty register: 0 owners is a division, not a fact.
 */
function perOwner(pets: RegistryCount, customers: RegistryCount): string {
  if (pets.loading || pets.error || customers.loading || customers.error)
    return "";
  if (customers.total === 0) return "";
  return `${ONE_DECIMAL.format(pets.total / customers.total)} per pelanggan`;
}

/**
 * One counted tile. Three states, the same three the landing page's tiles have:
 * a number, a dash while it is on its way, and a dash that says it failed —
 * never a zero standing in for an error.
 */
function CountTile({
  label,
  count,
  caption,
}: {
  label: string;
  count: RegistryCount;
  caption: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
        {count.loading || count.error ? "—" : NUMBER.format(count.total)}
      </p>
      <p className="mt-1 text-xs text-muted">
        {count.error ? "gagal dimuat" : caption}
      </p>
    </div>
  );
}
