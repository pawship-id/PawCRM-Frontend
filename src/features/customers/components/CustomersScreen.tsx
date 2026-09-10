"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Alert, Spinner, Pagination } from "@/components";
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
          {/*
            The mockup states the order above every table, and it is worth
            keeping: a list nobody can see the sort of is a list people re-sort
            in their heads. The wording follows what the API actually does
            (createdAt descending), not the mockup's "kunjungan terakhir" — that
            would need a visit date this database does not store yet.
          */}
          <p className="-mb-2 text-[13px] text-muted">
            Diurutkan dari yang terbaru ditambahkan
          </p>
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
        </>
      )}
    </div>
  );
}
