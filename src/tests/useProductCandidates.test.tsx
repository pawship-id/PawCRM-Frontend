import { act, renderHook, waitFor } from "@testing-library/react";

import {
  prefetchProductCandidates,
  useProductCandidates,
} from "@/features/inventory/hooks/useProductCandidates";
import { productService } from "@/services/product.service";
import type { Product, ProductListQuery } from "@/types/inventory";

/**
 * The pickers search in the BROWSER once the index is in (18 October 2026):
 * typing asks the server nothing, unless the index was cut at the server's cap
 * or the picker also searches lot codes.
 */
const product = (id: string, name: string, sku: string) =>
  ({ _id: id, name, sku, unit: "pcs", stockByWarehouse: [] }) as unknown as Product;

const CATALOGUE = [
  product("p1", "Vaksin Rabies", "VR-01"),
  product("p2", "Shampoo Kucing", "SK-02"),
  product("p3", "Kalung Nylon", "KLG-B26"),
];

const page = (items: Product[], total = items.length) =>
  ({
    items,
    pagination: { page: 1, limit: 50, total, totalPages: 1 },
  }) as never;

function mockList(answer: (query: ProductListQuery) => unknown) {
  return jest
    .spyOn(productService, "list")
    .mockImplementation(async (query = {}) => answer(query) as never);
}

const searchFor = (term: string, searchBatches = false) =>
  renderHook(({ q }) => useProductCandidates(q, "", "", "", undefined, searchBatches), {
    initialProps: { q: term },
  });

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it("answers a search from the index without asking the server again", async () => {
  const list = mockList((query) =>
    query.view === "index" ? page(CATALOGUE) : page([]),
  );

  const { result, rerender } = searchFor("");
  await waitFor(() => expect(result.current.products).toHaveLength(3));
  // Opened before any index existed, the dialog also asked for its first page
  // — the fallback. From here on typing asks nothing.
  const before = list.mock.calls.length;

  rerender({ q: "kucing" });
  expect(result.current.products.map((p) => p._id)).toEqual(["p2"]);
  expect(result.current.loading).toBe(false);

  // By SKU, any case — the server's own rule.
  rerender({ q: "klg-b" });
  expect(result.current.products.map((p) => p._id)).toEqual(["p3"]);

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  expect(list).toHaveBeenCalledTimes(before);
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ view: "index" }));
});

it("draws a prefetched index the moment the dialog opens", async () => {
  mockList(() => page(CATALOGUE));
  prefetchProductCandidates({});
  await waitFor(() => expect(productService.list).toHaveBeenCalled());
  await act(async () => {});

  const { result } = searchFor("");

  expect(result.current.loading).toBe(false);
  expect(result.current.products).toHaveLength(3);
});

it("searches on the server when the index was cut at the cap", async () => {
  const list = mockList((query) =>
    query.view === "index"
      ? page(CATALOGUE, 20000)
      : query.search
        ? page([product("p9", "Vaksin Distemper", "VD-09")], 1)
        : page([]),
  );

  const { result, rerender } = searchFor("");
  await waitFor(() => expect(list).toHaveBeenCalledWith(expect.objectContaining({ view: "index" })));

  rerender({ q: "vaksin" });
  await waitFor(() =>
    expect(result.current.products.map((p) => p._id)).toEqual(["p9"]),
  );
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({ search: "vaksin", view: "picker" }),
  );
});

it("adds the server's lot-code matches under the local ones", async () => {
  mockList((query) =>
    query.view === "index"
      ? page(CATALOGUE)
      : // The server matches the name AND a lot code on Kalung Nylon.
        page([CATALOGUE[0], CATALOGUE[2]]),
  );

  const { result, rerender } = searchFor("", true);
  await waitFor(() => expect(result.current.products).toHaveLength(3));

  rerender({ q: "rabies" });
  // The local match is there at once, while the lot search is out.
  expect(result.current.products.map((p) => p._id)).toEqual(["p1"]);
  expect(result.current.loading).toBe(true);

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.products.map((p) => p._id)).toEqual(["p1", "p3"]);
  expect(result.current.total).toBe(2);
});
