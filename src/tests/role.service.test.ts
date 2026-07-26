import { roleService } from "@/services/role.service";
import { apiClient } from "@/services/api-client";

describe("roleService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list gets /roles with the filter query and a default limit", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await roleService.list({ page: 2, search: "man", includeDeleted: true });
    expect(get).toHaveBeenCalledWith("/roles", {
      query: {
        page: 2,
        limit: 100,
        isSystem: undefined,
        isSuperAdmin: undefined,
        search: "man",
        includeDeleted: true,
      },
    });
  });

  it("list honours an explicit limit (paged list screen)", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await roleService.list({ page: 1, limit: 20 });
    expect(get).toHaveBeenCalledWith("/roles", {
      query: {
        page: 1,
        limit: 20,
        isSystem: undefined,
        isSuperAdmin: undefined,
        search: undefined,
        includeDeleted: undefined,
      },
    });
  });

  it("catalog gets /roles/catalog", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await roleService.catalog();
    expect(get).toHaveBeenCalledWith("/roles/catalog");
  });

  it("getById gets /roles/:id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await roleService.getById("r1");
    expect(get).toHaveBeenCalledWith("/roles/r1");
  });

  it("create posts /roles with the body", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const input = {
      name: "Cashier",
      description: null,
      permissions: [{ feature: "users", actions: ["read"] }],
    };
    await roleService.create(input);
    expect(post).toHaveBeenCalledWith("/roles", input);
  });

  it("update patches /roles/:id with the changed fields", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await roleService.update("r1", { name: "Manager" });
    expect(patch).toHaveBeenCalledWith("/roles/r1", { name: "Manager" });
  });

  it("remove deletes /roles/:id", async () => {
    const del = jest.spyOn(apiClient, "delete").mockResolvedValue({} as never);
    await roleService.remove("r1");
    expect(del).toHaveBeenCalledWith("/roles/r1");
  });

  it("restore patches /roles/:id/restore", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await roleService.restore("r1");
    expect(patch).toHaveBeenCalledWith("/roles/r1/restore");
  });
});
