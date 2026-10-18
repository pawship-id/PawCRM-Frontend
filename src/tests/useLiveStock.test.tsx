import { act, renderHook, waitFor } from "@testing-library/react";

import { useLiveStock } from "@/features/inventory/hooks/useLiveStock";
import { productService } from "@/services/product.service";

/**
 * The stock an open document form re-reads — asked ONCE for every product that
 * joins (never one request per line), and again when somebody comes back to the
 * tab, at most once per quarter-minute.
 */
const answer = (qty: string) => async (productIds: string[]) =>
  ({
    items: productIds.map((productId) => ({
      productId,
      stockByWarehouse: [{ warehouseId: "wh1", qty }],
    })),
  }) as never;

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

function comeBack() {
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("asks for fifty products in one request", async () => {
  const stock = jest.spyOn(productService, "stock").mockImplementation(answer("3"));

  const { result } = renderHook(() => useLiveStock(ids(50)));

  await waitFor(() => expect(result.current.rowsOf("p49")).toBeDefined());
  expect(stock).toHaveBeenCalledTimes(1);
  expect(stock.mock.calls[0][0]).toHaveLength(50);
});

it("splits past the server's cap of a hundred", async () => {
  const stock = jest.spyOn(productService, "stock").mockImplementation(answer("3"));

  renderHook(() => useLiveStock(ids(150)));

  await waitFor(() => expect(stock).toHaveBeenCalledTimes(2));
  expect(stock.mock.calls.map((call) => call[0].length)).toEqual([100, 50]);
});

it("asks only for the products that just joined", async () => {
  const stock = jest.spyOn(productService, "stock").mockImplementation(answer("3"));

  const { rerender } = renderHook(({ list }) => useLiveStock(list), {
    initialProps: { list: ["a", "b"] },
  });
  await waitFor(() => expect(stock).toHaveBeenCalledTimes(1));

  // A keystroke rebuilds the array; the same products are not a new question.
  rerender({ list: ["a", "b"] });
  rerender({ list: ["a", "b", "c"] });

  await waitFor(() => expect(stock).toHaveBeenCalledTimes(2));
  expect(stock.mock.calls[1][0]).toEqual(["c"]);
});

it("re-reads every line when somebody comes back, at most once per 15 s", async () => {
  jest.useFakeTimers({ now: new Date("2026-10-18T10:00:00Z") });
  const stock = jest.spyOn(productService, "stock").mockImplementation(answer("3"));

  const { result } = renderHook(() => useLiveStock(["a", "b"]));
  await waitFor(() => expect(result.current.rowsOf("a")?.[0].qty).toBe("3"));

  comeBack();
  expect(stock).toHaveBeenCalledTimes(1); // too soon

  stock.mockImplementation(answer("2"));
  act(() => {
    jest.setSystemTime(new Date("2026-10-18T10:00:16Z"));
  });
  comeBack();
  comeBack(); // the same return fires twice — focus and visibilitychange

  await waitFor(() => expect(result.current.rowsOf("a")?.[0].qty).toBe("2"));
  expect(stock).toHaveBeenCalledTimes(2);
  expect(stock.mock.calls[1][0]).toEqual(["a", "b"]);
});
