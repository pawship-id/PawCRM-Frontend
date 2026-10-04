"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { Alert, Card, Spinner, Pagination } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";

import { useCustomers, type CustomersQuery } from "../hooks/useCustomers";
import { CustomerModuleHeader } from "./CustomerModuleHeader";
import { CustomersToolbar } from "./CustomersToolbar";
import { CustomersTable } from "./CustomersTable";

/**
 * The Pelanggan tab of the Pelanggan module. Owns the list query (useCustomers)
 * and wires the toolbar, table and pager together. Row mutations call
 * `handleRowChanged`, which refetches the list AND bumps the header's
 * `refreshKey` — a delete or a restore here moves "Jumlah pelanggan" too,
 * not just the rows under it.
 *
 * THE HEADER AND THE CREATE BUTTON ARE THE MODULE'S, NOT THIS SCREEN'S — same
 * title, same tabs and same tiles as the Hewan tab, which is what makes two
 * routes read as one page. Only the button's destination changes with the tab.
 */
export function CustomersScreen({
  /**
   * What `?createdSince=` parsed to, read by the server page and handed down
   * — see `customersQueryFromParams`. Seeds `useCustomers`'s first render;
   * the hook owns the query from then on.
   */
  initialQuery,
}: {
  initialQuery?: Partial<CustomersQuery>;
} = {}) {
  const router = useRouter();
  const { customers, pagination, query, loading, error, setQuery, refetch } =
    useCustomers(initialQuery);

  /*
    MAKES "Jumlah pelanggan" NOTICE A DELETE WITHOUT A RELOAD (2 October
    2026, fixing a bug report). `CustomerModuleHeader` counts the register in
    its own request, independent of the table below it — the two have never
    shared state, so a row disappearing here used to leave the tile above it
    reading the count from before the click. The header refetches whenever
    `refreshKey` changes to a new value, so bumping it is the whole fix; what
    it's bumped TO carries no meaning of its own.
  */
  const [headerRefreshKey, setHeaderRefreshKey] = useState(0);
  const handleRowChanged = useCallback(() => {
    refetch();
    setHeaderRefreshKey((key) => key + 1);
  }, [refetch]);

  /*
    KEEPS THE CHIP'S "×" HONEST (2 October 2026, fixing a bug report).
    `createdSince` is the one query field this screen ever reflects in the
    URL, and unlike the dormant list's `days`, it does NOT gate a server
    round trip — `useCustomers` already refilters instantly from client
    state the moment the chip clears it, so there is no desync risk in
    writing the URL alongside that the way the dormant screen had to guard
    against. The bug here was simpler and dumber: nothing ever wrote the URL
    back at all, so clearing the chip narrowed the table but left
    `?createdSince=…` sitting in the address bar as if it still applied.
    `skipFirst` drops the run on mount, where the URL already reads whatever
    the server just resolved it from — replacing it with itself would be a
    no-op history entry, not a fix for anything.
  */
  const skipFirst = useRef(true);
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    router.replace(
      query.createdSince
        ? `/dashboard/master/customers?createdSince=${encodeURIComponent(query.createdSince)}`
        : "/dashboard/master/customers",
      { scroll: false },
    );
  }, [query.createdSince, router]);

  return (
    <div className="flex flex-col gap-6">
      <CustomerModuleHeader
        action={
          <Can feature="customers" action="create">
            <Button asChild>
              <Link href="/dashboard/master/customers/new">
                <Plus className="size-4" />
                Pelanggan baru
              </Link>
            </Button>
          </Can>
        }
        refreshKey={headerRefreshKey}
      />

      <CustomersToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && customers.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar pelanggan…
        </div>
      ) : (
        <>
          <CustomersTable
            customers={customers}
            loading={loading}
            onChanged={handleRowChanged}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="pelanggan"
            unitPlural="pelanggan"
            onPageChange={(page) => setQuery({ page })}
          />

          {/*
            THE MOCKUP'S CALLOUT, KEPT. It is the one thing on the screen that
            teaches a gesture nothing else announces: the row is the way into a
            customer's profile, and the icons are there so a small job never
            needs the profile at all. Left off, people look for a menu.

            A `Card` rather than the mockup's hand-rolled panel — ui-rules §2 —
            with one borrowed detail: the navy left edge, which is what tells a
            note apart from the table above it at a glance.
          */}
          <Card
            className="border-l-[3px] border-l-primary"
            title="Profil pelanggan dibuka dari baris, bukan dari menu"
          >
            <p className="text-sm text-muted">
              Klik baris mana pun untuk membuka profilnya. Ikon di kolom
              terakhir jalan pintas untuk chat WhatsApp, ubah, dan hapus —
              supaya tidak perlu buka profil dulu untuk hal kecil.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}
