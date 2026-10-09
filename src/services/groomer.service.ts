import { apiClient } from "./api-client";
import type { MyCommission } from "@/types/api";
import type { GroomerBookingDetail, GroomerJobs } from "@/types/groomer";

/**
 * The groomer's phone app, against /api/groomer.
 *
 * The groomer is the session's user — nothing here names anybody. Taking a job
 * and moving its work are the booking routes (`bookingService.claimSession`,
 * `advanceSessionWork`, `setSessionRecord`); this file is the two reads that
 * have a groomer-shaped answer.
 */
export const groomerService = {
  /** GET /groomer/jobs — one day in four groups, plus the week strip. */
  jobs: (date: string) =>
    apiClient.get<GroomerJobs>("/groomer/jobs", { query: { date } }),

  /** GET /groomer/bookings/:id — one booking with its sessions in full. */
  booking: (id: string) =>
    apiClient.get<GroomerBookingDetail>(`/groomer/bookings/${id}`),

  /** GET /groomer/commission — 403 while the shop keeps commission hidden. */
  commission: (period?: string) =>
    apiClient.get<MyCommission>("/groomer/commission", { query: { period } }),
};
