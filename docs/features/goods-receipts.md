# Penerimaan Barang (goods receipts)

Deliveries from suppliers, at **`/dashboard/purchasing/receipts`**.
Branch: `feature/inventory-purchasing`.

This is where **HPP is born**. Every other screen in the system reads the
weighted average cost; this is the one that moves it. It is also the screen with
the smallest surface in the whole app, and that is deliberate rather than
unfinished — see the next section before looking for the edit button.

## Create and read. There is no update and no delete.

`/api/goods-receipts` exposes five routes and no more:

| Method | Path                            | Purpose                          |
| ------ | ------------------------------- | -------------------------------- |
| `POST` | `/api/goods-receipts`           | Receive a delivery (irreversible) |
| `POST` | `/api/goods-receipts/preview`   | What receiving would post        |
| `GET`  | `/api/goods-receipts`           | List, paginated and filterable   |
| `GET`  | `/api/goods-receipts/:id`       | One delivery, with its lines     |
| `GET`  | `/api/goods-receipts/summary`   | Purchases per supplier           |

There is no `PATCH`, no `PUT`, no `DELETE` and no `/restore`, and the frontend
does not invent any. A receipt posts stock movements and a journal entry that are
both immutable, and it sets the cost basis every later sale of those goods is
costed at — so an edit would silently restate margins that have already been
reported, and a delete would leave the ledger pointing at a document nobody can
look up.

**A delivery that was wrong is corrected by a purchase return**, which reverses
at the original price and says so in the books. Both list and detail say this in
plain Indonesian rather than leaving a user hunting for an action that does not
exist.

The RBAC catalog agrees: `goodsReceipts: ["create", "read"]`.

### What this rules out, concretely

- **No `includeDeleted` filter.** The endpoint validates the flag, but with no
  delete route no receipt is ever in a deleted state, so it can never change a
  result. `GoodsReceiptListQuery` omits it, `goodsReceiptService.list` never
  sends it, and the toolbar has no toggle — a control that cannot alter its data
  is worse than an absent one.
- **No row actions.** `ReceiptsTable` has no dropdown and no `ConfirmDialog`,
  unlike `SuppliersTable`. Every row leads to exactly one place: its detail.
- **No edit route.** There is no `receipts/[id]/edit`.

## The screens

### List — `ReceiptsScreen`

Toolbar (search over receipt number and notes, supplier, warehouse, purchase
type, a `receiptDate` range) + `ReceiptsTable` + `Pagination`. Mirrors
`SuppliersScreen`, minus the mutation plumbing there is nothing to plumb.

The headline **Total nilai pembelian** comes from `/goods-receipts/summary`,
summed server-side across every receipt ever — not from adding up the page. A
total that grew as the user paged would be worse than no total, because it looks
authoritative. It is deliberately **unfiltered**: it answers "what have we
bought, ever", which is a different question from the one the filters are asking.

**The faktur column** is where the two purchase types visibly diverge, and it is
the fastest way to answer "why does this delivery not appear in my payables"
without opening anything. It is **not** a debt indicator — see below.

### Detail — `ReceiptDetail`

The document, its lines, its lots, and what it set in motion. Not-found is its
own state, separate from a failed request: a 404 offers the way back to the list,
a transport failure offers a retry. Retrying a URL that will never resolve is not
a workflow.

Two decorations are **best-effort** and degrade to nothing rather than to an
error, because each needs a permission the receipt itself does not:

- **Lot code and expiry** (`useReceiptLots` → `GET /product-batches/:id`,
  needs `productBatches:read`). Without it the line still says a lot exists,
  which is the fact that matters.
- **Returns already raised** (`useReceiptReturns` →
  `GET /purchase-returns?originalReceiptId=`, needs `purchaseReturns:read`).
  A receipt cannot be edited, so a return is the only thing that can change what
  it means afterwards — and a second return of goods already gone is a stock
  write-off nobody asked for.

**No journal panel here**, unlike the create form. The document stores
`journalEntryId` but the payload carries no lines, and reconstructing an entry
from `total` and `taxAmount` would be the screen *asserting* what was posted
rather than reading it — the exact class of confident wrong number the preview
endpoint exists to prevent.

### Create — `ReceiptForm`

**The numbers are fetched, not computed.** This form used to run its own
sequential weighted-average simulation across its lines, reimplemented from the
service, plus its own journal and its own invoice — all in the browser. That is
gone. `POST /goods-receipts/preview` is the posting path with the commit left
off, so the lots, the average and the entry shown are the ones that will actually
be written. A reimplementation does not fail loudly when the server changes its
mind; it renders a confident wrong number that the user approves, and here that
number is permanent.

The preview is debounced (350 ms) and gated: the endpoint refuses exactly what
the create refuses, so asking it about a half-typed line would paint the panel
red while the user is still working. **The preview and the save send the same
payload object** — a preview of a different request is worse than no preview.

`receiptNumber` from the preview is shown as **provisional**. It is peeked, not
allocated: two clerks previewing at once see the same value, and a concurrent
post makes it stale.

**One product, one row.** The API refuses a receipt carrying the same product
twice — two lines would each claim to be the truth about the same goods on the
same delivery, and a purchase return could not tell which it was reversing. The
form prevents it rather than validating it: the **+ Tambah barang** picker drops
whatever is already on the form. Two deliveries of one product at two different
prices are a real case, and the answer is **two receipts** — which is also what
they physically were. The error text says so, because "combine the rows" is the
wrong advice when the prices differ.

