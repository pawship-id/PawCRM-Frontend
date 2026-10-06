import { apiClient } from "./api-client";
import type {
  CashBankOpening,
  SaveCashBankOpeningInput,
  SaveCashBankOpeningResult,
} from "@/types/accounting";

/**
 * Saldo awal — the opening balances, against /api/opening-balance. Today only
 * Kas & Bank has a screen.
 *
 * `save` is a PUT because there is one balance per tenant, set and re-set: the
 * first call posts a journal entry and every later one reverses it and posts
 * another. One typed operation per apiClient request, no React.
 */
export const openingBalanceService = {
  getCashBank: () => apiClient.get<CashBankOpening>("/opening-balance/cash-bank"),

  saveCashBank: (input: SaveCashBankOpeningInput) =>
    apiClient.put<SaveCashBankOpeningResult>("/opening-balance/cash-bank", input),
};
