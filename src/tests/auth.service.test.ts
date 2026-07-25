import { authService } from "@/services/auth.service";
import { apiClient } from "@/services/api-client";

/**
 * The auth service is a thin mapping onto apiClient, so the test pins the
 * path/method/body each call makes rather than any HTTP behaviour (that is
 * covered in api-client.test.ts). We spy on the apiClient singleton rather than
 * jest.mock the module, which keeps the @/ alias out of the mock path.
 */
describe("authService", () => {
  let get: jest.SpyInstance;
  let post: jest.SpyInstance;

  beforeEach(() => {
    get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);
    post = jest.spyOn(apiClient, "post").mockResolvedValue({} as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it("login posts credentials to /auth/login", async () => {
    await authService.login("A@B.com", "secret");
    expect(post).toHaveBeenCalledWith("/auth/login", {
      email: "A@B.com",
      password: "secret",
    });
  });

  it("me reads /auth/me", async () => {
    await authService.me();
    expect(get).toHaveBeenCalledWith("/auth/me");
  });

  it("logout posts to /auth/logout", async () => {
    await authService.logout();
    expect(post).toHaveBeenCalledWith("/auth/logout");
  });

  it("forgotPassword posts the email", async () => {
    await authService.forgotPassword("a@b.com");
    expect(post).toHaveBeenCalledWith("/auth/forgot-password", {
      email: "a@b.com",
    });
  });

  it("resetPassword posts the token and new password", async () => {
    await authService.resetPassword("tok", "newpass123");
    expect(post).toHaveBeenCalledWith("/auth/reset-password", {
      token: "tok",
      newPassword: "newpass123",
    });
  });
});
