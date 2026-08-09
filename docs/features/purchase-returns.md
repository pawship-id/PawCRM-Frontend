# Retur ke Supplier (purchase returns)

Goods sent back to a supplier, at **`/dashboard/purchasing/returns`**.
Branch: `feature/inventory-purchasing`.

This is the **only correction a goods receipt can receive**. A receipt is
immutable by design — it sets the cost basis every later sale of those goods is
costed at — so the sanctioned way to undo one is a return that reverses at the
price that delivery actually charged, and says so in the books.

## The workflow is the route table

`/api/purchase-returns` exposes the stock-opname shape, not the goods-receipt
shape: a document with a life before it posts.

| Method   | Path                              | Permission                | Purpose                        |
| -------- | --------------------------------- | ------------------------- | ------------------------------ |
| `POST`   | `/api/purchase-returns`           | `purchaseReturns:create`  | Open a **draft**               |
| `GET`    | `/api/purchase-returns`           | `purchaseReturns:read`    | List, paginated and filterable |
| `GET`    | `/api/purchase-returns/:id`       | `purchaseReturns:read`    | One return, with its lines     |
| `PATCH`  | `/api/purchase-returns/:id`       | `purchaseReturns:update`  | Edit a draft                   |
| `POST`   | `/api/purchase-returns/:id/preview` | `purchaseReturns:submit`| What submitting would post     |
| `POST`   | `/api/purchase-returns/:id/submit`  | `purchaseReturns:submit`| Send the goods back — final    |
| `DELETE` | `/api/purchase-returns/:id`       | `purchaseReturns:delete`  | Discard a **draft**            |

There is no `unsubmit` and no `/restore`, and the frontend does not invent
either. Submitting posts stock movements and a journal entry that are both
immutable, so a return that could go back to draft would claim to describe goods
whose departure had already been booked. **A wrong submitted return is corrected
by receiving the goods back in** — every correction in this module is a new
document, never an edit of an old one.

### `submit` is a permission of its own

Listing what is going back is clerical work a storekeeper does while holding the
damaged carton. Submitting takes the stock out, reverses the weighted-average
cost every later sale is costed at, and reduces what the supplier is owed — none
of it undoable. The seeded **Staff** role holds `create | read | update` and
**not** `submit`: the person who identifies a problem with a delivery should not
also decide the vendor owes less for it. Same split as `submit` on stock opnames
and `pay` on purchase invoices.

The frontend catalog previously read `purchaseReturns: ["create", "read"]` while
the backend's had all five, so `submit`, `update` and `delete` **could not be
granted from the Role screen at all**. Fixed in
`features/permissions/types.ts`.

## The screens

### List — `PurchaseReturnsScreen`

Toolbar (search over the return number, supplier, warehouse, status, a
`returnDate` range) + `PurchaseReturnsTable` + `Pagination`. Mirrors
`ReceiptsScreen`, **plus** the mutation plumbing that one has nothing to plumb: a
draft row can be discarded here, so the screen owns a `ConfirmDialog` and calls
`refetch` when a row leaves.

The action verb differs by status — **Lanjutkan** on a draft, **Lihat** on a
final one — because the invitation does. `Buang` appears only on a draft, since
the API refuses to discard a submitted return.

Money on this screen is money coming **off** a payable and stock coming off the
shelf, so the value column is negative-coded throughout. A draft's total is muted
rather than solid: it is provisional, because the server recomputes every line
against the live receipt at submit.

The search box promises only the return number, because that is the only field
the API matches. **There is no `notes` on a return** — a return explains itself
per line, in `items[].reason`, since one commonly carries two damaged cartons and
one wrong SKU and a single note at the top would have to be a lie about one of
them. `PurchaseReturnListRow` used to declare a `notes` field that was always
`undefined` at runtime; it is gone.

### Create — `PurchaseReturnForm`, `/returns/new`

**Creates a draft and nothing else.** Nothing leaves the shelf here. Deep-linked
from a goods receipt with `?receipt=<id>`.

The delivery is picked first; its lines, the original costs and the returnable
ceiling all follow from it. On save the screen redirects to the new draft's
detail, which is where the preview and the submit live — a draft left on the list
is one somebody has to find again.

**Both purchase types are offered.** The prototype filtered to `beli_putus` and
was *stricter than the API*: consignment goods can be sent back, the stock leaves
and the average is reversed identically, and only the journal entry is skipped
because the goods were never bought. The form labels that instead of hiding the
option.

### Detail — `PurchaseReturnDetail`, `/returns/[id]`

Two screens in one, split by status. A draft can be edited, previewed, submitted
or discarded; a submitted return is read-only and says why. Gated on `read`, not
on the stronger permissions — the screen hides the controls a role does not hold,
and gating the page itself would hide a finished return from everybody who may
only look at one.

