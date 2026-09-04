# Reports (Dashboard → Reports)

The operational reports, against `/api/reports`, `/api/products/low-stock` and
`/api/product-batches/consignment-summary`. Frontend half of backend `0.37.0`.

## What it does

Under **Dashboard → Reports** a permitted user gets a hub of seven cards. Three
lead to screens built here; three lead to screens that already existed; one is
dead and says why.

| Report | Where it lives |
| --- | --- |
| Stok per Cabang | `/dashboard/reports/stock-on-hand` — **new** |
| Stok Minim | `/dashboard/reports/low-stock` — **new** |
| Konsinyasi Outstanding | `/dashboard/reports/consignment` — **new** |
| Kartu Stok | `/dashboard/inventory/stock-card` |
| Produk Mendekati Expired | `/dashboard/inventory/batches` |
| Riwayat Opname | `/dashboard/inventory/opname` |
| Sales per Produk | nowhere — blocked, see below |

## Half of these are links, and that is the design

The stock card, the batch list and the opname history are complete screens with
their own filters and exports. Building "report" versions of them would have been
the fastest possible way to end up with two screens that answer the same question
and slowly stop agreeing about it. **Reports is a table of contents for them**,
plus the three that had no home.

## Permissions are per card, not per page

`/dashboard/reports` carries no `RequirePermission` — unusually for this app, and
deliberately. Each card names the grant its own destination enforces:

| Card | Grant |
| --- | --- |
| Stok per Cabang, Stok Minim, Sales | `products:read` |
| Kartu Stok | `stockMovements:read` |
| Produk Mendekati Expired, Konsinyasi | `productBatches:read` |

Gating the page on one feature would either hide it from people who can read half
of it, or show a page whose links all lead to 403s. A role holding nothing gets a
sentence instead of an empty grid. The destination routes still carry their own
`RequirePermission` for direct URL entry.

## The sales card is shown and disabled

There is no POS and no invoice, so there is no sales data — the card cannot work
and will not until those modules land.

It renders greyed, badged **Segera**, with the reason on the card. The trade is
worth naming: a hidden card leaves an owner wondering whether the feature exists,
a dead one says what blocks it. The cost is one inert tile on a page people visit
often, which is why it sorts last.

## Stok per Cabang

The one report with a new endpoint behind it. `GET /api/reports/stock-on-hand`.

### Rows are per warehouse; the grouping is the screen's

The API deliberately does not collapse warehouses into branches (PCR-019: a
branch may hold several), so `groupByBranch` does it here. A warehouse whose
`defaultBranchId` is null — a bazaar stall set up for an event — groups under
**"Tanpa cabang"** rather than disappearing. Forgotten stock in a location nobody
visits is exactly what a valuation report is for.

### The screen computes almost nothing

`data.totals` covers the **entire filtered set** and is rendered as it arrives.
Summing the page would produce a figure that changes as you page, looks like an
answer, and is not one. A caption under the tiles says which set they count,
because three big numbers above a paged table will otherwise be read as its sum.

The per-branch subtotals are the exception, and they are labelled *"subtotal
halaman ini"* for exactly that reason.

### A missing cost basis renders as an em dash, never Rp 0

`hppAvg` is null until a product's first goods receipt. *"We do not know what this
is worth"* and *"this is worth nothing"* are different findings, and only one of
them is a data-entry problem the owner should chase.

### Zero-stock rows are hidden, and the empty state says so

A row exists for every (product, warehouse) pair that has ever moved, so a
catalogue trading for a year has one for everything it has sold out of. When the
filter returns nothing, the message names the hidden rows — otherwise the reader
concludes the warehouse is empty.

### Filter errors pass through verbatim

The API refuses a warehouse or category that does not exist rather than reporting
zero rows, and its message names which. Re-wording that as "Gagal memuat" would
throw away the only useful part.

## Stok Minim

`GET /api/products/low-stock` — the same endpoint the inventory hub's alert card
uses, given a full page. The hub answers *"is there anything to do today"*; this
answers *"what, exactly"*. There is no second API and no second idea of what low
means.

**No warehouse filter**, and that is not an omission: `minStock` lives on the
catalogue row and `qtyOnHand` sums every location, so filtering by one warehouse
would report a product as low whenever it is merely stored somewhere else.

Its export is labelled **"Export halaman ini"**. The endpoint has no CSV stream
and the list is bounded by design — a restock list running to hundreds of pages
means the thresholds are wrong, not that the export is.

