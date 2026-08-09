import { tenantService } from "@/services/tenant.service";
import { apiClient } from "@/services/api-client";

describe("tenantService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("me gets /tenants/me with no id and no query", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await tenantService.me();

    // The absence of an argument is the assertion: the tenant comes from the
    // session cookie, so there is no id for a caller to point elsewhere.
    expect(get).toHaveBeenCalledWith("/tenants/me");
  });

  it("returns the tenant the client unwrapped from the envelope", async () => {
    jest
      .spyOn(apiClient, "get")
      .mockResolvedValue({ _id: "t1", slug: "klinik" } as never);

    await expect(tenantService.me()).resolves.toEqual({
      _id: "t1",
      slug: "klinik",
    });
  });
});
