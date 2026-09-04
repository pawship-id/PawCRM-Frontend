import { bookingService } from "@/services/booking.service";
import { apiClient } from "@/services/api-client";
import type { BookingListQuery } from "@/types/api";

/**
 * The booking HTTP layer, at the boundary the screen tests cannot see.
 *
 * WHY THIS FILE EXISTS — the same reason category.service.test.ts does, and it
 * is the same bug a second time. `list` spells its query out as an object
 * literal, and anything absent from that literal is dropped in silence:
 * `groomerUserId` was on the type, on the hook, on the toolbar's dropdown and on
 * the server's validator, and the request never carried it — so picking a
 * groomer on /dashboard/booking changed nothing at all. A screen test that mocks
 * the service cannot see that. This one asserts one layer down.
 */

/**
 * Every filter `BookingListQuery` carries, each with a value that is not
 * `undefined` — so a key the service forgets to forward reads as missing.
 *
 * `Required<…>` is the point: adding a field to `BookingListQuery` breaks THIS
 * OBJECT at compile time until it is listed here, and then breaks the assertion
 * below until `list` actually sends it.
 */
const EVERY_FILTER: Required<BookingListQuery> = {
  page: 2,
  limit: 20,
  customerId: "5a7f1f77bcf86cd799439011",
  petId: "5a7f1f77bcf86cd799439022",
  groomerUserId: "5a7f1f77bcf86cd799439033",
  branchId: "5a7f1f77bcf86cd799439044",
  status: "confirmed",
  origin: "booking",
  scheduledFrom: "2026-09-01",
  scheduledTo: "2026-09-30",
  notPulled: true,
  unbilled: true,
};

describe("bookingService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("forwards every filter it is given — nothing is dropped on the way out", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await bookingService.list(EVERY_FILTER);

    const [path, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(path).toBe("/bookings");

    for (const [key, value] of Object.entries(EVERY_FILTER)) {
      expect(options.query[key]).toBe(value);
    }
  });

  /*
    THE FILTER THE SCREEN LOST. Named on its own so a regression reads as
    "groomer filter" in the run rather than as one key inside a loop.
  */
  it("sends groomerUserId — the Groomer filter on the booking list", async () => {
    const get = jest.spyOn(apiClient, "get").mockResolvedValue({} as never);

    await bookingService.list({ groomerUserId: "5a7f1f77bcf86cd799439033" });

    const [, options] = get.mock.calls[0] as [
      string,
      { query: Record<string, unknown> },
    ];
    expect(options.query.groomerUserId).toBe("5a7f1f77bcf86cd799439033");
  });
});