Local validation covers only what a user can fix without a round trip — a
missing supplier, a non-positive quantity, a repeated SKU, an absent lot code.
Everything else (a supplier whose terms do not permit this purchase type, an
inactive warehouse, a product that holds no stock) comes back as a 400 and is
surfaced verbatim, because the backend names **every** offending SKU at once so a
forty-line delivery is fixed in one pass.

## Beli putus vs konsinyasi

The toggle changes what the form means, not just which fields show.

|                        | `beli_putus`                          | `konsinyasi`                        |
| ---------------------- | ------------------------------------- | ----------------------------------- |
| Ownership              | becomes the tenant's                  | stays the supplier's until sold     |
| Debt                   | credits `2101` **on posting**         | none                                |
| Journal                | posted                                | none — nothing was bought           |
| `taxAmount`            | optional                              | **forbidden** — omitted from payload |
| Lot per line           | only when the product `hasExpiry`     | **always**                          |
| Return possible        | yes                                   | no — there is no purchase to reverse |

`taxAmount` is *omitted from the payload* on consignment rather than sent as
`"0"`. The API refuses the key there rather than ignoring it, on the grounds that
a clerk who typed a tax amount has misunderstood which kind of delivery they are
recording — and silently zeroing it would let them carry on believing the VAT was
captured.

## `invoiceId` is not the debt

The single most misreadable field on this screen. A `beli_putus` receipt credits
`2101 Utang Supplier` **the moment it posts**. `invoiceId` stays `null` until the
supplier's own bill is filed against the delivery through
`POST /api/purchase-invoices`, and is permanently `null` for consignment.

So the detail screen says **"Utang sudah tercatat, faktur supplier belum
difilekan"** — not "no invoice", and never "nothing owed". The list badge reads
`belum difakturkan` for an outright purchase and `tanpa faktur` for a
consignment, because those are different facts.

## Known gaps in the backend

Three, all worked around on the frontend and none of them fatal. Each would be
deleted from here the day the API closes it.

1. **`POST /goods-receipts` is not idempotent.** It takes no `idempotencyKey`,
   unlike `POST /stock-movements` — a receipt *is* the upstream document, so a
   retried submit is indistinguishable from a second van arriving with the same
   goods, which genuinely happens. Mitigated only: the submit button is locked
   for the whole flight, the handler refuses re-entry, and navigation on success
   is `router.replace` so going back cannot re-submit. **A double submit still
   creates two receipts.** The fix is an `idempotencyKey` on the endpoint.

2. **The preview's journal lines carry no account labels.**
   `POST /goods-receipts/preview` returns `{ accountId, debit, credit }`, while
   `POST /stock-movements/preview` returns `{ accountCode, accountName, … }` —
   which is what the shared `JournalPreview` renders. Resolving the ids through
   `/chart-of-accounts` needs `chartOfAccounts:read`, which the seeded **Staff**
   role does not hold, and Staff is precisely who unloads the van. So
   `ReceiptPreviewJournal` maps the lines onto the three accounts a receipt can
   touch (`1201`, `1301`, `2101`) by their role — one credit, debits in order —
   which is the shape the backend documents and enforces. The fix is for the
   preview to label its lines like its sibling; that deletes the shim.

3. **`GET /goods-receipts/:id` resolves product labels but not lot ones.** Lines
   carry `productSku`, `productName` and `productUnit`, but stop at `batchId` —
   the lot code a human recognises and the expiry that decides when it must be
   sold are both absent. `useReceiptLots` fetches them one at a time. The fix is
   `batchCode` and `expiryDate` on the receipt's own lines.

## Files

**Services**

- `services/goodsReceipt.service.ts` — `list`, `getById`, `create`, `preview`,
  `summary`. Nothing else, and a test asserts that.
- `services/purchaseReturn.service.ts` — `list` only. The returns *screens* still
  run on the prototype store; wrapping their writes before they are converted
  would put two ways to return goods in the codebase at once.

**Hooks** (`features/purchasing/hooks/`)

`useGoodsReceipts` (list query state), `useGoodsReceipt` (one document),
`useReceiptPreview` (debounced `/preview`), `useReceiptLots` (best-effort lots),
`useReceiptReturns` (best-effort returns), `useReceiptFilterOptions` (the two
toolbar dropdowns, deliberately unfiltered — a deactivated vendor still delivered
what they delivered).

**Components** (`features/purchasing/components/`)

`ReceiptsScreen`, `ReceiptsToolbar`, `ReceiptsTable`, `ReceiptDetail`,
`ReceiptForm`, `ReceiptPreviewJournal`.

**Types** — `types/api.ts`: `GoodsReceiptDetail`, `GoodsReceiptDetailItem`,
`CreateGoodsReceiptInput`, `CreateGoodsReceiptItemInput`, `GoodsReceiptPreview`,
`GoodsReceiptPreviewItem`, `ReceiptJournalLine`, `PurchaseReturnListRow`,
`PurchaseReturnListQuery`, `PurchaseReturnStatus`.

Named `…Detail` rather than `GoodsReceipt` because `types/purchasing.ts` already
owns that name for the prototype store, which payables and returns still run on.

**Tests** — `tests/ReceiptScreens.test.tsx` (screens, mocked services),
`tests/goodsReceipt.service.test.ts` (HTTP contract, including the asserted
absences). The old demo-store receipt tests were removed from
`tests/PurchasingScreens.test.tsx`; what remains there is payables, returns and
the hub, which are still on the prototype store.
