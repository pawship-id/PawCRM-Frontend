"use client";

import { createListStore } from "@/hooks/createListStore";
import { hotelService } from "@/services/hotel.service";
import type { HotelRoomType } from "@/types/api";

const store = createListStore<HotelRoomType>(async () => {
  const items: HotelRoomType[] = [];
  for (let page = 1; ; page += 1) {
    const result = await hotelService.listRoomTypes({ page, limit: 200 });
    items.push(...result.items);
    if (page >= result.pagination.totalPages) break;
  }
  return items;
}, "Gagal memuat tipe kamar.");

/**
 * The tenant's hotel room types, every branch, live ones only — loaded once
 * for the whole app (21 November 2026). Read by the hotel service form, the
 * booking form and the room board.
 */
export const useHotelRoomTypes = store.useList;

/** Call after any room type write. */
export const invalidateHotelRoomTypes = store.invalidate;
