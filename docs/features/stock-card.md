# Kartu Stok (Inventory → Kartu Stok)

The stock card and the lot list for **one product at one warehouse**, against
`/api/stock-movements`, `/api/stock-movements/summary`, `/api/stock-movements/export`
and `/api/product-batches`. Branch: `feature/inventory-purchasing`.

**Two routes**, since the split:

| Route | What it is |
|---|---|
| `/dashboard/inventory/stock-card` | The **index**: every stock-holding product, searched and paged by the server, for one warehouse or all of them |
| `/dashboard/inventory/stock-card/[productId]?warehouseId=` | The **card** itself: one product's ledger and lots, warehouse switchable |

Shipped in three passes, and the later ones are why several things here look simpler than
they sound:

1. **Wiring** — the screen moved off the in-memory prototype store
   (`features/inventory/data/demoStore.ts`) onto the real API, working around six gaps in
   what that API returned.
2. **Rewiring** — the backend closed five of the six (`PawCRM-Backend` 0.20.0), and every
   workaround built for them was deleted rather than kept.
3. **The split** — the product stopped being a dropdown and became a route. See
   *Choosing the product* below.

## What it does

Under **Dashboard → Inventory → Kartu Stok** a permitted user can:

- **search the catalogue** by name or SKU, across every warehouse or one of them, and read
  each product's stock, HPP and stock value there before opening anything;
- open one product's card and read every movement of that pair, newest first, with the
  balance each movement left behind, the lot it touched and who posted it;
- **switch warehouse** on the card without going back;
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

## Choosing the product

The card used to ask for the product itself, from a `<select>` the screen filled by paging
the **whole catalogue** on mount: five parallel requests, a hard ceiling of 500 products,
and a banner apologising to any tenant past it. A catalogue is not a dropdown. So the
choosing became a screen — `StockProductsScreen`, the index — where the **server** does the
searching and the paging, and the card became what you open from it.

What the index is, precisely, and how it differs from the catalogue at
**Produk & Varian**, which lists the same documents:

| | Katalog | Kartu stok (index) |
|---|---|---|
| Rows | One per **family**, variants folded behind a chevron | **Flat** — a variant is its own row (`holdsStock=true`) |
| Parent / bundle | Listed | Excluded: neither holds stock, so neither has a card |
| Warehouse | Any number, empty = all, in the filter panel | **One or all**, beside the heading |
| Columns | Type, category, HPP, price, stock | Stock, HPP, **stock value** — all for the chosen scope |
| Question | "What do we sell?" | "What is on this shelf, and what happened to it?" |

**Semua gudang is the default, and a total is not a shelf.** The scope opens on
every warehouse — "how much of this do we have" is what somebody arriving at a
list is asking — and picking one narrows the figures to that shelf. But a card is
always one product at *one* warehouse: a running balance summed across locations
would claim stock is somewhere it is not. So a row showing a total cannot hand
the card a warehouse, and two things close that gap rather than hiding it:

- the row carries **"di N gudang"** under the figure, so a total does not read as
  a quantity somebody could go and pick;
- the link **names no warehouse**, and the card opens on the location holding the
  most of that product — the closest single answer to the number that was
  clicked, and not the first warehouse in the list, which would answer nothing.

**No filter here may be derived from a quantity.** `stockByWarehouse` is assembled per row
from rows the server has already paged, so a "sembunyikan stok 0" or "stok menipis" toggle
would leave `pagination.total` describing one set while the table showed another — a page
of twenty rendering as six. Sorting by stock is out for the same reason: the server cannot
order by a number it was never asked to compute. What *is* offered is what
`GET /api/products` genuinely filters on: search, sort, category, status, deleted.

`minStock` is a property of the **product**, so it lines up with the total and *not* with
one shelf's figure — a product merely stored elsewhere reads as low once a warehouse is
picked. The heading says which scope is on screen, and the badge says "menipis" rather than
claiming a shortage.

### The card's own two ids

A product detail links straight to the card per warehouse row, carrying **both ids** —
`/stock-card/<productId>?warehouseId=<id>`. A link naming only the product would land the
user on a different shelf's number than the one they were looking at.

Both arrive **as props**, read by the server page from `params` and `searchParams` — the
convention four other pages here already follow. `productId` is used straight from the prop
and never copied into state, so a new route cannot land on the previous product's ledger.
`warehouseId` *is* state, seeded once, because the select changes it; the page keys the
component on the pair so a second deep link is not ignored. The address bar is not
rewritten as the select changes, because a dozen history entries for one screen is a back
button nobody can use.

