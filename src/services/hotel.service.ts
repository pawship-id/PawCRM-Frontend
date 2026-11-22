import { apiClient } from "./api-client";
import type {
  CreateHotelStaysInput,
  HotelAvailability,
  HotelStayBooking,
  HotelStayCommissionRow,
  HotelTasks,
  UpdateHotelStayInput,
  HotelRoomType,
  HotelRoomTypeInput,
  HotelRoomTypeListQuery,
  PageResult,
} from "@/types/api";

/**
 * Hotel calls (21 November 2026). Room types against /api/hotel-room-types —
 * Layanan › Hotel › Pengaturan › Tipe kamar.
 */
export const hotelService = {
  /** GET /hotel-room-types — by branch then name; up to 200 a page. */
  listRoomTypes: (query: HotelRoomTypeListQuery = {}) =>
    apiClient.get<PageResult<HotelRoomType>>("/hotel-room-types", {
      query: {
        page: query.page,
        limit: query.limit ?? 200,
        search: query.search,
        branchId: query.branchId,
        branchIds: query.branchIds,
        isActive: query.isActive,
      },
    }),

  getRoomType: (id: string) => apiClient.get<HotelRoomType>(`/hotel-room-types/${id}`),

  /** POST — 409 when the branch already has the name. */
  createRoomType: (input: HotelRoomTypeInput) =>
    apiClient.post<HotelRoomType>("/hotel-room-types", input),

  /** PATCH — 409 when a unit a stay sits in would be removed or re-coded. */
  updateRoomType: (id: string, patch: Partial<HotelRoomTypeInput>) =>
    apiClient.patch<HotelRoomType>(`/hotel-room-types/${id}`, patch),

  /** DELETE — 409 while a hotel service is sold in it or a stay has not ended. */
  removeRoomType: (id: string) => apiClient.delete<HotelRoomType>(`/hotel-room-types/${id}`),
};

/** Stay calls against /api/hotel (21 November 2026, PLAN-Hotel-V1.md §4.2). */
export const hotelStayService = {
  /** GET /hotel/stays — stays touching [from, to), with `today` on the shop's calendar. */
  list: (query: { from?: string; to?: string; branchIds?: string[]; statuses?: string[]; bookingNumber?: string; petId?: string } = {}) =>
    apiClient.get<{ items: HotelStayBooking[]; today: string }>("/hotel/stays", { query }),

  get: (id: string) => apiClient.get<HotelStayBooking>(`/hotel/stays/${id}`),
  /** GET /hotel/stays/:id/commission — Owner / Manager (`commissionReports:read`). */
  commission: (id: string) => apiClient.get<HotelStayCommissionRow[]>(`/hotel/stays/${id}/commission`),

  /** POST /hotel/stays — one stay per animal, one group. 409 when a room is full. */
  create: (input: CreateHotelStaysInput) =>
    apiClient.post<{ groupId: string; bookings: HotelStayBooking[] }>("/hotel/stays", input),

  update: (id: string, patch: UpdateHotelStayInput) => apiClient.patch<HotelStayBooking>(`/hotel/stays/${id}`, patch),

  checkIn: (
    id: string,
    body: { time?: string | null; unitId?: string | null; conditionIn?: string | null; belongings?: { name: string; qty: number }[] },
  ) => apiClient.post<HotelStayBooking>(`/hotel/stays/${id}/check-in`, body),

  extend: (id: string, body: { checkOutDate: string; pickupTime?: string | null; unitId?: string | null }) =>
    apiClient.post<HotelStayBooking>(`/hotel/stays/${id}/extend`, body),

  checkOut: (
    id: string,
    body: {
      date?: string;
      time?: string | null;
      returnedBelongingIds?: string[];
      belongingsNote?: string | null;
      conditionOut?: string | null;
    },
  ) => apiClient.post<HotelStayBooking>(`/hotel/stays/${id}/check-out`, body),

  cancel: (id: string, reason?: string | null) =>
    apiClient.post<HotelStayBooking>(`/hotel/stays/${id}/cancel`, { reason: reason ?? null }),

  /** PATCH /hotel/stays/:id/days/:date — the day's PIC and/or one task. */
  setDay: (
    id: string,
    date: string,
    body: { picUserId?: string | null; task?: { key: string; done?: boolean; doneBy?: string | null } },
  ) => apiClient.patch<HotelStayBooking>(`/hotel/stays/${id}/days/${date}`, body),

  availability: (query: { roomTypeId: string; from: string; to: string; excludeIds?: string[] }) =>
    apiClient.get<HotelAvailability>("/hotel/availability", { query }),

  tasks: (query: { date?: string; branchIds?: string[] } = {}) =>
    apiClient.get<HotelTasks>("/hotel/tasks", { query }),
};
