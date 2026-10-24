/**
 * WHAT THE TILL READS, ONLINE OR NOT (POS offline mode, 19 October 2026).
 *
 * The catalogue grid, the variant picker, the category pills and the receipt
 * all used to call the server directly. Each now asks here: online it is the
 * same server call, and if that call cannot reach the server — or the till is
 * offline already — the answer comes from the device's snapshot instead. The
 * components above do not know which.
 */
import { isOfflineMode } from "@/lib/connectivity";
import { ApiError } from "@/services/api-error";
import { categoryService } from "@/services/category.service";
import { posService } from "@/services/pos.service";
import type {
  Category,
  PageResult,
  PosCatalogItem,
  PosCatalogQuery,
  PosReceipt,
} from "@/types/api";

import { offlinePriceable } from "./pricing";
import { getQueued } from "./queue";
import { receiptOf } from "./receipt";
import { snapshotReady } from "./snapshot";
import { getOfflineState } from "./store";

const DEFAULT_LIMIT = 8;

function unreachable(error: unknown): boolean {
  return error instanceof ApiError && (error.isNetworkError || error.isTimeout);
}

function canServeLocally(): boolean {
  return snapshotReady(getOfflineState().snapshot);
}

/** Lowercase, accent-free — "Kucing" matches "kucing", "Café" matches "cafe". */
function fold(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** The catalogue as the server would page it, from the snapshot. */
export function localCatalog(query: PosCatalogQuery = {}): PageResult<PosCatalogItem> {
  const { snapshot, pendingQty } = getOfflineState();
  const tiles = snapshot.catalog?.items ?? [];
  const stock = snapshot.stock;
  const allowNegative = stock?.allowNegativeStock !== false;
  const limit = query.limit ?? DEFAULT_LIMIT;
  const page = query.page ?? 1;
  const kinds = query.kinds?.length ? query.kinds : ["product", "service"];
  const term = fold(query.search?.trim());

  /* A category pill means it and everything filed under it. */
  let categoryIds: Set<string> | null = null;
  if (query.categoryId) {
    categoryIds = new Set([query.categoryId]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const category of snapshot.catalog?.categories ?? []) {
        if (category.parentId && categoryIds.has(category.parentId) && !categoryIds.has(category._id)) {
          categoryIds.add(category._id);
          grew = true;
        }
      }
    }
  }

  const variantCounts = new Map<string, number>();
  for (const tile of tiles) {
    if (tile.parentId) variantCounts.set(tile.parentId, (variantCounts.get(tile.parentId) ?? 0) + 1);
  }

  const matches = tiles.filter((tile) => {
    if (!kinds.includes(tile.kind)) return false;
    if (tile.kind === "service") {
      // Priced by zone or a journey: the server has to answer those.
      if (!offlinePriceable(tile as never)) return false;
      if (tile.serviceKind === "pickup-delivery") return false;
      if ((tile as { serviceType?: string }).serviceType === "addon") return false;
    }
    if (categoryIds && !categoryIds.has(String(tile.categoryId ?? ""))) return false;
    if (query.parentId) return String(tile.parentId ?? "") === String(query.parentId);

    if (query.scan) {
      const code = (query.search ?? "").trim();
      return tile.kind === "product" && (tile.code === code || tile.barcode === code);
    }
    if (term) {
      return (
        fold(tile.name).includes(term) ||
        fold(tile.code).includes(term) ||
        fold(tile.barcode).includes(term)
      );
    }
    // No search and no family named: one tile per family, as the grid does.
    return tile.productType !== "variant";
  });

  const items: PosCatalogItem[] = matches
    .slice((page - 1) * limit, page * limit)
    .map((tile) => {
      if (tile.kind !== "product" || tile.productType === "parent" || tile.productType === "bundle") {
        return {
          ...tile,
          stock: null,
          sellable: true,
          variantCount: tile.productType === "parent" ? (variantCounts.get(tile._id) ?? 0) : tile.variantCount,
        } as PosCatalogItem;
      }
      const held = Number(stock?.qty?.[tile._id] ?? "0") - (pendingQty[tile._id] ?? 0);
      return {
        ...tile,
        stock: { qty: String(held), state: held <= 0 ? "out" : "ok" },
        sellable: allowNegative || held > 0,
      } as PosCatalogItem;
    });

  return {
    items,
    pagination: {
      page,
      limit,
      total: matches.length,
      totalPages: Math.ceil(matches.length / limit),
    },
  };
}

export async function tillCatalog(query: PosCatalogQuery = {}): Promise<PageResult<PosCatalogItem>> {
  if (isOfflineMode() && canServeLocally()) return localCatalog(query);
  try {
    return await posService.catalog(query);
  } catch (error) {
    if (unreachable(error) && canServeLocally()) return localCatalog(query);
    throw error;
  }
}

/** The category pills' list, ranked by how much each holds. */
export async function tillCategories(): Promise<Category[]> {
  const local = (): Category[] => {
    const { snapshot } = getOfflineState();
    const counts = new Map<string, number>();
    for (const tile of snapshot.catalog?.items ?? []) {
      if (tile.categoryId) counts.set(tile.categoryId, (counts.get(tile.categoryId) ?? 0) + 1);
    }
    return (snapshot.catalog?.categories ?? []).map(
      (category) =>
        ({
          ...category,
          kind: "product",
          productCount: counts.get(category._id) ?? 0,
        }) as unknown as Category,
    );
  };

  if (isOfflineMode() && canServeLocally()) return local();
  try {
    const result = await categoryService.list({ isActive: true, limit: 100, withProductCount: true });
    return result.items;
  } catch (error) {
    if (unreachable(error) && canServeLocally()) return local();
    throw error;
  }
}

/** An offline sale's id is the device's `clientTxnId`. */
export function isOfflineSaleId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("ctx-");
}

export async function tillReceipt(saleId: string): Promise<PosReceipt> {
  if (isOfflineSaleId(saleId)) {
    const record = await getQueued(saleId);
    if (!record) throw new ApiError("Struk tidak ditemukan di perangkat ini", 404);
    // Synced already, and online: the server's copy carries the final figures.
    if (record.posTransactionId && !isOfflineMode()) {
      try {
        return await posService.receipt(record.posTransactionId);
      } catch {
        return receiptOf(record);
      }
    }
    return receiptOf(record);
  }
  return posService.receipt(saleId);
}
