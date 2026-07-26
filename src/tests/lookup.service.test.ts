import { roleService } from "@/services/role.service";
import { branchService } from "@/services/branch.service";
import { apiClient } from "@/services/api-client";

describe("lookup services", () => {
  afterEach(() => jest.restoreAllMocks());

  it("roleService.list gets /roles with a large page limit", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await roleService.list();
    expect(get).toHaveBeenCalledWith("/roles", { query: { limit: 100 } });
  });

  it("branchService.list gets /branches with a large page limit", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await branchService.list();
    expect(get).toHaveBeenCalledWith("/branches", { query: { limit: 100 } });
  });
});
