"use client";

import { Alert, Spinner, Pagination } from "@/components";

import { useServices } from "../hooks/useServices";
import { ServicesToolbar } from "./ServicesToolbar";
import { ServicesTable } from "./ServicesTable";

/**
 * The Master Data → Layanan list screen. Owns the list query (useServices) and
 * wires the toolbar, table and pager together. Mirrors PetsScreen.
 */
export function ServicesScreen() {
  const { services, pagination, query, loading, error, setQuery, refetch } =
    useServices();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-foreground">Layanan</h1>
        <p className="mt-1 text-sm text-muted">
          Semua yang dijual sebagai jasa — grooming, penitipan, vaksinasi.
          Berbeda dari produk: tidak punya stok, dan masuk ke akun pendapatan
          jasa.
        </p>
      </div>

      <ServicesToolbar query={query} onChange={setQuery} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && services.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat daftar layanan…
        </div>
      ) : (
        <>
          <ServicesTable
            services={services}
            loading={loading}
            onChanged={refetch}
            search={query.search}
          />
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="layanan"
            unitPlural="layanan"
            onPageChange={(page) => setQuery({ page })}
          />
        </>
      )}
    </div>
  );
}
