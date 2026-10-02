"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Card, Spinner, Pagination } from "@/components";
import { Button } from "@/components/ui/button";
import { Can } from "@/features/permissions";

import { useCustomers } from "../hooks/useCustomers";
import { CustomerModuleHeader } from "./CustomerModuleHeader";
import { CustomersToolbar } from "./CustomersToolbar";
import { CustomersTable } from "./CustomersTable";

/**
 * The Pelanggan tab of the Pelanggan module. Owns the list query (useCustomers)
 * and wires the toolbar, table and pager together. Row mutations call `refetch`
 * so the list reflects the change.
 *
 * THE HEADER AND THE CREATE BUTTON ARE THE MODULE'S, NOT THIS SCREEN'S — same
 * title, same tabs and same tiles as the Hewan tab, which is what makes two
 * routes read as one page. Only the button's destination changes with the tab.
 */
export function CustomersScreen() {
  const { customers, pagination, query, loading, error, setQuery, refetch } =
    useCustomers();

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
            onChanged={refetch}
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
