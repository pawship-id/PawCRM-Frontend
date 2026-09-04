import { apiClient } from "@/services/api-client";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { businessLineService } from "@/services/businessLine.service";
import { categoryService } from "@/services/category.service";
import { warehouseService } from "@/services/warehouse.service";

/**
 * The QUERIES the lookup services send — not what a mock of them returns.
 *
 * WHY THIS FILE EXISTS. `chartOfAccountsService.list` shipped asking for
 * `limit: 200` against an API that caps page size at **100**, so every request
 * was answered 400 and the product form's accounting section was dead for every
 * user, on every role. Nothing caught it: the form's own tests mock the service,
 * so they asserted the mock's shape and never the request.
 *
 * The gap is structural rather than a missing case — a mocked collaborator can
 * only ever prove what the mock was told to do. These tests mock ONE layer
 * lower, at `apiClient`, so the query object itself is the thing under test.
 *
 * THE CAP IS 100, from `pagination` in the backend's common.validation.js. It is
 * shared by every list endpoint, so any service added here inherits the same
 * ceiling and the same failure mode.
 */
const API_PAGE_LIMIT = 100;

describe("lookup service queries", () => {
  let get: jest.SpyInstance;

  beforeEach(() => {
    get = jest.spyOn(apiClient, "get").mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  const queryOf = () => get.mock.calls[0][1]?.query as Record<string, unknown>;

  describe("chartOfAccountsService.list", () => {
    it("stays within the API's page-size cap", async () => {
      // The regression. A limit above the cap is not a bigger page — it is a
      // 400, and one this service's caller swallows into "accounting is
      // unavailable".
      await chartOfAccountsService.list();

      expect(queryOf().limit).toBeLessThanOrEqual(API_PAGE_LIMIT);
    });

    it("asks the right path and passes the filters through", async () => {
      await chartOfAccountsService.list({
        accountType: "income",
        isActive: true,
      });

      expect(get).toHaveBeenCalledWith("/chart-of-accounts", expect.anything());
      // Income only: the API refuses a `salesAccountId` that is not an income
      // account, so filtering here is what stops the picker offering a choice
      // that cannot be saved.
      expect(queryOf()).toMatchObject({
        accountType: "income",
        isActive: true,
      });
    });

    it("never sends a limit above the cap even when asked to", async () => {
      // A caller passing 500 should be clamped rather than trusted — the
      // alternative is moving this bug to the call site.
      await chartOfAccountsService.list({ limit: 500 });

      expect(queryOf().limit).toBeLessThanOrEqual(API_PAGE_LIMIT);
    });
  });

  describe("businessLineService.list", () => {
    it("stays within the API's page-size cap", async () => {
      await businessLineService.list();

      expect(queryOf().limit).toBeLessThanOrEqual(API_PAGE_LIMIT);
    });

    it("asks the right path", async () => {
      await businessLineService.list();

      expect(get).toHaveBeenCalledWith("/business-lines", expect.anything());
    });
  });

  describe("the lookups that already existed", () => {
    // Swept in for the same reason: they share the cap, and the failure mode is
    // silent for whichever one crosses it next.
    it("categoryService stays within the cap", async () => {
      await categoryService.list();

      expect(queryOf().limit).toBeLessThanOrEqual(API_PAGE_LIMIT);
    });

    it("warehouseService stays within the cap", async () => {
      await warehouseService.list();

      expect(queryOf().limit).toBeLessThanOrEqual(API_PAGE_LIMIT);
    });
  });
});
