import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { StockProductsScreen } from "@/features/inventory";
import { RequirePermission } from "@/features/permissions";

export const metadata: Metadata = { title: "Kartu stok · Buloo" };

/**
 * The stock card's index: which product's ledger to read.
 *
 * IT USED TO BE THE CARD ITSELF, asking for a product and a warehouse through
 * two dropdowns — one of which had to page the whole catalogue to fill itself.
 * The card now lives at `stock-card/[productId]`, and this route is the list you
 * search to get there.
 *
 * THE OLD DEEP LINK STILL WORKS, which is what `searchParams` is for here.
 * `?productId=&warehouseId=` was a documented, bookmarkable address, so it is
 * forwarded to the card rather than quietly landing on a list. Every link inside
 * the app was updated too — this is a compatibility shim, not the routing plan.
 *
 * READING `searchParams` MAKES THIS ROUTE DYNAMIC, which is the shim's real
 * price and worth stating plainly: the shell above the table can no longer be
 * prerendered. It is a heading and a breadcrumb behind a login, and four other
 * pages in this app already pay the same, so it buys more than it costs.
 *
 * The redirect runs during THIS server render, before `RequirePermission` — a
 * client component — ever mounts. A role without the grant is redirected and
 * then refused by the card, which is the same refusal one hop later.
 */
export default async function StockCardIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ productId?: string; warehouseId?: string }>;
}) {
  const { productId, warehouseId } = await searchParams;

  if (productId) {
    const query = warehouseId
      ? `?warehouseId=${encodeURIComponent(warehouseId)}`
      : "";
    redirect(
      `/dashboard/inventory/stock-card/${encodeURIComponent(productId)}${query}`,
    );
  }

  // The nav already hides this link from a role without the grant; this covers
  // direct URL entry. It gates on the same permission as the card it leads to,
  // so no card here can lead to a refusal — the product list's own grant is
  // handled inside the screen.
  return (
    <RequirePermission feature="stockMovements">
      <StockProductsScreen />
    </RequirePermission>
  );
}
