"use client";

import { FilterSelect } from "@/components";
import type { MarketplaceStore } from "@/types/marketplace";

import { MARKETPLACE_LABEL } from "../labels";

/** "Toko: Shopee · pawship.id ⌄" — the store a sub-tab is showing. */
export function StorePicker({
  stores,
  value,
  onChange,
}: {
  stores: MarketplaceStore[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <FilterSelect
      label="Toko"
      value={value ?? ""}
      options={stores.map((store) => ({
        value: store._id,
        label: `${MARKETPLACE_LABEL[store.marketplace]} · ${store.name}`,
        meta: store.isActive ? undefined : "Nonaktif",
      }))}
      onChange={onChange}
      active={false}
      searchable={stores.length > 6}
    />
  );
}