## What the frontend does not compute

`ReturnLinesEditor` collects **two fields per line: `qty` and `reason`.** The
product, the lot, the unit cost and the subtotal are all copied server-side from
the receipt line `originalReceiptItemId` names. That is the entire point of
tracing a return to a receipt — the price that delivery actually charged is what
the weighted average must be reversed at, and a client able to type it could
restate the cost basis of everything still in stock.

`ReturnPreviewPanel` renders `POST /:id/preview`, which runs the submit's own
code with the commit left off: the new HPP per product **with the working**, the
stock rows that would be written, and the exact journal lines. The version of
this screen that shipped before ran a local weighted-average simulation. That is
gone, and its absence is the improvement — a local copy does not fail loudly when
it disagrees with the server, it renders a confident wrong number that a user
then approves.

### Why the HPP panel shows its arithmetic

Returning goods that were **cheaper** than the current average makes the
remaining stock **more expensive**. That is arithmetically right — the cheap
units are the ones leaving — but it looks like a bug the first time somebody
watches HPP rise after sending something back, and a bare "after" figure gives
them nothing to check it against.

### `reason` is free text, not an enum

The API stores it per line as a string of up to 255 characters, deliberately: it
is read by the **supplier**, on a document sent to settle a disagreement, and a
fixed vocabulary chosen in our UI would be one the vendor never agreed to. The
editor offers four presets as a shortcut plus "Tulis sendiri…", so
"rusak saat transit, kardus basah" is expressible. The prototype's four-value
`ReturnReason` union in `types/purchasing.ts` is now prototype-only and must not
be used as the API type.

## The returnable ceiling

Each receipt line carries `returnedQty` and `remainingQty`, straight from
`GET /goods-receipts/:id` — shown as **Sudah diretur** and **Maks** in the editor,
and as a **Diretur** column on the receipt detail.

**They count submitted returns only.** A draft has moved no stock and discharged
no debt, so counting one would show a line as spent while the goods are still on
the shelf — and would let a return somebody opened and forgot about permanently
block the goods it named. The consequence is deliberate: two drafts can each
claim the same remainder, and whichever submits second is refused.

**Both figures are advisory.** The server re-reads the ceiling inside the submit
and refuses an over-claim regardless of what a form was shown. The editor uses
them to disable a field and warn early; it never uses them to decide a request
will succeed, and the table says so in a footnote.

These fields did not exist when this feature was planned. Without them the only
way to the same numbers was to list every return against the delivery and then
read each one in full to sum its lines — a request per return to recompute what
the server already computes, and a client-side sum that is wrong the moment the
list is longer than a page. See the backend changelog, `0.29.1`.

## Two things a null means, and one it does not

`journalEntryId` is null for three different reasons, and the detail screen keeps
them apart:

- the return is still a **draft** — nothing has posted;
- the goods came in on **konsinyasi** — there was never a debt to discharge, and
  the screen says so explicitly, because "no journal" must not read as "nothing
  happened": the stock still left and the average was still reversed;
- the returned value came to **zero**, which the ledger correctly declines to
  post an entry for.

## Known limitation, surfaced rather than buried

**PPN Masukan is not reversed.** A `beli_putus` receipt debits `1301 PPN
Masukan`, and a return of those goods should credit back the proportional input
VAT — a line the backend does not post, because the collection stores no tax
amount to split. It is a real overstatement of recoverable VAT and belongs with
the faktur-pajak work. The preview panel carries a notice so nobody reconciles
against a credit that was never posted. See `purchaseReturn.model.js`.

## Files

**Service** — `services/purchaseReturn.service.ts` (all seven operations; it
wrapped `list` alone while these screens ran on the prototype store).

**Types** — the purchase-return block in `types/api.ts`.

**Hooks** — `usePurchaseReturns` (list), `usePurchaseReturn` (one, with
`replace` so a write's own response updates the screen without a second round
trip), `useReturnPreview` (on demand; separates a 403 from an error, because the
endpoint is gated on `submit`), `useReturnableReceipts` (the picker).

**Components** — `PurchaseReturnsScreen`, `PurchaseReturnsToolbar`,
`PurchaseReturnsTable`, `PurchaseReturnStatusBadge`, `PurchaseReturnForm`,
`PurchaseReturnDetail`, `ReturnLinesEditor` (shared by create and draft-edit),
`ReturnPreviewPanel`.

**Routes** — `/returns` (`read`), `/returns/new` (`create`), `/returns/[id]`
(`read`). All three now carry `RequirePermission`; the list previously had none.

**Tests** — `tests/purchaseReturn.service.test.ts`,
`tests/PurchaseReturnScreens.test.tsx`. `tests/PurchasingScreens.test.tsx` is
gone: it was the last purchasing suite seeding `demoStore`, and returns were the
last thing in it.
