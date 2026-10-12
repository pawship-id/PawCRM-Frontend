import { apiClient } from "./api-client";
import type {
  HomeTrip,
  HomeTripListQuery,
  HomeTripStatus,
  PageResult,
  TypedDiscountInput,
} from "@/types/api";

/**
 * The groomer's journey to a customer's house, against /api/home-trips
 * (10 October 2026).
 *
 * A trip is born with its booking and moves ONE rung at a time — a skipped rung
 * is a 409 in Indonesian, naming the one expected. Whoever may tap is the
 * trip's performer (or a groomer on the visit's turns); `bookings:update` may
 * move any.
 */
export const homeTripService = {
  list: (query: HomeTripListQuery = {}) =>
    apiClient.get<PageResult<HomeTrip>>("/home-trips", {
      query: {
        page: query.page,
        limit: query.limit,
        branchId: query.branchId,
        groupId: query.groupId,
        status: query.status,
        performerUserId: query.performerUserId,
        mine: query.mine,
        scheduledFrom: query.scheduledFrom,
        scheduledTo: query.scheduledTo,
      },
    }),

  get: (id: string) => apiClient.get<HomeTrip>(`/home-trips/${id}`),

  /** PATCH /home-trips/:id/status — one rung forward, or `cancelled`. */
  changeStatus: (id: string, status: HomeTripStatus) =>
    apiClient.patch<HomeTrip>(`/home-trips/${id}/status`, { status }),

  /** PATCH /home-trips/:id — who drives; `null` falls back to the booking's groomer. */
  setPerformer: (id: string, performerUserId: string | null) =>
    apiClient.patch<HomeTrip>(`/home-trips/${id}`, { performerUserId }),

  /** PATCH /home-trips/:id/fee-discount — the fee's own discount; `null` removes it. */
  setFeeDiscount: (id: string, discount: TypedDiscountInput | null) =>
    apiClient.patch<HomeTrip>(`/home-trips/${id}/fee-discount`, { discount }),
};