> **The `Suspense` boundary is gone, with the `useSearchParams` that forced it.** It was
> there because a statically prerendered route calling that hook fails `next build` while
> working perfectly in development. Both routes read their params on the server now, which
> makes them dynamic — a heading and a breadcrumb behind a login, and the price of the
> legacy-URL shim below.

### The old URL still works

`?productId=&warehouseId=` on the index route redirects to the card. It was a documented,
bookmarkable address; every link inside the app was updated, and this is for the ones
outside it.

## Permissions

Four separate grants, and the screen degrades one section at a time:

| Grant | Without it |
|---|---|
| `stockMovements:read` | Page-level `RequirePermission` on **both** routes → access denied |
| `products:read` | Index: a named panel where the table would be, **and no request fired**. Card: position tiles blank |
| `warehouses:read` | Warehouse select empty; everything stays at "semua gudang" |
| `categories:read` | Index: the category filter cannot be filled |
| `productBatches:read` | Batch tab hidden entirely, and not requested |

**Both routes gate on `stockMovements:read`, not on `products`** — the nav entry can name
only one permission, and it names that one. Gating the index on `products` instead would
show the menu to a `stockMovements`-only role and then refuse them, which is worse than
today. The list's own grant is handled inside the screen, and it is handled by *not
asking*: a request guaranteed to be refused is not worth a round trip.

Each failure renders a named error where its data would be, never an empty table — "no
stock movements" and "you may not look" are very different statements. The seeded **Staff**
role carries all four, pinned by a test on the backend.

**Inactive warehouses are included** in the select, unlike the movement forms. A
deactivated warehouse still owns everything it ever held, and a history nobody can open is
an audit hole.

**Deleted and inactive products can be reached too** — and until the split they could not:
the old picker's header claimed they were included while never sending `includeDeleted`.
The index has a *Tampilkan produk terhapus* toggle, which is what actually closes that
hole. A product is soft-deleted precisely so its stock history keeps resolving.

## Files

```
services/
  api-client.ts                gained `download` — a file, not the JSON envelope
  stockMovement.service.ts     list, summary, export, getById — read-only
  productBatch.service.ts      list, expiring, getById — read-only

app/(dashboard)/dashboard/inventory/
  stock-card/page.tsx              the index, + the legacy `?productId=` redirect
  stock-card/[productId]/page.tsx  the card; reads `?warehouseId=` on the server

features/inventory/
  hooks/useStockProducts.ts    the index list — `holdsStock`, server search + paging
  hooks/useWarehouseOptions.ts the warehouse select (inactive included)
  hooks/useProductStock.ts     products/:id — the heading and the position tiles
  hooks/useStockCard.ts        one page of the ledger
  hooks/useStockCardSummary.ts the period tiles
  hooks/useProductBatches.ts   the lot tab
  utils/ledger.ts              partitionBatches, qtyAtWarehouse
  components/StockProductsScreen.tsx   the index
  components/StockProductsToolbar.tsx  search + the filter panel
  components/StockProductsTable.tsx    the index's rows
  components/StockCardScreen.tsx   the card
  components/StockCardFilters.tsx  type + date range, reset, export
  components/StockLedgerTable.tsx  the ledger
  components/BatchLotTable.tsx     the lots

types/inventory.ts             StockMovement (+ computed fields), StockMovementPage,
                               StockMovementSummary, the list queries
```

`useStockCardLookups` is **no longer used here** — it survives for
`StockAdjustmentForm` and purchasing's `ReceiptForm`, which still need a product picker.

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
- `StockCardScreen.test.tsx` (24) — the pair it reads comes from its props, **the catalogue
  is never paged**, the balance/lot/author rendered straight from the row, the document
  number and its fall back to the type, period tiles from the summary endpoint rather than
  the page, page-jumping, export success and failure, the hidden lot tab, error surfacing.
- `StockProductsScreen.test.tsx` (9) — `holdsStock` sent alone (the API 400s it beside
  `productType` or `excludeVariants`), search reaching the server, a variant as its own row,
  the quantity and the row's link belonging to the selected warehouse, the pager on the
  server's total, and no request at all without `products:read`.
- `StockCardIndexPage.test.tsx` (3) — the legacy `?productId=` redirect, with and without a
  warehouse, and no redirect when nothing is named.

The Radix selects are not driven in tests — jsdom cannot do their pointer protocol, and
what they set is filter state that goes straight to the query.
