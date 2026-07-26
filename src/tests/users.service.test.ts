import { userService } from "@/services/user.service";
import { apiClient } from "@/services/api-client";

describe("userService CRUD", () => {
  afterEach(() => jest.restoreAllMocks());

  it("list gets /users with the filter query", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await userService.list({ page: 2, search: "ana", status: "active" });
    expect(get).toHaveBeenCalledWith("/users", {
      query: {
        page: 2,
        limit: undefined,
        status: "active",
        roleId: undefined,
        branchId: undefined,
        search: "ana",
        includeDeleted: undefined,
      },
    });
  });

  it("getById gets /users/:id", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    await userService.getById("u1");
    expect(get).toHaveBeenCalledWith("/users/u1");
  });

  it("create posts /users with the body", async () => {
    const post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
    const input = {
      email: "a@b.com",
      password: "secret12",
      fullName: "Ana",
      allBranches: true,
      branchAccess: [],
    };
    await userService.create(input);
    expect(post).toHaveBeenCalledWith("/users", input);
  });

  it("update patches /users/:id with the changed fields", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await userService.update("u1", { fullName: "New" });
    expect(patch).toHaveBeenCalledWith("/users/u1", { fullName: "New" });
  });

  it("setStatus patches /users/:id/status", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await userService.setStatus("u1", "suspended");
    expect(patch).toHaveBeenCalledWith("/users/u1/status", {
      status: "suspended",
    });
  });

  it("unlock patches /users/:id/unlock with no body", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await userService.unlock("u1");
    expect(patch).toHaveBeenCalledWith("/users/u1/unlock");
  });

  it("remove deletes /users/:id", async () => {
    const del = jest.spyOn(apiClient, "delete").mockResolvedValue({} as never);
    await userService.remove("u1");
    expect(del).toHaveBeenCalledWith("/users/u1");
  });

  it("restore patches /users/:id/restore", async () => {
    const patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
    await userService.restore("u1");
    expect(patch).toHaveBeenCalledWith("/users/u1/restore");
  });
});
