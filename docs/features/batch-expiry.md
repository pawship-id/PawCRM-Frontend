# Batch & Expired (Inventory → Batch & Expired)

Every lot across the catalogue, ordered by how soon it expires — against
`/api/product-batches`, `/summary` and `/expiring`. Branch:
`feature/inventory-purchasing`.

| | |
|---|---|
| Route | `/dashboard/inventory/batches` |
| Sidebar | Inventory → **Batch & Expired** |
| Permission | `productBatches:read` (the seeded **Staff** role holds it) |

The screen and its layout existed before this change, running on the in-memory
prototype store. This replaces that with the real API.

## Why this is a screen and not a tab

The batch tab on the stock card answers *"which lots does THIS product have"* — a question
asked while looking at one item. This screen answers the opposite one: *"what in the whole
shop is about to go bad"*, asked on a Monday morning with no particular product in mind,
and which nobody would find by clicking through products one at a time.

That difference is why four backend changes were needed before it could be wired at all —
every one of them a consequence of reading this collection **across** products and
warehouses rather than within one pair.

## Three requests, three different questions

| Endpoint | Answers | Shape |
|---|---|---|
| `/product-batches/summary` | The four tiles | Buckets **mutually exclusive**, so they can be read side by side |
| `/product-batches/expiring` | The alert list | **Cumulative** — 30 days includes the already-expired — live lots that have a date |
| `/product-batches` | The audit list | Everything: exhausted lots, and the consignment ones that never expire |

The list swaps between the last two; `useBatches` owns that choice. The tiles never swap:
their buckets are fixed at 7 and 30 days, which is exactly what they are labelled with, so
switching horizon does not re-fetch them.

**Cumulative vs exclusive is not an inconsistency.** A list is read top-down and should lead
with the most urgent rows, so `withinDays=30` including the expired ones is right. Tiles sit
side by side and must not count the same lot twice, or "2 expired" and "6 at risk" cannot be
compared. `atRisk` is genuinely the other three added up.

## Two controls that explain themselves when they go quiet

- **The horizon is suspended while a search is active.** `/expiring` cannot filter by code,
  name or SKU, and "trace lot WSK-B26-0640" — or "which lots of Royal Canin 3kg are left" —
  is a question about a whole life, including after it sold out. The select is disabled with
  a sentence saying so, rather than silently returning results from a set the user did not
  pick, and its custom range disappears with it rather than sitting there editable and
  ignored.
- **"Tampilkan lot yang sudah habis" is hidden outside audit mode.** An exhausted lot cannot
  expire into anything a human has to act on, so the alert endpoint has no opinion to offer
  about it. A control that does nothing is worse than one that is not there.

## One search box, three fields — and a horizon that takes two dates

`search` goes to `/product-batches` as one string and matches the lot's **`batchCode`**, the
product's **`name`** and its **`sku`** (resolved server-side — a lot carries a `productId`
and no name of its own). The code alone was the least common of the three things somebody
has in front of them: a shelf label carries a name, a barcode sticker carries an SKU, and
the lot code is printed on a carton in the stockroom.

The expiry horizon gains **Rentang khusus** below its 7 / 30 / 90-day presets, which opens a
`FilterDateRange` under it and sends `expiryFrom` / `expiryTo`. A custom window switches to
the audit endpoint exactly as a search does: `/expiring` counts days forward from today and
has no way to express "November", let alone a window that has already closed.

Three things follow, and each is stated on the bar rather than left to be discovered:

- **The presets look forward.** The control's own defaults ("7 hari", "bulan ini") all END
  today, which for expiry can only contain stock that has already gone off. This one offers
  *Sudah lewat*, *60 hari ke depan*, *Bulan ini*, *Bulan depan*.
- **An unfilled custom range narrows nothing**, and the horizon reading "Rentang khusus"
  looks like it does — so the bar says so.
- **A filled one drops the lots with no expiry date**, because a lot with no date cannot
  fall inside a date range. On a screen that otherwise lists them, that is the kind of
  omission people find by counting, so the bar says that too.

The dates are sent bare (`2026-11-30`); the API takes the upper bound as the **end** of the
day it names.

## What the screen does not compute

**Nothing.** The counts, the value, the labels and the order all arrive resolved:

| Shown | Where it comes from |
|---|---|
| Tile counts and **Nilai berisiko** | `/summary` — the value needs every row, so a client cannot produce it |
| Product name, SKU, unit, warehouse name | On the row. Resolved server-side by batched lookups |
| Row order | The API's: closest-to-expiring first, **no-expiry lots last** |

The order matters more than it looks. With the list paged server-side, a client that
re-sorted would only be reordering the twenty rows it happens to hold, producing a sequence
that changes meaning at every page boundary.

## Files

```
services/
  productBatch.service.ts      gained `summary`, plus search/expiry filters on `list`

features/inventory/
  hooks/useBatches.ts          picks the endpoint, owns paging
  hooks/useBatchSummary.ts     the tiles; keyed on warehouse only
  hooks/useWarehouseOptions.ts just the warehouses, for the filter
  components/BatchesScreen.tsx    container
  components/BatchesToolbar.tsx   warehouse, horizon, search, spent toggle
  components/BatchesTable.tsx     the rows + Pagination

types/inventory.ts             ProductBatch gained its four labels;
                               BatchExpirySummary, BatchExpiryBucket
```

`useWarehouseOptions` is deliberately smaller than `useStockCardLookups`: that hook also
pages the whole catalogue for a product picker, which this screen does not have — its rows
already name their own product.

Inactive warehouses **are** listed in the filter. A closed location still holds the lots it
held, and their expiry dates do not stop mattering because nobody may post there any more —
if anything, forgotten stock is exactly what this report exists to surface.

## Backend changes this needed

All four shipped in `PawCRM-Backend` 0.22.0 — see its changelog and `docs/api.md`:

| # | Gap | Fix |
|---|---|---|
| 1 | Rows carried bare ObjectIds | `productName`, `productSku`, `productUnit`, `warehouseName` on the presenter |
| 2 | No summary, and **no way to compute Nilai berisiko** | `GET /product-batches/summary` with exclusive buckets |
| 3 | No-expiry lots sorted FIRST, burying the real answers | `findAll` became an aggregation; nulls sort last (FEFO unchanged) |
| 4 | No batch-code search, no expiry window | `search` (code, name, SKU), `expiryFrom`, `expiryTo` |

The frontend has no workaround for any of them left in it.

## Tests

- `BatchesScreen.test.tsx` (11) — tiles from `/summary` rather than the page, endpoint
  choice per mode, search forcing audit mode and saying so, the spent toggle appearing only
  where it means something, `hasRemaining` tri-state, labels rendered from the row, the
  server's order preserved, a failed summary not taking the list down, and the two empty
  states told apart.
- `InventoryCatalogue.test.tsx` is down to Opname — the last inventory screen with no
  backend.
