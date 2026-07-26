import { auditLogService } from "@/services/auditLog.service";
import { apiClient } from "@/services/api-client";

describe("auditLogService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list gets /audit-logs with the filter query", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await auditLogService.list({
      page: 2,
      limit: 20,
      action: "failed_login",
      search: "10.0.0.1",
    });
    expect(get).toHaveBeenCalledWith("/audit-logs", {
      query: {
        page: 2,
        limit: 20,
        action: "failed_login",
        entityType: undefined,
        userId: undefined,
        search: "10.0.0.1",
      },
    });
  });

  it("list passes an empty query through (all undefined) for an unfiltered page", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await auditLogService.list();
    expect(get).toHaveBeenCalledWith("/audit-logs", {
      query: {
        page: undefined,
        limit: undefined,
        action: undefined,
        entityType: undefined,
        userId: undefined,
        search: undefined,
      },
    });
  });
});
