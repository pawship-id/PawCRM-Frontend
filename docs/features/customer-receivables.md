# Faktur Penjualan (customer invoices / receivables)

Sales invoices and what is still owed on them, at **`/dashboard/sales`**.
Branch: `feature/sales-invoice`.

Two screens: the list, and one invoice with its payment form. Both run against
`/api/customer-invoices`. This is Sprint 1 of the Sales & Invoice module
(PCR-032 + PCR-033); `/dashboard/sales` was a `SectionPlaceholder` before it.

## Read this first: where these come from

**Two places.** The till raises one on **every** sale it settles, inside the
sale's own transaction, never passing through a form — see the next section, and
note that this is wider than it was: it used to be only a sale settled with the
Piutang method. Everything else is raised by hand through
`POST /api/customer-invoices` (PCR-030), which cuts stock, posts two journal
entries and allocates a number.

*(This section used to say nobody could create one at all, and that the "Buat
faktur" button did not exist. Both were true when it was written and stopped
being so when PCR-030 landed.)*

`source` tells the two apart and is read-only everywhere:

| `source`     | Means                                             | Chip        |
| ------------ | ------------------------------------------------- | ----------- |
| `pos_bridge` | Issued by the till — see below                    | dari kasir  |
| `manual`     | What PCR-030's form will write                    | manual      |

## A till invoice's detail reads like a hand-typed one

The document stores no lines and no breakdown for a till sale — two records of
one basket are free to disagree, and the one a cashier can still void is not the
one the invoice would be holding. **The detail read joins them from the sale**,
under the invoice's own field names, so `InvoiceItemsTable` renders both kinds
without knowing which it has. (The list read carries lines for neither.)

Three things come back beside the joined pair, and each is separate for a reason:

| | What | Why not folded in |
| --- | --- | --- |
| `otherCharges[]` | ongkir, packaging | The invoice shape has no field for them, and dropping them leaves a total the rows above do not add up to. **Itemised** — "biaya lain Rp 25.000" explains nothing to the customer who paid it |
| `posSettlement` | how the counter settled it | Rendered in its own **"Pembayaran di kasir"** card, read-only |
| `items[].dpp` / `.tax` | null on every till line | The tax allocation is decided across every line at once, so `Σ round(part) ≠ round(Σ)` and one line cannot reproduce its own share. The table shows nothing rather than a number it made up |

**Why the settlement is not in "Riwayat pembayaran".** That list means "money
collected against this debt, each with its own reversible journal entry", and
every row carries a Batalkan button. A till sale's settlement was posted inside
the sale's SINGLE revenue entry — there is nothing per-line to reverse, and such
a row would also make the sale unvoidable. The card says where the money can
actually be undone: Void or Retur at the till.

The collection history is **hidden entirely on a settled cash sale** ("Belum ada
pembayaran untuk faktur ini" under a card that has just shown the money arriving
is a contradiction) and **kept on a credit one**, where instalments against the
remainder are what it is for.

**Two rows in the recap only a till sale has.** The charges above, and — on a
sale part-paid at the counter — the split: *Total belanja*, *Dibayar di kasir*,
*Sisa jadi piutang*. The invoice's own total is that last figure, so without the
split the table would contradict the header of the page by exactly what the
customer already handed over.

**One recap, not two.** The block that used to print a second breakdown under
the table is skipped for till invoices; it has no field for the charges or the
split, so it would disagree with the table above it.

## Every till sale lands here now, not only a credit one

The Owner's call, and its price was stated first: every retail sale burns an
invoice number and this list is now mostly rows nobody will ever chase. What it
buys is one list holding every sale the shop made.

**A till-born invoice is one of two documents**, and the difference decides what
every figure on it means:

| | Raised when | Total | Status | Jatuh tempo | Pelanggan |
| --- | --- | --- | --- | --- | --- |
| **Utang** | cashier chose **Piutang** | what went **on account**, not the whole sale | Belum bayar | from the term | **always** |
| **Kwitansi** | sale **paid in full** | the whole sale | Lunas | the invoice date | **may be none** |

