import { serviceService } from "@/services/service.service";
import { apiClient } from "@/services/api-client";
import type { ServiceListQuery } from "@/types/api";

/**
 * The service-catalogue HTTP layer, at the boundary the screen tests cannot see.
 *
 * WHY THIS FILE EXISTS — the same reason category.service.test.ts does, and it
 * is the file whose absence let a live bug through. `list` spells its query out
 * as an object literal, and anything absent from that literal is dropped in
 * SILENCE: `serviceType` had been added to the type, to the add-on picker and to
 * the API, and the request never carried it — so the picker asked for add-ons
 * and was handed the entire catalogue, offering main services as add-ons the API
 * would then refuse.
 *
 * A SCREEN TEST CANNOT SEE THIS. `ServiceForm.test.tsx` mocks this module, so it
 * asserts that the form ASKS for `serviceType: "addon"` — which it did, all
 * along. What went missing was one layer down, which is the layer this file
 * tests.
 */

/**
 * Every filter `ServiceListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` is the point: adding a field to `ServiceListQuery` breaks THIS
 * OBJECT at compile time until it is listed here, and then breaks the assertion
 * below until `list` actually sends it.
 */
const EVERY_FILTER: Required<ServiceListQuery> = {
  page: 2,
  limit: 20,
  businessLineId: "5a7f1f77bcf86cd799439077",
  categoryId: "5a7f1f77bcf86cd799439088",
  serviceType: "addon",
  branchId: "5a7f1f77bcf86cd7994390bb",
  isActive: false,
  search: "mandi",
  includeDeleted: true,
};

describe("serviceService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await serviceService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/services");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  it("carries serviceType, so the add-on picker is offered add-ons only", async () => {
    // THE REGRESSION. Without this key the request is unfiltered, and every main
    // service in the catalogue is offered as an add-on — ids the API refuses.
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await serviceService.list({ serviceType: "addon" });

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.serviceType).toBe("addon");
  });

  it("keeps isActive=false rather than treating it as unset", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await serviceService.list({ isActive: false });

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.isActive).toBe(false);
  });

  it("sends no query at all when given none", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await serviceService.list();

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(
      Object.values(options.query).every((value) => value === undefined),
    ).toBe(true);
  });
});
