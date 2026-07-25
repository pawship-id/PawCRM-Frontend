import { userService } from "@/services/user.service";
import { apiClient } from "@/services/api-client";

describe("userService", () => {
  let patch: jest.SpyInstance;

  beforeEach(() => {
    patch = jest.spyOn(apiClient, "patch").mockResolvedValue({} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("updateProfile patches /users/:id with the changed fields", async () => {
    await userService.updateProfile("u1", { fullName: "New Name", phone: null });
    expect(patch).toHaveBeenCalledWith("/users/u1", {
      fullName: "New Name",
      phone: null,
    });
  });

  it("changePassword patches /users/:id/password", async () => {
    await userService.changePassword("u1", "newpass123");
    expect(patch).toHaveBeenCalledWith("/users/u1/password", {
      newPassword: "newpass123",
    });
  });
});
