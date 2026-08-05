# Kartu Stok (Inventory → Kartu Stok)

The stock card and the lot list for **one product at one warehouse**, against
`/api/stock-movements`, `/api/stock-movements/summary`, `/api/stock-movements/export`
and `/api/product-batches`. Branch: `feature/inventory-purchasing`.

Shipped in two passes, and the second is why several things here look simpler than they
sound:

1. **Wiring** — the screen moved off the in-memory prototype store
   (`features/inventory/data/demoStore.ts`) onto the real API, working around six gaps in
   what that API returned.
2. **Rewiring** — the backend closed five of the six (`PawCRM-Backend` 0.20.0), and every
   workaround built for them was deleted rather than kept.

The demo store stays: the hub and the two manual-movement forms still use it.

## What it does

Under **Dashboard → Inventory → Kartu Stok** a permitted user can:

- pick a **warehouse** and a **product**, and read every movement of that pair, newest
  first, with the balance each movement left behind, the lot it touched and who posted it;
- filter by **movement type** and by a **date range**, and page through the result;
- read what moved **in that period** — total in, total out, nett, movement count;
- **export** the whole filtered set as CSV;
- switch to the **Batch / FEFO** tab: the same product's lots at the same warehouse, in the
  order FEFO will consume them.

Four tiles sit above the tabs, and they are two different kinds of number — the labels say
which. **Stok di gudang ini** and **Nilai persediaan** describe the position right now;
**Masuk / Keluar periode ini** describe the range the filters select.

## Two views of one truth

The ledger says **what happened**; the lots say **what is on the shelf right now**. A lot's
`qtyRemaining` is a cache the ledger could rebuild, so a disagreement between the two tabs
is itself the useful signal — which is why they share a screen a click apart, and why
neither is derived from the other.

## The screen computes almost nothing

Worth stating plainly, because the first version computed a great deal and the code reads
oddly without knowing what left.

`balanceAfter` arrives **on the row**. The server sums it over the whole ledger of the
pair, *including the rows your filters hide*, so it is correct on any page under any
filter. The frontend used to reconstruct it: anchor to `qtyOnHand` from
`GET /api/products/:id`, walk backwards through the rows. That was exact only while no
newer movement was hidden, which forced two things that are now gone:

| Gone | Why it existed | Why it could go |
|---|---|---|
| `withRunningBalance` / `canAnchorBalance` in `utils/ledger.ts` | Rebuilt the balance client-side | The row carries it |
| Blanking the balance column under a type or end-date filter | Those filters hide newer rows, breaking the anchor | The server sums the hidden rows too |
| Append-only paging ("Muat lebih banyak") | The anchor needed rows contiguous from the newest | Each page is correct on its own — ordinary `Pagination` |
| A client-side `batchId → batchCode` join off the lot tab | The ledger returned bare ids | `batchCode` is on the row |
| Two product requests merged (`standalone` + `variant`) | `productType` takes one value | `holdsStock=true` |
| Omitted period tiles | Summing the page reports the page, which grows as you page | `/summary` |

`utils/ledger.ts` is what is genuinely left: `partitionBatches` (a display ordering) and
`qtyAtWarehouse` (a lookup with a default).

## Export

`stockMovementService.export` fetches the **blob** and the screen saves it, rather than
pointing an anchor at the endpoint. An anchor is fewer lines and turns a 403 into a
downloaded file containing `{"success":false}` — the one outcome worse than no download.
`apiClient.download` exists for this: same credentials, timeout and error translation as
every other call, minus the `{ success, data }` unwrapping that would throw on the first
byte of CSV.

The file obeys the filters and contains **every** matching row, not the current page — the
button says so, next to the filters it obeys.

## Permissions

Four separate grants, and the screen degrades one section at a time:

| Grant | Without it |
|---|---|
| `stockMovements:read` | Page-level `RequirePermission` → access denied |
| `products:read` | Product picker empty, position tiles blank |
| `warehouses:read` | Warehouse picker empty |
| `productBatches:read` | Batch tab hidden entirely, and not requested |

Each failure renders a named error where its data would be, never an empty table — "no
stock movements" and "you may not look" are very different statements. The seeded **Staff**
role carries all four, pinned by a test on the backend.

**Inactive warehouses and inactive products are included** in the pickers, unlike the
movement forms. A deactivated warehouse still owns everything it ever held, and a history
nobody can open is an audit hole. `WarehouseProductPicker` gained an opt-in
`includeInactiveWarehouses` prop for this; the forms leave it off.

## Files

```
services/
  api-client.ts                gained `download` — a file, not the JSON envelope
  stockMovement.service.ts     list, summary, export, getById — read-only
  productBatch.service.ts      list, expiring, getById — read-only

features/inventory/
  hooks/useStockCardLookups.ts warehouses + `holdsStock` products
  hooks/useProductStock.ts     products/:id — the position tiles
  hooks/useStockCard.ts        one page of the ledger
  hooks/useStockCardSummary.ts the period tiles
  hooks/useProductBatches.ts   the lot tab
  utils/ledger.ts              partitionBatches, qtyAtWarehouse
  components/StockCardScreen.tsx   container
  components/StockCardFilters.tsx  type + date range, reset, refresh, export
  components/StockLedgerTable.tsx  the card
  components/BatchLotTable.tsx     the lots

types/inventory.ts             StockMovement (+ computed fields), StockMovementPage,
                               StockMovementSummary, the list queries
```

`refreshKey` is owned by the screen and shared by four hooks: a user who hits **Muat
ulang** because a number looks wrong must not get a fresh ledger beside stale tiles.
`useStockCardSummary` is deliberately *not* keyed on the page number — the totals do not
change when you page, and re-fetching them per click would be one wasted request each.

## The Referensi column names the document where there is one

**`referenceNo`** (PawCRM-Backend 0.24.0) carries the number of the document behind a row,
and the column shows it above the type: `OPN-2026-0007` over "Stok opname". Only stock
opname can fill it today — `goodsreceipts` and `postransactions` are still not collections,
and a manual adjustment or a transfer has no document at all by design — so the field is
`null` on most rows and the column falls back to the type alone.

**The fallback is the TYPE, never `reference.id`.** An ObjectId names nothing a reader can
look up, and printing one would make the column look filled while answering nothing.

This was the last open piece of gap 2 in `PawCRM-Backend/docs/stock-card-gaps.md`; nothing
on this screen is waiting on the backend now.

## Tests

- `stockLedger.test.ts` (4) — lot partitioning and the warehouse lookup. Most of this file
  was balance arithmetic before the server took it over.
- `stockLedger.service.test.ts` (10) — the full query object of every call, so an unset
  filter that quietly became `""` cannot ship, and `export` cannot grow a `limit`.
- `StockCardScreen.test.tsx` (15) — the balance/lot/author rendered straight from the row,
  the document number and its fall back to the type, period tiles from the summary endpoint
  rather than the page, page-jumping, the one-request picker, export success and failure,
  the hidden lot tab, error surfacing.

The Radix selects are not driven in tests — jsdom cannot do their pointer protocol, and
what they set is filter state that goes straight to the query.
