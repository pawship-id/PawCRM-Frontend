import { apiClient } from "./api-client";
import type {
  PaymentChannel,
  PaymentChannelListQuery,
  CreatePaymentChannelInput,
  UpdatePaymentChannelInput,
  PageResult,
} from "@/types/api";

/**
 * Payment-channel calls against /api/payment-channels — the named places money
 * arrives, each mapped to the COA account it debits.
 *
 * The tenant scope is derived from the session cookie by the backend, so it is
 * never passed here.
 *
 * FOUR OF THE API'S REFUSALS ARE BUSINESS RULES, not payload shape: the account
 * must be a live asset, only QRIS and EDC may carry an MDR, a cash channel needs
 * a branch under per-branch scope, and a name is unique within its type. They
 * come back as 400s with `details` naming the field, or a 409 — a form should
 * bind them to fields rather than showing a banner.
 */
export const paymentChannelService = {
  /**
   * GET /payment-channels — sorted by type, then sortOrder, then name.
   *
   * `branchId` returns that branch's channels AND the tenant-wide ones; a branch
   * that could not see the central bank account would be one that cannot take a
   * transfer.
   */
  list: (query: PaymentChannelListQuery = {}) =>
    apiClient.get<PageResult<PaymentChannel>>("/payment-channels", {
      query: {
        page: query.page,
        limit: query.limit,
        type: query.type,
        branchId: query.branchId,
        isActive: query.isActive,
        search: query.search,
        includeDeleted: query.includeDeleted,
      },
    }),

  /** GET /payment-channels/:id — a single channel. */
  getById: (id: string) =>
    apiClient.get<PaymentChannel>(`/payment-channels/${id}`),

  /** POST /payment-channels — create a channel (201). */
  create: (input: CreatePaymentChannelInput) =>
    apiClient.post<PaymentChannel>("/payment-channels", input),

  /** PATCH /payment-channels/:id — update (send only what changed). */
  update: (id: string, patch: UpdatePaymentChannelInput) =>
    apiClient.patch<PaymentChannel>(`/payment-channels/${id}`, patch),

  /**
   * DELETE /payment-channels/:id — soft delete.
   *
   * NO USAGE GUARD on the server, unlike services: a removed channel's
   * historical transactions stay readable because the row is never removed. What
   * this does is take it out of the choices for new transactions.
   */
  remove: (id: string) =>
    apiClient.delete<PaymentChannel>(`/payment-channels/${id}`),

  /** PATCH /payment-channels/:id/restore — may 409 if the name was taken. */
  restore: (id: string) =>
    apiClient.patch<PaymentChannel>(`/payment-channels/${id}/restore`),
};
