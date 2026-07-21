import { apiClient } from "./api-client";
import type { HealthPayload } from "@/types/api";

/**
 * Backend health check.
 *
 * Doubles as the reference implementation for this layer: a service maps a
 * typed domain call onto an apiClient request and nothing else. No React,
 * no state, no fetch — those belong in hooks and components respectively.
 */
export const healthService = {
  check: () => apiClient.get<HealthPayload>("/health"),
};
