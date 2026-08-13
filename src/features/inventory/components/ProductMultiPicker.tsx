"use client";

import { useState } from "react";

import { Alert, Spinner } from "@/components";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Product } from "@/types/inventory";

import { useProductCandidates } from "../hooks/useProductCandidates";

/**
 * Which products go onto a stock document — a count sheet, a transfer.
 *
 * SHARED BY BOTH, and worth sharing rather than copying: the two rules below are
 * the whole reason a search box and a checkbox list can coexist at all, and a
 * second implementation would get one of them wrong the first time somebody
 * searched twice.
 *
 * SELECTION IS HELD AS WHOLE PRODUCTS, not ids, and that is what makes the
 * search usable: the chips have to keep naming what was chosen after the search
 * that found it has been typed over, and a list of ids could only name the ones
 * still on screen — so narrowing the search would silently blank the summary of
 * a selection that is still very much there.
 *
 * TICKING SURVIVES THE FILTERS for the same reason. Somebody counting the
 * fridge searches "vaksin", ticks four, searches "insulin", ticks two: those
 * are six lines on one sheet, and a picker that dropped the first four when the
 * search changed would only ever open single-search sheets.
 *
 * NO PAGER. The list is one screenful of matches and the count of how many
 * matched; past that the answer is a narrower search, not page 7 — nobody picks
 * products off page 7, and a pager here would compete with the checkboxes for
 * the same clicks.
 */
export function ProductMultiPicker({
  categoryId = "",
  selected,
  onChange,
  excludeIds,
  disabled = false,
}: {
  /** Narrows the candidate list. "" is every category. */
  categoryId?: string;
  selected: Product[];
  onChange: (products: Product[]) => void;
  /**
   * Products the document already carries. HIDDEN rather than shown ticked: a
   * product may appear once on a count sheet and once in a transfer, and both
   * APIs refuse the second — so a tick that could only ever produce a refusal is
   * worse than an absence.
   */
  excludeIds?: string[];
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const { products: matched, total, loading, error } = useProductCandidates(
    search,
    categoryId,
  );

  const excluded = new Set(excludeIds ?? []);
  const products = matched.filter((product) => !excluded.has(product._id));
  // Against what the SERVER matched, not what survived the filter above: the
  // remainder is still reachable by searching, which is what the note offers.
  const truncated = total > matched.length;

  const selectedIds = new Set(selected.map((product) => product._id));

  function toggle(product: Product) {
    onChange(
      selectedIds.has(product._id)
        ? selected.filter((current) => current._id !== product._id)
        : [...selected, product],
    );
  }

  /** Adds every match on screen, without unticking anything off it. */
  function addVisible() {
    const additions = products.filter(
      (product) => !selectedIds.has(product._id),
    );
    onChange([...selected, ...additions]);
  }

  const allVisiblePicked =
    products.length > 0 &&
    products.every((product) => selectedIds.has(product._id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Cari nama atau SKU…"
          aria-label="Cari produk"
          className="max-w-xs"
          disabled={disabled}
        />

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addVisible}
          disabled={disabled || products.length === 0 || allVisiblePicked}
        >
          Pilih semua hasil
        </Button>

        {selected.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange([])}
            disabled={disabled}
          >
            Kosongkan
          </Button>
        )}

        <span className="ml-auto text-xs text-muted">
          <b className="text-foreground">{selected.length}</b> produk dipilih
        </span>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
        {loading && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted">
            <Spinner /> Memuat produk…
          </div>
        )}

        {!loading && products.length === 0 && !error && (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {matched.length > 0
              ? "Semua produk yang cocok sudah ditambahkan."
              : search.trim()
                ? `Tidak ada produk yang cocok dengan "${search.trim()}".`
                : "Belum ada produk yang menyimpan stok di katalog ini."}
          </p>
        )}

        {!loading &&
          products.map((product) => {
            const checked = selectedIds.has(product._id);

            return (
              <div
                key={product._id}
                className="flex items-center gap-3 border-b border-border/60 px-3 py-2 last:border-0"
              >
                <Checkbox
                  id={`pick-${product._id}`}
                  checked={checked}
                  onCheckedChange={() => toggle(product)}
                  disabled={disabled}
                />
                <Label
                  htmlFor={`pick-${product._id}`}
                  className="flex flex-1 cursor-pointer flex-wrap items-baseline gap-x-2 font-normal"
                >
                  <span className="text-sm text-foreground">{product.name}</span>
                  {/* The SKU is how a counter matches a row to a shelf label —
                      two variants of one product differ by nothing else here. */}
                  {product.sku && (
                    <span className="font-mono text-[11px] text-muted">
                      {product.sku}
                    </span>
                  )}
                  <span className="text-[11px] text-muted">{product.unit}</span>
                </Label>
              </div>
            );
          })}
      </div>

      {truncated && (
        <p className="text-xs text-muted">
          Menampilkan {products.length} dari {total} produk. Persempit dengan
          pencarian atau kategori untuk melihat sisanya — yang sudah dicentang
          tetap terpilih.
        </p>
      )}
    </div>
  );
}
