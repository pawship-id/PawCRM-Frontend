import { invalidateServiceSteps } from "@/hooks/useServiceSteps";
import type { ServiceStep } from "@/types/api";

/**
 * Tahapan lists for a suite — what `useServiceSteps(lineId)` loads from
 * GET /api/service-steps.
 *
 * Usage:
 *
 *   jest.mock("@/services/serviceStep.service");
 *   beforeEach(() => primeServiceSteps(serviceStepService.list, [makeServiceStep(…)]));
 *
 * The mock answers every line with the steps whose `businessLineId` matches
 * the one asked for, and the shared cache is dropped so the previous test's
 * list is not what renders.
 */

export function makeServiceStep(
  overrides: Partial<ServiceStep> & Pick<ServiceStep, "name">,
): ServiceStep {
  const nameKey = overrides.name.trim().replace(/\s+/g, " ").toLowerCase();

  return {
    _id: `step-${nameKey.replace(/\s+/g, "-")}`,
    tenantId: "t1",
    businessLineId: "bl-grooming",
    nameKey,
    sortOrder: 0,
    isActive: true,
    createdBy: null,
    deletedAt: null,
    createdAt: "2026-09-14T00:00:00.000Z",
    updatedAt: "2026-09-14T00:00:00.000Z",
    serviceCount: 0,
    ...overrides,
  };
}

/** Mandi → Gunting → Blow dry on the grooming line. */
export const SERVICE_STEP_FIXTURES: ServiceStep[] = ["Mandi", "Gunting", "Blow dry"].map(
  (name, sortOrder) => makeServiceStep({ name, sortOrder }),
);

export function primeServiceSteps(
  list: unknown,
  steps: ServiceStep[] = SERVICE_STEP_FIXTURES,
) {
  (list as jest.Mock).mockImplementation(
    async (query: { businessLineId?: string } = {}) => {
      const items = steps.filter(
        (step) =>
          !query.businessLineId || step.businessLineId === query.businessLineId,
      );
      return {
        items,
        pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
      };
    },
  );
  invalidateServiceSteps();
}