The paid one owes nobody anything: it contributes zero to every outstanding
figure, never appears in an overdue list, and falls due the day it is raised —
an invented "+30 days" would put a settled sale in every jatuh-tempo report.

**Two nulls that mean opposite things**, told apart by the ID rather than by the
name:

- **no `customerId` at all** → a walk-in. Most cash sales: somebody bought a bag
  of feed and left. Rendered **"Pelanggan umum"**, because "Pelanggan terhapus"
  there accuses the shop of losing a record it never had;
- **an id whose name came back null** → a customer somebody deleted, and that
  debt still stands. Rendered "Pelanggan terhapus".

**Neither kind carries payment rows.** For the paid one the money was taken at
the counter, in settlement lines that live on the POS transaction and were posted
inside the sale's single revenue entry — so the payment timeline is empty and
`paidAmount` was set at creation. The backend's changelog says why inventing rows
there would break both the payment-void path and `posVoid`.

**What this sprint actually closed was a live hole, not a missing feature.** The
till has been able to sell on credit since UT-3 — the sale posts `Dr 1103`,
raises the receivable, stores it — and nothing could read that document or record
a rupiah against it. A shop giving credit at the counter had to track the
settlement on paper.

## Named for the document, not for its balance

The page is **Faktur Penjualan**, not "Piutang Pelanggan" — a deliberate call,
made on 27 Aug 2026 after the first build shipped with the narrower title.

Every row here is a receivable *today*, because the till is the only writer and a
credit sale is the only thing that produces one. But an invoice is a document that
is born unpaid and settles later — that is PRD principle 1, and it holds for
PCR-030's manual invoices too — so a page called "Piutang" would contradict its
own **Lunas** pill the moment a settled invoice appeared, and they will
accumulate.

Piutang did not disappear; it moved to where it is true:

| Where | What it says |
| ----- | ------------ |
| The default pill | **Belum lunas** — the lens the screen opens on |
| The headline figure | **Total piutang berjalan**, from `/outstanding` |
| The overdue banner | What is late, and by how much |

**The identifiers did not follow the copy.** `ReceivablesScreen`,
`ReceivablesTable`, `useCustomerInvoices` and this file keep their names —
ui-rules §12 splits the two deliberately, and the collection genuinely is
receivables-shaped even when a row in it is settled.

## What is NOT in this table

**Cash sales.** `posPayment.service.js` reads
`const invoice = credit ? createFromSale(...) : null` — a receivable is raised
only for the part of a sale that walked out unpaid. A sale settled in full at the
till never becomes an invoice; it stays a `posTransactions` row and a struk.

| Sale | Invoice? | Lives in |
| ---- | -------- | -------- |
| Till, paid in full (any channel) | no | `posTransactions` |
| Till, method **Piutang** | yes, automatically | here |
| Till, part paid + part Piutang | yes, for the unpaid part only | here |
| Raised by hand (PCR-030) | yes — not built yet | here |

So this is **not a sales list**, and the shop's omzet is not in it. That is a
different question, and it belongs to reporting.

## Routes and permissions

| Route                    | Guard                     |
| ------------------------ | ------------------------- |
| `/dashboard/sales`       | `customerInvoices:read`   |
| `/dashboard/sales/[id]`  | `customerInvoices:read`   |

The nav entry is gated on `customerInvoices:read` too — it was ungated before,
because until now there was nothing behind the link to protect.

**`pay` is a separate action from `read`,** and the detail screen makes the split
visible: a role holding only `read` sees the whole invoice, its history and its
balance, and where the payment form would be it gets a line naming the grant it
is missing. That is the backend's own separation of duties — looking at what a
customer owes is counter work, recording that the money arrived credits `1103` on
an entry nobody can take back — surfaced rather than discovered through a 403.

## Nothing is recomputed in the browser

Three figures on these screens are the server's, and re-deriving any of them is
how a table ends up disagreeing with the banner above it:

