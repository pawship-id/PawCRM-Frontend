import { apiClient } from "./api-client";
import type { VariantOption } from "@/types/api";

/**
 * Opsi Varian calls against /api/variant-options — the cards a service's price
 * may vary by. Pickers read `useVariantOptions()` rather than calling this.
 *
 * A refusal a card screen should show verbatim (built-in, still used by N
 * services, second Zona card, duplicate) comes back with a `reason` — read
 * `ApiError.fullMessage`.
 */
export const variantOptionService = {
  /** GET — every live card, in card order, with `axisKey` and `serviceCount`. */
  list: () => apiClient.get<{ items: VariantOption[] }>("/variant-options"),

  /** POST — a "Dipilih staf" card with its first values, or the one Zona card. */
  create: (input: {
    name: string;
    description?: string | null;
    source: "staff" | "zone";
    values?: string[];
  }) => apiClient.post<VariantOption>("/variant-options", input),

  update: (id: string, patch: { name?: string; description?: string | null; sortOrder?: number }) =>
    apiClient.patch<VariantOption>(`/variant-options/${id}`, patch),

  remove: (id: string) => apiClient.delete<VariantOption>(`/variant-options/${id}`),

  addValue: (id: string, label: string) =>
    apiClient.post<VariantOption>(`/variant-options/${id}/values`, { label }),

  updateValue: (
    id: string,
    code: string,
    patch: { label?: string; isActive?: boolean; sortOrder?: number },
  ) =>
    apiClient.patch<VariantOption>(
      `/variant-options/${id}/values/${encodeURIComponent(code)}`,
      patch,
    ),

  removeValue: (id: string, code: string) =>
    apiClient.delete<VariantOption>(`/variant-options/${id}/values/${encodeURIComponent(code)}`),
};
