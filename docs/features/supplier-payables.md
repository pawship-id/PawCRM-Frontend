# Utang Supplier (supplier payables)

What the tenant owes its suppliers, at **`/dashboard/purchasing/payables`**.
Branch: `feature/inventory-purchasing`.

Three screens: the list, one invoice with its payment form, and the form that
files a supplier's bill against a delivery. All three run against
`/api/purchase-invoices`; the prototype store they used to read is gone.

## Read this first: the invoice is not the debt

A `beli_putus` goods receipt credits **`2101 Utang Supplier` the moment it
posts**. The payable exists before any invoice is filed. What a purchase invoice
adds is the paperwork the debt was always missing:

- the **vendor's own invoice number** — theirs, not ours, because it is what they
  quote when they chase payment;
- the date they **issued** it;
- the **due date**, derived by the server from `suppliers.paymentTermDays`.

Filing one therefore posts **no journal entry at all**, and `journalEntryId` on
the invoice is null on everything the API writes today. That is the design, not a
gap — a second AP entry would book the same obligation twice, and a doubled
payable is invisible in a balance sheet that still balances perfectly.

Two consequences the screens are careful about:

- A goods receipt with `invoiceId: null` does **not** mean "nothing is owed".
  `ReceiptDetail` says so in as many words, and offers `Catat faktur supplier`
  rather than implying the delivery is free.
- Consignment deliveries never appear in this module. The goods stay the
  supplier's until they sell, so nothing is owed on arrival and the API refuses
  an invoice against one.

## Routes and permissions

| Route                                     | Guard                     |
| ----------------------------------------- | ------------------------- |
| `/dashboard/purchasing/payables`          | `purchaseInvoices:read`   |
| `/dashboard/purchasing/payables/[id]`     | `purchaseInvoices:read`   |
| `/dashboard/purchasing/payables/new`      | `purchaseInvoices:create` |

The payment form inside the detail screen gates itself separately on
`purchaseInvoices:pay`. **That split is the point.** Filing a bill is data entry
a purchasing clerk does all morning; paying one moves cash out of the bank on an
entry that cannot be undone. The seeded Staff role holds `create` + `read` and
**not** `pay`. A role without it sees the whole invoice and an explanation
instead of the form — the separation made visible rather than discovered through
a 403.

> **Catalog fix shipped with this feature.** The frontend declared
> `purchaseInvoices: ["read", "update", "pay"]`, which was wrong in both
> directions: there is no `PATCH` route for `update` to gate, and the missing
> `create` meant the file-a-bill button was hidden from exactly the roles that
> hold the grant. It now reads `["create", "read", "pay"]`, matching
> `PawCRM-Backend/src/config/permissionCatalog.js`.

## Nothing is recomputed in the browser

This module replaced a prototype that derived the outstanding balance, the
overdue flag and the running total client-side. Every one of those is now the
server's:

| Figure               | Source                                          |
| -------------------- | ----------------------------------------------- |
| `outstandingAmount`  | `total - paidAmount`, in exact minor units       |
| `isOverdue`          | `status != paid` **and** past due, one instant per page |
| Total sisa utang     | `GET /purchase-invoices/outstanding`             |
| Overdue count + total| the same endpoint                                |

`isOverdue` is worth spelling out. A date-only check would be wrong twice:
`dueDate` keeps its value after settlement, so a calendar comparison reports
every invoice ever paid late as still outstanding — and evaluating it per row in
the browser lets two invoices due at the same moment land on opposite sides of it
because the clock ticked mid-render. `PayablesTable` still calls `daysUntil`, but
only to say **how** late, never **whether**.

The one thing summed in the browser is the hub's "due this week" total, and only
when the fetch returned the complete bucket — see below.

## The filters go over the wire

`usePurchaseInvoices` owns a single `view` knob that maps onto the API's three:

| View          | Sent as              |
| ------------- | -------------------- |
| Jatuh tempo   | `overdue: true`      |
| Belum lunas   | `outstanding: true`  |
| Sebagian      | `status: "partial"`  |
| Lunas         | `status: "paid"`     |
| Semua         | (nothing)            |

Outstanding is `status != paid` and overdue is that plus a past due date — both
are the **API's** definitions, so every consumer asks the question identically.
Filtering a page locally instead would show four rows above a pager claiming
twenty, which is the failure mode that looks like working software.

The screen **opens on Belum lunas**, not Semua. A payables screen is opened to
answer "what do we owe"; settled bills are history, and leading with them buries
the ten rows that need money under a hundred that do not.

## Recording a payment

`POST /purchase-invoices/:id/payments` posts `Dr 2101 / Cr 1101 Kas or 1102 Bank`
in the same transaction as the payment, and returns the **updated invoice** — new
`paidAmount`, new `status`, the payment appended. `InvoiceDetail` hands that
response straight to `applyInvoice` rather than refetching: it is the exact
document the write produced, and it costs one round trip instead of two.

**The endpoint is not idempotent.** There is no key to send, so a double-click
records the cash leaving twice on two irreversible entries. `RecordPaymentForm`
locks its submit for the whole flight and only releases it on failure.

The client-side "not more than outstanding" check is a **courtesy, not the
authority** — two clerks paying at once both pass it, and one of them loses the
server's compare-and-swap with a 409. What it buys is a message before a round
trip in the ordinary case. Every refusal is rendered with `ApiError.fullMessage`,
because the backend's `reason` is the half that says what to do next.

There is no `notes` field on a payment: the model carries only `ref`, the string
this row is reconciled against on a bank statement.

## Filing a bill: the amounts are not editable

