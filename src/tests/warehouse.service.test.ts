import { warehouseService } from "@/services/warehouse.service";
import { apiClient } from "@/services/api-client";

describe("warehouseService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list gets /warehouses with the filter query and a default limit", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await warehouseService.list({ page: 2, search: "pusat", isActive: true });
    expect(get).toHaveBeenCalledWith("/warehouses", {
      query: {
        page: 2,
        limit: 100,
        isActive: true,
        defaultBranchId: undefined,
        search: "pusat",
        includeDeleted: undefined,
      },
    });
  });

  it("list honours an explicit limit and the branch filter", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await warehouseService.list({
      page: 1,
      limit: 20,
      defaultBranchId: "b1",
      includeDeleted: true,
    });
    expect(get).toHaveBeenCalledWith("/warehouses", {
      query: {
        page: 1,
        limit: 20,
        isActive: undefined,
        defaultBranchId: "b1",
        search: undefined,
        includeDeleted: true,
      },
    });
  });

  it("getById gets /warehouses/:id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await warehouseService.getById("w1");
    expect(get).toHaveBeenCalledWith("/warehouses/w1");
  });

  it("create posts /warehouses with the body", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const input = {
      name: "Gudang Pusat",
      defaultBranchId: null,
      address: null,
      picName: null,
      picPhone: null,
      isActive: true,
    };
    await warehouseService.create(input);
    expect(post).toHaveBeenCalledWith("/warehouses", input);
  });

  it("update patches /warehouses/:id with the changed fields", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await warehouseService.update("w1", { name: "Gudang Cabang" });
    expect(patch).toHaveBeenCalledWith("/warehouses/w1", {
      name: "Gudang Cabang",
    });
  });

  it("remove deletes /warehouses/:id", async () => {
    const del = jest.spyOn(apiClient, "delete").mockResolvedValue({} as never);
    await warehouseService.remove("w1");
    expect(del).toHaveBeenCalledWith("/warehouses/w1");
  });

  it("restore patches /warehouses/:id/restore", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await warehouseService.restore("w1");
    expect(patch).toHaveBeenCalledWith("/warehouses/w1/restore");
  });
});
