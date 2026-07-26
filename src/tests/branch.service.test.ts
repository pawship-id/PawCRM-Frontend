import { branchService } from "@/services/branch.service";
import { apiClient } from "@/services/api-client";

describe("branchService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list gets /branches with the filter query and a default limit", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await branchService.list({ page: 2, search: "jak", isActive: true });
    expect(get).toHaveBeenCalledWith("/branches", {
      query: {
        page: 2,
        limit: 100,
        isActive: true,
        search: "jak",
        includeDeleted: undefined,
      },
    });
  });

  it("list honours an explicit limit (paged list screen)", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await branchService.list({ page: 1, limit: 20 });
    expect(get).toHaveBeenCalledWith("/branches", {
      query: {
        page: 1,
        limit: 20,
        isActive: undefined,
        search: undefined,
        includeDeleted: undefined,
      },
    });
  });

  it("getById gets /branches/:id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await branchService.getById("b1");
    expect(get).toHaveBeenCalledWith("/branches/b1");
  });

  it("create posts /branches with the body", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const input = { name: "Jakarta", address: null, phone: null, isActive: true };
    await branchService.create(input);
    expect(post).toHaveBeenCalledWith("/branches", input);
  });

  it("update patches /branches/:id with the changed fields", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await branchService.update("b1", { name: "Bandung" });
    expect(patch).toHaveBeenCalledWith("/branches/b1", { name: "Bandung" });
  });

  it("remove deletes /branches/:id", async () => {
    const del = jest.spyOn(apiClient, "delete").mockResolvedValue({} as never);
    await branchService.remove("b1");
    expect(del).toHaveBeenCalledWith("/branches/b1");
  });

  it("restore patches /branches/:id/restore", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await branchService.restore("b1");
    expect(patch).toHaveBeenCalledWith("/branches/b1/restore");
  });
});
