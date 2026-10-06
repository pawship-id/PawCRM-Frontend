import { apiClient } from "./api-client";
import type {
  ConsignmentOutstanding,
  ConsignmentSettlement,
  ConsignmentSettlementListQuery,
  CreateConsignmentSettlementInput,
  PageResult,
} from "@/types/api";

/**
 * Consignment settlements ("Setor"), against /api/consignment-settlements.
 *
 * WHAT IS OWED, AND WHEN. Consigned goods post nothing on arrival. When a unit
 * SELLS the shop owes the consignor the harga setor typed on the receipt line
 * (Dr HPP Konsinyasi / Cr 2105 Utang Konsinyasi); a settlement is the payment
 * that clears it. `outstanding` is therefore a server aggregation over sales —
 * never something to add up from rows here.
 *
 * Mirrors purchaseInvoiceService: one apiClient request per method, no React.
 */
export const consignmentSettlementService = {
  /**
   * GET /consignment-settlements/outstanding — per supplier: sold, settled and
   * what is still owed. `branchId` scopes it; empty/absent means every cabang.
   */
  outstanding: (query: { branchId?: string } = {}) =>
    apiClient.get<ConsignmentOutstanding>(
      "/consignment-settlements/outstanding",
      { query: { branchId: query.branchId || undefined } },
    ),

  /** GET /consignment-settlements — payments already made, newest first. */
  list: (query: ConsignmentSettlementListQuery = {}) =>
    apiClient.get<PageResult<ConsignmentSettlement>>(
      "/consignment-settlements",
      {
        query: {
          supplierId: query.supplierId,
          page: query.page,
          limit: query.limit,
        },
      },
    ),

  /**
   * POST /consignment-settlements — pay a consignor. NOT IDEMPOTENT, so the
   * caller locks its submit for the whole flight. 400 when `amount` exceeds the
   * supplier's outstanding; show the server's reason verbatim.
   */
  create: (input: CreateConsignmentSettlementInput) =>
    apiClient.post<ConsignmentSettlement>("/consignment-settlements", input),
};