| Figure               | Where it comes from                                     |
| -------------------- | ------------------------------------------------------- |
| `outstandingAmount`  | `total - paidAmount`, in exact minor units, server-side  |
| `isOverdue`          | `status ∉ {paid, void} && dueDate < now`, one `now` per page |
| The headline totals  | `GET /customer-invoices/outstanding` — the whole book    |

`isOverdue` is the one worth spelling out: `dueDate` keeps its value after
payment, so a calendar-only test in the browser would flag **every invoice ever
paid late** as still outstanding. The server folds the status in. `daysUntil` is
still used locally, but only to say *how* late — never *whether*.

The headline totals cover everything unsettled, not the twenty rows on screen. A
client summing its own page would show a figure that grows as the user pages,
which is worse than showing nothing because it looks authoritative.

## Three stat cards, and they read as one sentence

**Total piutang · Lewat jatuh tempo · Tertagih <bulan>** — owed, late, collected,
in the order the questions are asked. PCR-033's own list.

- **Always visible, including at zero.** Unlike the two notices below them, which
  appear only when there is something to act on. A card that vanishes at zero
  teaches people its absence means "not loaded".
- **Null renders as an em dash, not "Rp 0".** Null means the summary read failed;
  zero means nobody owes anything. On a screen whose point is trustworthy figures,
  a confident wrong answer is the worst outcome.
- **The tone colours the numeral, never the card.** A red panel in a row of three
  turns a dashboard into an alarm; a red numeral says the same without shouting.
  `danger` only when there IS overdue money — zero overdue is good news.
- **The month caption comes from the server's range.** The month was cut in the
  TENANT's timezone; deriving it from the browser would caption one month over a
  figure computed for another, for a few hours either side of every boundary.

**The overdue figure appears twice** — on the card and, when there is any, in the
red banner. That is the sheet's AC and it is not redundant in use: the card always
carries the number, the banner appears only when there is something to do and says
what.

## Sorting is by what was BILLED

`Tagihan terbesar` / `Tagihan terkecil` order by `total`, which is stored. The
**outstanding** amount is `total - paidAmount`, derived per row, and no index
reaches it — so there is deliberately no "Sisa terbesar", which would be a control
that quietly sorted by a different number than the one it named.

## The filters go over the wire

The pill row is a **lens**, and each value maps onto the API's own AR
definitions:

| Pill          | Sends                    |
| ------------- | ------------------------ |
| Jatuh tempo   | `overdue=true`           |
| Minggu ini    | `dueSoon=true`           |
| Belum lunas   | `outstanding=true`       |
| DP sebagian   | `status=partial`         |
| Lunas         | `status=paid`            |
| Void          | `status=void`            |
| Semua         | *(nothing)*              |

`outstanding` is `status ∈ {unpaid, partial}` — it **excludes `void`** as well as
`paid`, which is the one place the AR vocabulary departs from the AP one. A
supplier's bill is never voided; a sale can be, and the debt it raised goes with
it. Counting a voided invoice as collectable would put money on this screen
nobody may chase.

`dueSoon` could not be assembled client-side at all: its window has a **near** end
as well as a far one ("due this week and not already late"), so the browser would
be dropping rows out of a page the server had already counted. The window is the
server's `horizonDays`, echoed back and used to caption the note.

**The default view is `outstanding`, ordered `dueSoonest`** — and that ordering is
deliberately not the payables screen's `newest`. A payables list is read to decide
what to pay, which is a question about the bills in hand; this one is read to
decide **who to chase**, which is a question about who has been waiting longest.

### Search does not match the customer's name

`search` covers `invoiceNumber` and `notes` only. The customer lives in another
collection, and matching it would mean a join on every keystroke — so the
placeholder names exactly what it searches, and the **Pelanggan** picker in the
filter panel carries the other half. A placeholder promising a field the server
does not match is a bug report waiting to be filed.

## Refusals are toasts, and the lock releases in both outcomes

