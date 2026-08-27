"use client";

import { Search } from "lucide-react";

import { Alert, Pagination, Spinner } from "@/components";
import { Input } from "@/components/ui/input";
import type { PosCatalogItem } from "@/types/api";

import { usePosCatalog } from "../hooks/usePosCatalog";
import { PosCategoryPills } from "./PosCategoryPills";
import { PosProductCard } from "./PosProductCard";

/**
 * The left half of the till: search, pills, grid, pager (FR-1).
 *
 * SEARCH IS PINNED ABOVE THE PILLS rather than inside a filter bar, because it
 * is the control a cashier uses most and the one a barcode scanner types into.
 * ui-rules §8's quick-bar geometry does not apply: this is not a list being
 * narrowed, it is a shop being looked through.
 *
 * THE GRID IS EIGHT TILES BY DEFAULT and pages rather than scrolls, which is
 * FR-1's rule and the reason a pager exists at all here — a till on a small
 * screen scrolling a thousand products is how the wrong thing gets tapped.
 */
export function PosCatalog({
  onAdd,
  onExpand,
  busy = false,
}: {
  onAdd: (item: PosCatalogItem) => void;
  onExpand: (item: PosCatalogItem) => void;
  /** True while a cart write is in flight — tiles stop accepting taps. */
  busy?: boolean;
}) {
  const { items, pagination, state, matchedSearch, loading, error, setState } =
    usePosCatalog();

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input
          value={state.search}
          onChange={(event) => setState({ search: event.target.value })}
          placeholder="Cari nama produk, SKU, atau scan barcode…"
          aria-label="Cari produk atau layanan"
          className="pl-9"
          autoFocus
        />
      </div>

      <PosCategoryPills state={state} onChange={setState} />

      {error && <Alert variant="error">{error}</Alert>}

      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Spinner /> Memuat katalog…
        </div>
      ) : items.length === 0 ? (
        /* FR-1's edge case: a message in the grid area, not an empty grid. */
        <div className="rounded-xl border border-dashed border-border bg-surface px-6 py-16 text-center text-sm text-muted">
          {state.search.trim()
            ? `Tidak ada hasil untuk "${state.search.trim()}".`
            : "Belum ada produk atau layanan yang bisa dijual. Tambah di menu Inventory atau Layanan."}
        </div>
      ) : (
        <>
          <div
            className={
              loading
                ? "grid grid-cols-2 gap-3 opacity-60 lg:grid-cols-3 xl:grid-cols-4"
                : "grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4"
            }
          >
            {items.map((item) => (
              <PosProductCard
                key={`${item.kind}-${item._id}`}
                item={item}
                search={matchedSearch}
                onAdd={onAdd}
                onExpand={onExpand}
                disabled={busy}
              />
            ))}
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            unit="item"
            unitPlural="item"
            onPageChange={(page) => setState({ page })}
          />
        </>
      )}
    </div>
  );
}
