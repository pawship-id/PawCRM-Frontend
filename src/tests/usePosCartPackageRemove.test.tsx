import { act, renderHook } from "@testing-library/react";

import { usePosCart } from "@/features/pos/hooks/usePosCart";
import { posService } from "@/services/pos.service";
import type { PosTransaction } from "@/types/api";

jest.mock("@/services/pos.service");

const mockedPos = posService as jest.Mocked<typeof posService>;

/**
 * REMOVING A PACKAGE TAKES ITS JATAH WITH IT (Promosi V1).
 *
 * A grooming line spending a package bought on the same basket names it by
 * `packageRef`. Removing the package line used to re-send that pick, and the
 * server refused the write ("paket tidak ada di keranjang") — so the package
 * could never be taken off the basket at all.
 */
const basket = {
  _id: "cart-1",
  items: [
    {
      kind: "membership",
      refId: "plan-1",
      qty: "1",
      petId: "pet-1",
      packageRef: "pkg-1",
      lineTotal: "850000",
    },
    {
      kind: "service",
      refId: "svc-1",
      qty: "1",
      petId: "pet-1",
      lineTotal: "170000",
      benefit: { membershipId: null, packageRef: "pkg-1", benefitId: "ben-1", optionId: null },
    },
    {
      kind: "service",
      refId: "svc-2",
      qty: "1",
      petId: "pet-2",
      lineTotal: "170000",
      benefit: { membershipId: "card-9", packageRef: null, benefitId: "ben-2", optionId: null },
    },
  ],
} as unknown as PosTransaction;

beforeEach(() => {
  jest.clearAllMocks();
  mockedPos.createCart.mockResolvedValue(basket);
  mockedPos.updateCart.mockResolvedValue(basket);
});

it("drops the picks that spent the removed package, and keeps the others", async () => {
  const hook = renderHook(() => usePosCart());
  // Any write first, so the hook holds the basket above.
  await act(async () => {
    await hook.result.current.patch({ items: [] });
  });

  await act(async () => {
    await hook.result.current.removeItem(0);
  });

  const sent = mockedPos.updateCart.mock.calls.at(-1)?.[1]?.items ?? [];
  expect(sent).toHaveLength(2);
  // The line that drew on pkg-1 goes back to no pick at all — key absent.
  expect(sent[0]).not.toHaveProperty("benefit");
  // A pick on a real card is untouched.
  expect(sent[1].benefit).toEqual(
    expect.objectContaining({ membershipId: "card-9", benefitId: "ben-2" }),
  );
});
