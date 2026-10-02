"use client";

import type { ReactNode } from "react";

import { PageTabs, StatTile, type PageTab } from "@/components";
import { usePermissions } from "@/features/permissions";

import {
  useRegistryCounts,
  type CustomerStatsState,
  type RegistryCount,
} from "../hooks/useRegistryCounts";

/**
 * The head of the Pelanggan module, shared by every tab under it — the title,
 * the tab row, and the four numbers that describe the register.
 *
 * ONE HEADER FOR EVERY TAB. /master/customers, /master/pets and the Ringkasan
 * tab are separate screens with separate grants, but the mockup draws them as
 * one page with tabs, and the rail has one row for all of them. Rendering the
 * same header from each screen is what makes the routes read as the one module
 * the menu says they are; a second copy would drift within a sprint.
 *
 * THE TITLE IS "Pelanggan" ON EVERY TAB, deliberately — the tab says which list
 * you are looking at, the title says which module you are in. The mockup does
 * the same. NO BREADCRUMB BELOW IT (2 October 2026, on request) — a one-level
 * trail that only ever said "Pelanggan" again was repeating the title, not
 * locating it; a one-line sentence under the title earns that space better.
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
  /**
   * A card row of this tab's own, INSTEAD of the register's four.
   *
   * THE RINGKASAN TAB ASKS A DIFFERENT QUESTION, so it draws different cards:
   * the register's totals answer "how big is this shop", while Ringkasan's
   * answer "what happened this period, and is it better than last". Drawing both
   * rows would be seven numbers above a worklist, and the reader would have to
   * work out which four of them the page below is not about.
   *
   * Passing this also stops the header FETCHING the register's figures — the tab
   * that overrides the row has already asked for what it needs, and the two
   * requests would be the same endpoint twice.
   */
  tiles,
}: {
  action?: ReactNode;
  tiles?: ReactNode;
}) {
  const { can } = usePermissions();
  const mayReadCustomers = can("customers", "read");
  const mayReadPets = can("pets", "read");
  const ownTiles = tiles !== undefined;

  const counts = useRegistryCounts(
    mayReadCustomers && !ownTiles,
    mayReadPets && !ownTiles,
  );

  const tabs: PageTab[] = [
    ...(mayReadCustomers
      ? [
          {
            /*
              THE MODULE'S FRONT PAGE, and the one tab that is not a list: who
              has stopped coming, who has just arrived. It is first because it is
              what somebody opens the module to find out — the register itself is
              a thing you go to when you already know whose name you are after.

              EXACT, like Pelanggan below, and for the same reason: it is a route
              UNDER /master/customers.
            */
            label: "Ringkasan",
            href: "/dashboard/master/customers/ringkasan",
            exact: true,
          },
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
    /*
      NOT EXACT, unlike Pelanggan above — Membership has sub-tabs of its own
      (Paket / Kartu / Perpanjangan) and has to stay underlined on all three.
      Its own row handles which of the three is current.

      The page behind it is real and gated on `membershipPlans:read`; only
      Riwayat below still opens on a "belum tersedia" panel.
    */
    { label: "Membership", href: "/dashboard/master/customers/membership" },
    { label: "Riwayat", href: "/dashboard/master/customers/riwayat" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            Pelanggan
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Satu profil pemilik, banyak hewan, satu riwayat — satu basis data
            untuk seluruh cabang.
          </p>
        </div>
        {action && <div className="ml-auto flex flex-none gap-2">{action}</div>}
      </div>

      <PageTabs tabs={tabs} ariaLabel="Bagian pelanggan" />

      {/*
        THE REGISTER'S FOUR, AND ALL FOUR ARE REAL NOW (27 September 2026). Two of
        them used to be `PendingStatTile`s — the database could not be asked how
        many customers arrived this month, or how many had bought anything lately,
        because the list endpoint has no date filter. `GET /customers/stats`
        answers both, so the badges are gone rather than redrawn.

        EACH CAPTION READS ITS WINDOW OFF THE ANSWER. The server says which number
        of days it measured, so a tile cannot caption "30 hari terakhir" over a
        figure counted across 60.

        A TAB MAY REPLACE THE WHOLE ROW — see `tiles` above.
      */}
      {ownTiles ? (
        tiles
      ) : (
        <section
          aria-label="Ringkasan pelanggan"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {mayReadPets && (
            <StatTile
              label="Jumlah hewan"
              value={NUMBER.format(counts.pets.total)}
              caption={perOwner(counts.pets, counts.customers)}
              hint="Total hewan peliharaan yang terdaftar, tidak termasuk yang dihapus."
              loading={counts.pets.loading}
              error={counts.pets.error}
            />
          )}
          {mayReadCustomers && (
            <>
              <StatTile
                label="Jumlah pelanggan"
                value={NUMBER.format(counts.customers.data?.total ?? 0)}
                caption="tidak termasuk yang dihapus"
                hint="Total pelanggan terdaftar, tidak termasuk yang dihapus."
                loading={counts.customers.loading}
                error={counts.customers.error}
              />
              <StatTile
                label="Pelanggan baru bulan ini"
                value={NUMBER.format(
                  counts.customers.data?.newCustomers.count ?? 0,
                )}
                caption={`${counts.customers.data?.newCustomers.days ?? 30} hari terakhir`}
                hint="Pelanggan yang didaftarkan dalam jangka waktu di bawah angka ini, dihitung dari tanggal daftar."
                loading={counts.customers.loading}
                error={counts.customers.error}
              />
              <StatTile
                label={`Transaksi ${counts.customers.data?.activeCustomers.days ?? 90} hari terakhir`}
                value={activeShare(counts.customers)}
                caption="dari seluruh pelanggan terdaftar"
                hint="Pelanggan yang bertransaksi dalam jangka waktu di atas, dibagi seluruh pelanggan terdaftar."
                loading={counts.customers.loading}
                error={counts.customers.error}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

const NUMBER = new Intl.NumberFormat("id-ID");
const ONE_DECIMAL = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * "1,4 per pelanggan" — the caption under the animal count, and the one derived
 * number on this header. Empty while either side is unknown, and on an empty
 * register: 0 owners is a division, not a fact.
 */
function perOwner(pets: RegistryCount, customers: CustomerStatsState): string {
  if (pets.loading || pets.error || customers.loading || customers.error)
    return "";

  const owners = customers.data?.total ?? 0;
  if (owners === 0) return "";

  return `${ONE_DECIMAL.format(pets.total / owners)} per pelanggan`;
}

/**
 * "42%" — how much of the register bought something inside the window.
 *
 * A DASH WHEN THE SERVER DECLINED TO DIVIDE. `share` is null on an empty
 * register, because 0 customers out of 0 is a question with no answer — and a
 * tile reading "0%" over a shop that opened this week is a failure report rather
 * than a fact.
 */
function activeShare(customers: CustomerStatsState): string {
  const share = customers.data?.activeCustomers.share;
  if (share === null || share === undefined) return "—";

  return `${Math.round(share * 100)}%`;
}
