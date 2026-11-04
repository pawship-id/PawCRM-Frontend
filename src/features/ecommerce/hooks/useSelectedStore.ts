"use client";

import { useCallback, useEffect, useState } from "react";

import type { MarketplaceStore } from "@/types/marketplace";

const STORAGE_KEY = "buloo.ecommerce.store";

function readStored(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStored(id: string) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id);
  } catch {
    // A blocked storage only costs the carry-over between sub-tabs.
  }
}

/**
 * The store an E-commerce sub-tab is showing.
 *
 * `?store=` (passed down by the page) wins, then the store last picked on any
 * of the three sub-tabs in this browser tab, then the first store. Picking one
 * remembers it, so moving from Pengikatan SKU to Pengaturan keeps the shop.
 */
export function useSelectedStore(stores: MarketplaceStore[], requested?: string | null) {
  // Read once: the page re-mounts this screen when `?store=` changes.
  const [picked, setPicked] = useState<string | null>(() => requested ?? readStored());

  const known = stores.find((store) => store._id === picked);
  const storeId = known?._id ?? stores[0]?._id ?? null;
  const store = stores.find((candidate) => candidate._id === storeId) ?? null;

  const select = useCallback((id: string) => {
    setPicked(id);
    writeStored(id);
  }, []);

  useEffect(() => {
    if (storeId) writeStored(storeId);
  }, [storeId]);

  return { storeId, store, select };
}