**Both are departures from what shipped first, made after UI verification.**

**Toasts, not an inline `<Alert>`** — a deliberate departure from
[ui-rules §9](../ui-rules.md), which reserves toasts for "it worked" and gives
form-level errors an alert that stays on screen. Asked for, and implemented with
one mitigation for the cost it carries: a toast auto-dismisses, so a refusal the
user has to ACT on gets **8 seconds** instead of the default 3. The local checks
("jumlah harus lebih dari nol") keep the default — the user knows what they just
typed. `swalToast` gained an optional `timer` for this; every existing call site
is unchanged.

**The submit lock releases on success too.** It used to release only on failure,
on the reasoning that a successful payment unmounts the form — which holds only
when the invoice becomes **settled**. After a partial payment the parent renders
the same element in the same position, React keeps the component's state, and the
button stayed disabled with a spinner until the page was reloaded. After every
instalment.

`purchasing/RecordPaymentForm` was written first and had the identical defect;
it is fixed too, since it is the same one-line bug on another form that moves
money.

## Recording a payment

One form for **DP, cicilan and pelunasan** — that is PCR-032's whole user story,
and it is why there is no second control anywhere for "settle in full". The status
is derived from what has been paid, so `Lunasi` is a shortcut that fills the
amount box, not a different request.

Three things the form is careful about:

1. **The submit is locked for the whole flight.** `POST /:id/payments` has no
   idempotency key, so a double-click books the money arriving twice on two
   irreversible journal entries. The lock is released only on failure.
2. **The channel list asks for `usableFor: "in"`** — one letter away from the
   payables form's `"out"`, and the whole difference. A drawer a shop only ever
   pays out of is the wrong place to book a customer's transfer, and the server
   refuses it. The list is re-read whenever the method changes, so it can only
   offer something the server accepts.
3. **The client-side bound is a courtesy, not the authority.** The server refuses
   an overpayment against the balance *it* can see, which is the only one that
   counts under concurrency: two clerks recording at once both pass the local
   check and one loses a compare-and-swap, coming back as a `409` shown verbatim.

`at` is the day the money **moved**, not the day the row was typed — a transfer
received on the 31st and recorded on the 2nd is the previous month's cash inflow,
and the journal entry is dated from that field.

**Recording a payment does not refetch.** `recordPayment` answers with the updated
invoice, so the response is handed straight to `applyInvoice`: it is the exact
document the write produced rather than whatever a second read happens to see,
and it costs one round trip instead of two.

## Cancelling a payment

A wrong payment is **cancelled**, not deleted or edited. `Batalkan` on the row
opens a dialog asking for a reason, and the write:

- posts a **reversing journal entry** against the one the payment made;
- marks the row `voidedAt` with who, why, and the reversal's id;
- takes the amount back off `paidAmount`, which can move an invoice from `paid`
  to `partial` or `unpaid`.

**The row stays on the timeline**, struck through, with its reason and the
reversal's journal id. It is not hidden: the entry it posted is immutable, and a
timeline that quietly dropped the row would leave that entry pointing at nothing
a reader can find. `isVoided` is the server's own flag — the same definition
`paidAmount` was computed against — so the screen never decides what "active"
means for itself.

The dialog says all of this **before** the click, not after. A user who expects a
row to disappear and finds it still there assumes the click failed and does it
again.

**Gated on `customerInvoices:void`, not `pay`.** A role that may take money in
sees the timeline and the kwitansi button, and no `Batalkan` at all.

**There is no edit.** Correcting an amount is cancel-then-record-again — two
events that really happened, and the only version that does not restate cash
already reported.

## The kwitansi prints ONE payment

`Kwitansi` on a row opens a preview and prints A4. It is proof that *this money*
was received on *this day* — the invoice's totals appear only as context for what
is still owed. Printing the invoice instead would hand a customer who paid a
third of a bill a document whose headline number is the whole of it.

Two details worth knowing:

