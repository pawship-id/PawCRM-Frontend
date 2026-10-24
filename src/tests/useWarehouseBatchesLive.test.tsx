import { act, renderHook, waitFor } from "@testing-library/react";

import { useWarehouseBatches } from "@/features/inventory/hooks/useWarehouseBatches";
import { productBatchService } from "@/services/productBatch.service";
import type { ProductBatch, ProductBatchListQuery } from "@/types/inventory";

/**
 * The shelf's lots are read ONCE; after that only the lots of the lines a form
 * carries are re-read — when a product joins, and when somebody comes back to
 * the tab — in one request each.
 */
const lot = (productId: string, qtyRemaining: string) =>
  ({ _id: `lot-${productId}`, productId, batchCode: `B-${productId}`, qtyRemaining }) as unknown as ProductBatch;

const page = (items: ProductBatch[]) =>
  ({ items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } }) as never;

function comeBack() {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("re-reads only the lots of a product that joins, and every line on return", async () => {
  jest.useFakeTimers({ now: new Date("2026-10-19T10:00:00Z"), advanceTimers: true });
  let remaining = "5";
  const list = jest
    .spyOn(productBatchService, "list")
    .mockImplementation(async (query: ProductBatchListQuery = {}) =>
      page(
        query.productIds
          ? query.productIds.map((id) => lot(id, remaining))
          : [lot("a", "5"), lot("b", "5")],
      ),
    );

  const { result, rerender } = renderHook(
    ({ ids }) => useWarehouseBatches("wh1", ids),
    { initialProps: { ids: ["a"] } },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  // The shelf read covers the line already on the form.
  expect(list).toHaveBeenCalledTimes(1);

  remaining = "3";
  rerender({ ids: ["a", "b"] });
  await waitFor(() =>
    expect(result.current.byProduct.get("b")?.[0].qtyRemaining).toBe("3"),
  );
  expect(list).toHaveBeenCalledTimes(2);
  expect(list.mock.calls[1][0]).toMatchObject({ warehouseId: "wh1", productIds: ["b"] });

  remaining = "1";
  act(() => {
    jest.setSystemTime(new Date("2026-10-19T10:00:20Z"));
  });
  comeBack();
  await waitFor(() =>
    expect(result.current.byProduct.get("a")?.[0].qtyRemaining).toBe("1"),
  );
  expect(list.mock.calls[2][0]).toMatchObject({ productIds: ["a", "b"] });
});