## Konsinyasi Outstanding

`GET /api/product-batches/consignment-summary` with no `supplierId` — the
cross-supplier view that nothing had. The supplier detail screen already showed
one vendor's figure.

> **The one thing this screen must not let a reader do is add these numbers to
> the payables.** Consigned goods belong to the supplier until they sell, so
> nothing here is owed. It is the *other half* of a vendor's position, not more
> of the same half.

A banner says so and links to Utang Supplier. It is not decoration: an owner
reading two totals on two screens will otherwise sum them.

A row whose supplier was soft-deleted **stays**, labelled "Supplier sudah
dihapus". The goods are on the shelf either way; hiding the row would lose the
stock.

## Export is `.xlsx`, everywhere

No CSV button and no PDF button. A CSV carries no types, so every number and date
in it is text the recipient's Excel re-guesses on open — differently depending on
their locale.

`src/utils/xlsx.ts` is the one place that writes a workbook, and the columns are
typed: a quantity is a number the reader can sum, a date is a date they can sort,
and a SKU of digits keeps its leading zero because **text is the default**.

Two routes in, one writer:

| Source | How |
| --- | --- |
| Big exports — Stok per Cabang, Kartu Stok | server streams CSV → `csvToXlsx` re-types by header |
| Small ones — Stok Minim, Konsinyasi | rows already in memory → `exportToXlsx` with typed columns |

**The big ones do not page the JSON endpoint.** `limit` caps at 100, so a
six-thousand-row catalogue would be sixty round trips before the file could be
built. The export endpoints stream the whole filtered set in one response, chosen
by the same code that chose the rows on screen — so the file and the screen
cannot disagree about which rows exist.

`csvToXlsx` types columns **by header name, never by position**. The server owns
the column list; one added there flows through as text and nothing breaks, where
a positional map would silently retype every column after it.

### The stock card's button changed, its endpoint did not

`GET /api/stock-movements/export` still streams CSV and remains the escape hatch
for anyone hitting it directly. Only the file the button produces is different.

`Waktu` is deliberately **not** typed as a date: the server writes a full ISO
timestamp and the date type reads only the date half, so typing it would quietly
throw the time away — and a stock card read to settle a dispute is exactly where
the time matters.

## Files

**Types** — `types/report.ts`.

**Service** — `services/report.service.ts`. One report lives here; the other six
are served by the module that owns their data.

**Workbook writer** — `utils/xlsx.ts`. **CSV scanner** — `utils/csv.ts`, moved out
of the inventory feature once the exports needed it too; `features/inventory/utils/sheet.ts`
re-exports it so the import parser and the exports cannot drift into different
ideas of what a quoted field is.

**Hooks** — `useStockOnHand` (keeps the previous page on screen while the next
loads — a table that empties on every click is one the reader loses their place
in), `useReportLookups` (three filter lists, `Promise.allSettled`, no error state:
a failed lookup leaves its dropdown holding only "Semua …", which still produces a
usable report).

**Components** — `ReportsHub`, `StockOnHandScreen`, `LowStockScreen`,
`ConsignmentScreen`.

**Routes** — `/dashboard/reports` (ungated, cards gate themselves),
`/reports/stock-on-hand` (`products:read`), `/reports/low-stock`
(`products:read`), `/reports/consignment` (`productBatches:read`).

**Tests** — `tests/xlsx.test.ts` (16, every case reads the workbook back through
real SheetJS — asserting the blob is non-empty would pass just as well with
`cellStyles` off, the one flag whose absence discards every type), and
`tests/ReportsScreens.test.tsx` (19).

> The screen suites **mock `@/utils/xlsx`**. What they own is the hand-off — which
> rows, through which endpoint, with which column types — not the bytes. Loading
> the real 500 KB SheetJS build in every suite that merely offers an export button
> is what made the parallel run slow enough to time out unrelated suites.

## What this deliberately does not do

- **No PDF.** `window.print()` with a print stylesheet would cover it; a PDF
  library is ~500 KB for something the browser already does. Not built because it
  was not asked for, and the seam is a stylesheet away.
- **No period filter on the stock reports.** Stock on hand is a position, not a
  flow — "stok per cabang bulan lalu" would need a point-in-time replay of the
  ledger, which is a different report.
- **No Rekap Komisi.** Needs PCR-045 (groomer commission), which is in the
  Grooming Booking module and unbuilt.