- **The shop header comes from `useTenant()`,** not from a backend receipt
  endpoint. The POS has one because a struk needs the cart, the cashier and a
  public token; a kwitansi needs a name, an address and a payment the caller
  already holds.
- **A cancelled payment still prints, marked.** Somebody re-printing one is
  usually doing so precisely because it was cancelled.

Printing reuses `features/pos/print/receipt.css` and its portal-to-`body`
arrangement — that stylesheet carries the two ways printing from inside a dialog
went wrong before it.

## The ledger reference is a number, and a link

Each payment names its journal entry by **number** (`JE-2026-08-0412`), linked to
`/dashboard/keuangan/journal-entries/:id`. A cancelled payment names both: the
entry it made and the one that undid it.

It used to render the raw ObjectId — neither something a person could look up nor
something they could quote to whoever can, and not a link either. The number is
the **label**, the id is the **address**; the API sends both because the ledger's
route is keyed by id.

**The link is gated, the label is not.** `journalEntries:read` is a separate
grant, and a link that lands on "Akses ditolak" promises somewhere to go. Without
it the number renders as plain text — still worth showing, because it is what
somebody quotes to a colleague who can open the ledger.

When the number cannot be resolved (an entry removed by a repair script) the id
comes back as the label. A poor label, but a blank space where a ledger reference
belongs is worse, and the link still works.

## No update, no delete, and no way to EDIT a payment

The service has five methods because the API has five endpoints. There is no
`PATCH`, no `DELETE` and no way to remove or edit a payment: every payment posts
an immutable journal entry, so changing an amount would restate cash already
reported and deleting a row would leave the ledger pointing at a document nobody
can look up. Cancelling (above) is the correction, and it obeys the same rule.

### Correcting a wrong payment — read the caveat

The correction is **reversing that payment's journal entry** in Keuangan, which is
why every row in the history shows its `journalEntryId`. But reversing corrects
the **books**, not this document: nothing on the backend restores `paidAmount` or
`status`, so an invoice whose payment was reversed still reads as paid here. The
footnote under the history says exactly that, and deliberately does not offer
"batalkan pembayaran" — which would be a lie about what the available action does.

## What the detail screen does not show

**Line items.** `customerinvoices` stores a total, not an `items[]` — the sale
that raised it has the lines. They arrive with PCR-030, when an invoice can be
raised by hand and has lines of its own to store. Until then the screen shows what
the document actually holds rather than joining a POS transaction to fake them.

## Files

| Path                                                     | What                              |
| -------------------------------------------------------- | --------------------------------- |
| `services/customerInvoice.service.ts`                     | The four API calls                |
| `features/sales/hooks/useCustomerInvoices.ts`             | List query state + the view lens  |
| `features/sales/hooks/useCustomerInvoice.ts`              | One invoice, with `notFound`      |
| `features/sales/hooks/useReceivableFilterOptions.ts`      | Customers + branches for the panel |
| `features/sales/components/ReceivablesScreen.tsx`         | List + headline figures           |
| `features/sales/components/ReceivablesToolbar.tsx`        | Pills + search + filter panel     |
| `features/sales/components/ReceivablesTable.tsx`          | The rows                          |
| `features/sales/components/InvoiceDetail.tsx`             | One invoice                       |
| `features/sales/components/RecordPaymentForm.tsx`         | The payment                       |
| `features/sales/components/PaymentHistory.tsx`            | What has arrived, active or not   |
| `features/sales/components/VoidPaymentDialog.tsx`         | Cancelling one                    |
| `features/sales/components/PaymentReceipt.tsx`            | The kwitansi sheet                |
| `features/sales/components/PaymentReceiptDialog.tsx`      | Preview + print                   |
| `features/sales/components/InvoiceStatusBadge.tsx`        | Status + source chips             |
| `tests/ReceivablesScreens.test.tsx`                       | 48 tests over both screens        |

`PageHeading` is imported from `@/features/purchasing` rather than copied — it is
on the migration list to be promoted to `@/components` (ui-rules §15), and a
second copy would be one more call site to migrate.
