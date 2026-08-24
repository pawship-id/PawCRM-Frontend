"use client";

import { Alert, Spinner, Pagination } from "@/components";

import { usePets } from "../hooks/usePets";
import { PetsToolbar } from "./PetsToolbar";
import { PetsTable } from "./PetsTable";

/**
 * The Master Data → Hewan list screen. Owns the list query (usePets) and wires
 * the toolbar, table and pager together. Row mutations call `refetch` so the
 * list reflects the change. Mirrors CustomersScreen.
 */
export function PetsScreen() {
  const { pets, pagination, query, loading, error, setQuery, refetch } =
    usePets();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Hewan</h1>
        <p className="mt-1 text-sm text-muted">
          Semua hewan yang dititipkan pelanggan — jenis, ciri-ciri, dan catatan
          yang perlu dibaca groomer sebelum mulai.
        </p>
      </div>

      <PetsToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && pets.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar hewan…
        </div>
      ) : (
        <>
          <PetsTable
            pets={pets}
            loading={loading}
            onChanged={refetch}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="hewan"
            unitPlural="hewan"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