`FileInvoiceForm` picks a delivery and asks for three things — the vendor's
invoice number, the date they issued it, and an optional note. `subtotal` and
`taxAmount` are **copied from the receipt and shown read-only**.

They must equal the receipt's to the minor unit or the API refuses the whole
request, because the payable is already on the books at the receipt's numbers and
a difference would be a price variance nothing posted. An editable box could do
exactly two things: hold the same figures, or cause a 400. A bill that genuinely
disagrees with the delivery is not something this form can express — the honest
fix is a purchase return, and the form says so.

The supplier is not picked either. It is whoever delivered the goods; billing one
vendor for another's delivery pays the wrong company and leaves the right one
still owed.

`?receipt=<id>` preselects, so `Catat faktur supplier` on a receipt's detail
lands here with the delivery already chosen. The param is read by the **server
page** and passed as a prop, matching the returns flow — which spares the client
component the Suspense boundary `useSearchParams` requires.

## No update, no delete, and no way to withdraw a payment

`/api/purchase-invoices` exposes five routes:

| Method | Path                                   | Purpose                        |
| ------ | -------------------------------------- | ------------------------------ |
| `GET`  | `/api/purchase-invoices`               | List, paginated and filterable |
| `GET`  | `/api/purchase-invoices/outstanding`   | Owed + overdue, per supplier   |
| `GET`  | `/api/purchase-invoices/:id`           | One bill, with its payments    |
| `POST` | `/api/purchase-invoices`               | File the vendor's bill         |
| `POST` | `/api/purchase-invoices/:id/payments`  | Pay (irreversible)             |

No `PATCH`, no `PUT`, no `DELETE`, no `/restore`, and no route that removes a
payment — so the frontend invents none. `purchaseInvoice.service.ts` has a test
asserting the absences, because a method for any of them would ship a button that
404s and, worse, imply a posted payment can be taken back.

`includeDeleted` is validated by the endpoint but never sent: nothing writes
`deletedAt`, so it cannot change a result.

### Correcting a wrong payment — read the caveat

The intended correction is reversing the payment's journal entry. Each row in
`PaymentHistory` shows its `journalEntryId` for that reason. It is **displayed,
not linked**, because the accounting screens still run on mock data and a link
from a real payment to a fabricated entry would be worse than no link.

**Reversing the entry corrects the books, not this document.** Nothing on the
backend restores `paidAmount` or `status`, so an invoice whose payment was
reversed still reads as paid here. The footnote says exactly that rather than
offering a "batalkan pembayaran" action that would not do what its label claims.
Closing that loop needs a backend change this feature did not make — see the
changelog.

## The supplier detail lists the goods on consignment, not just how many

It used to report `productCount: 3` and stop. That is not a number a vendor can act on:
they phone to ask **which** of their items to collect, restock or write off, and three
answers none of it. PCR-015 asked for the list and only the total had been built.

`ConsignmentProductsTable` is **shared with the reports feature** — the supplier detail
passes a `supplierId`, the consignment report renders the same table with a Supplier column
and no filter. It lives here because consigned stock is a vendor relationship; reports
borrows it. A table per screen would be two ideas of "still on the shelf" that disagree the
first time either changes.

> **These figures are still not a debt.** Consigned goods belong to the supplier until they
> sell, so nothing here is owed — it is the other half of a vendor's position, not more of
> the same half. The list makes the amount more concrete, which makes it easier to add to
> the payables by mistake.

A null nearest-expiry renders as an em dash. For dry goods that is the ordinary case, and
"does not expire" versus "expires today" are opposite conversations to have with a vendor.

## Files

**Services** — `purchaseInvoice.service.ts` (5 methods),
`goodsReceipt.service.ts` (`invoiced` passthrough).

**Hooks** — `usePurchaseInvoices` (list + filters + pagination),
`usePurchaseInvoice` (detail, `notFound` as its own state, `applyInvoice`),
`useUninvoicedReceipts` (the picker), `usePayablesPanels` (the hub's two lists).

**Components** — `PayablesScreen`, `PayablesToolbar`, `PayablesTable`,
`InvoiceStatusBadge`, `InvoiceDetail`, `RecordPaymentForm`, `PaymentHistory`,
`FileInvoiceForm`, and the payables half of `PurchasingHub`.

**Types** — `types/api.ts`: `PurchaseInvoiceListRow`, `PurchaseInvoiceDetail`,
`PurchaseInvoicePayment`, `PurchaseInvoiceListQuery`,
`CreatePurchaseInvoiceInput`, `RecordPaymentInput`, `InvoiceStatus`,
`PaymentMethod`, plus the overdue fields on `SupplierOutstandingSummary`.

`features/purchasing/payables.ts` was **deleted**. Its `isOverdue`,
`isDueWithin` and `outstandingTotal` helpers existed to derive in the browser
what the API now sends; keeping them would have been keeping a second definition
of "overdue" around to drift.

**Tests** — `PayablesScreens.test.tsx`, `purchaseInvoice.service.test.ts`.

## The hub's two panels

`PurchasingHub` shows what is late and what falls due in the next 7 days. The
overdue panel's count and total come from `/outstanding` — exact over the whole
book, however many invoices there are.

The due-soon panel is the one place with a caveat. `dueBefore` bounds only the
**far** end of the window and there is no bound for the near end, so "unsettled
and due before the horizon" necessarily includes everything already late. The two
panels are read side by side and their totals added up, so `usePayablesPanels`
removes the overdue ones — which means an exact rupiah total is only possible
when the fetch (50 rows) returned the complete bucket. It nearly always does. When
it does not, the total is `null` and the panel shows **how many** rather than how
much: a figure summed from part of a set is precisely what the rest of this module
avoids.
