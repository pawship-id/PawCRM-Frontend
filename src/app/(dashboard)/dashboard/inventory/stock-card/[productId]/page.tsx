import type { Metadata } from "next";

import { StockCardScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kartu stok · Buloo" };

/**
 * One product's stock card and lot list.
 *
 * THE PRODUCT IS THE ROUTE, which is the point of the split. It used to be a
 * dropdown the screen filled by paging the whole catalogue; now it is a segment,
 * so the choosing happens on the index and this screen only ever answers one
 * question. The warehouse stays switchable — the card is read for one shelf at a
 * time, and comparing two of them is a single click.
 *
 * BOTH VALUES ARRIVE AS PROPS, read here rather than through `useSearchParams`
 * in the screen — the convention four other pages in this app already follow. It
 * is what spares this route the Suspense boundary the hook demands, which is a
 * boundary whose absence used to fail `next build` while working perfectly in
 * development.
 *
 * `key` REMOUNTS ON A NEW PAIR. The screen holds the warehouse in state so the
 * select can change it, and the address bar is deliberately not rewritten when
 * it does — so without this, following a second deep link to the same product at
 * a different warehouse would seed nothing and silently keep showing the first.
 * Switching the select never changes the key, so it never remounts.
 */
export default async function StockCardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ warehouseId?: string }>;
}) {
  const { productId } = await params;
  const { warehouseId } = await searchParams;

  return (
    <RequirePermission feature="stockMovements">
      <StockCardScreen
        key={`${productId}:${warehouseId ?? ""}`}
        productId={productId}
        warehouseId={warehouseId}
      />
    </RequirePermission>
  );
}
