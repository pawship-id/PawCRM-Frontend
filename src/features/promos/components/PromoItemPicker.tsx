"use client";

import { useEffect, useMemo, useState } from "react";

import { FilterSelect, type FilterOption } from "@/components";
import { formatRupiah } from "@/features/memberships/labels";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";

/** What the picker hands back — a promo target and the name to show. */
export interface PickedItem {
  targetType: "product" | "service";
  refId: string;
  name: string;
}

const SEARCH_DELAY_MS = 300;
const LIMIT = 20;

/**
 * PICK A PRODUCT OR A SERVICE — the promo builder's one item picker, kept
 * generic because the next promo types reuse it (kelompok bertingkat, slot
 * bundle).
 *
 * SEARCH IS THE SERVER'S, in two lists at once: products by name/SKU (parents
 * and standalone only — a variant comes with its parent, and the editor lets
 * the shop price variants one by one) and services by name. The two are
 * grouped under "Produk" and "Layanan" headings.
 *
 * Items already on the promo are listed but disabled, so a second click does
 * not silently add a duplicate the server would refuse.
 */
export function PromoItemPicker({
  taken,
  onPick,
  disabled,
}: {
  /** `product:<id>` / `service:<id>` already on the promo. */
  taken: Set<string>;
  onPick: (item: PickedItem) => void;
  disabled?: boolean;
}) {
  const [term, setTerm] = useState("");
  const [settled, setSettled] = useState("");
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rows, setRows] = useState<(PickedItem & { meta?: string })[]>([]);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(term.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (disabled) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearching(true);
    setFailed(false);

    Promise.allSettled([
      productService.list({
        search: settled || undefined,
        limit: LIMIT,
        isActive: true,
        excludeVariants: true,
      }),
      serviceService.list({ search: settled || undefined, limit: LIMIT, isActive: true }),
    ]).then(([products, services]) => {
      if (!live) return;
      const next: (PickedItem & { meta?: string })[] = [];
      if (products.status === "fulfilled") {
        for (const product of products.value.items) {
          next.push({
            targetType: "product",
            refId: product._id,
            name: product.name,
            meta:
              product.productType === "parent"
                ? `${product.variantCount ?? ""} varian`.trim()
                : product.sellPrice
                  ? formatRupiah(product.sellPrice)
                  : undefined,
          });
        }
      }
      if (services.status === "fulfilled") {
        for (const service of services.value.items) {
          next.push({
            targetType: "service",
            refId: service._id,
            name: service.name,
            meta: service.hasVariants ? "per varian" : service.price ? formatRupiah(service.price) : undefined,
          });
        }
      }
      setRows(next);
      setFailed(products.status === "rejected" && services.status === "rejected");
      setSearching(false);
    });

    return () => {
      live = false;
    };
  }, [settled, disabled]);

  const options = useMemo<FilterOption<string>[]>(
    () =>
      rows.map((row) => {
        const value = `${row.targetType}:${row.refId}`;
        return {
          value,
          label: row.name,
          meta: taken.has(value) ? "sudah dipilih" : row.meta,
          group: row.targetType === "product" ? "Produk" : "Layanan",
          disabled: taken.has(value),
        };
      }),
    [rows, taken],
  );

  return (
    <FilterSelect
      layout="field"
      label="Tambah item"
      ariaLabel="Tambah produk atau layanan"
      value=""
      options={options}
      active={false}
      searchable
      placeholder="Pilih produk atau layanan…"
      searchPlaceholder="Cari nama produk atau layanan…"
      onSearchChange={setTerm}
      searching={searching}
      emptyLabel={failed ? "Pencarian gagal. Coba lagi." : "Tidak ada produk atau layanan yang cocok."}
      disabled={disabled}
      wideList
      onChange={(value) => {
        const row = rows.find((entry) => `${entry.targetType}:${entry.refId}` === value);
        if (row) onPick({ targetType: row.targetType, refId: row.refId, name: row.name });
      }}
    />
  );
}
