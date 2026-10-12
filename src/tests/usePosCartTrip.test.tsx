import { act, renderHook, waitFor } from "@testing-library/react";

import { usePosCart } from "@/features/pos/hooks/usePosCart";
import { posService } from "@/services/pos.service";
import type { PosTransaction } from "@/types/api";

jest.mock("@/services/pos.service");

const mockedPos = posService as jest.Mocked<typeof posService>;

/**
 * A HOME-GROOMING TRIP'S FEE LINE ON THE BASKET (11 October 2026). The server
 * rebuilds every line from the payload, so the trip id has to travel back on
 * every write — a line without it reads as a "Biaya Kunjungan" typed by hand,
 * which the server refuses.
 */
const withTrip = {
  _id: "cart-1",
  items: [
    {
      kind: "service",
      refId: "svc-fee",
      qty: "1.0000",
      unitPrice: "70000.0000",
      lineTotal: "70000.0000",
      discount: null,
      bookingId: null,
      homeTripId: "trip-1",
      petId: null,
      petName: null,
      groomerName: null,
    },
  ],
} as unknown as PosTransaction;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPos.createCart.mockResolvedValue(withTrip);
  mockedPos.updateCart.mockResolvedValue(withTrip);
});

async function loaded() {
  const hook = renderHook(() => usePosCart());
  /* Any write puts the server's basket into the hook. */
  await act(async () => {
    await hook.result.current.patch({ note: "x" });
  });
  await waitFor(() => expect(hook.result.current.cart?.items).toHaveLength(1));
  return hook;
}

it("sends the trip id back with the line on the next write", async () => {
  const { result } = await loaded();

  await act(async () => {
    await result.current.addTrip("trip-2");
  });

  const [, payload] = mockedPos.updateCart.mock.calls.at(-1)!;
  expect(payload.items?.[0]).toMatchObject({ homeTripId: "trip-1" });
  expect(payload.items?.[1]).toMatchObject({ kind: "service", homeTripId: "trip-2", qty: "1" });
});

it("does not add a trip that is already on the basket", async () => {
  const { result } = await loaded();
  const writes = mockedPos.updateCart.mock.calls.length;

  await act(async () => {
    await result.current.addTrip("trip-1");
  });

  expect(mockedPos.updateCart).toHaveBeenCalledTimes(writes);
});
