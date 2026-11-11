"use client";

import { useEffect, useMemo, useState } from "react";

import { FilterSelect, type FilterOption } from "@/components";
import { formatRupiah } from "@/features/memberships/labels";
import { productService } from "@/services/product.service";
import { serviceService } from "@/services/service.service";

/** What the picker hands back — a promo target and the name to show. */
export interface PickedItem {
  /** `variant` only when the picker is asked for variants (Diskon bertingkat). */
  targetType: "product" | "variant" | "service";
  refId: string;
  name: string;
}

const GROUP_LABEL: Record<PickedItem["targetType"], string> = {
  product: "Produk",
  variant: "Varian",
  service: "Layanan",
};

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
 * `withVariants` (Diskon bertingkat, mockup "Bisa pilih produk (semua varian
 * ikut) atau varian tertentu saja") adds a third list, "Varian": one variant
 * on its own. A variant's name already carries its parent's, so it reads
 * whole in the list.
 *
 * Items already on the promo are listed but disabled, so a second click does
 * not silently add a duplicate the server would refuse.
 */
export function PromoItemPicker({
  taken,
  onPick,
  disabled,
  withVariants = false,
}: {
  /** `product:<id>` / `variant:<id>` / `service:<id>` already on the promo. */
  taken: Set<string>;
  onPick: (item: PickedItem) => void;
  disabled?: boolean;
  withVariants?: boolean;
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
      withVariants
        ? productService.list({
            search: settled || undefined,
            limit: LIMIT,
            isActive: true,
            productType: "variant",
          })
        : Promise.resolve(null),
    ]).then(([products, services, variants]) => {
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
      if (variants.status === "fulfilled" && variants.value) {
        for (const variant of variants.value.items) {
          next.push({
            targetType: "variant",
            refId: variant._id,
            name: variant.name,
            meta: variant.sellPrice ? formatRupiah(variant.sellPrice) : undefined,
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
  }, [settled, disabled, withVariants]);

  const options = useMemo<FilterOption<string>[]>(
    () =>
      rows.map((row) => {
        const value = `${row.targetType}:${row.refId}`;
        return {
          value,
          label: row.name,
          meta: taken.has(value) ? "sudah dipilih" : row.meta,
          group: GROUP_LABEL[row.targetType],
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
