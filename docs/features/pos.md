# POS — the till

Where a petshop takes money. FR-1 through FR-11 of the POS PRD, Fases 6–8 of the plan.

Route: `/dashboard/pos` (labelled **Kasir** — ui-rules §12 lists "POS" among the words the
product does not use; the route, the types and the permission features keep the identifier).

Backend: `PawCRM-Backend/src/services/pos*.service.js` and `/api/pos`.

---

## Three gates, in order

The till refuses to be useful until three questions are answered, and the ORDER is the
design rather than an accident.

| | Gate | Why it comes first |
| --- | --- | --- |
| 1 | **Branch** — `PosBranchGate` | `posShifts.branchId` is the sole authority for which shop a sale is booked to (decision K5). A user who reaches every branch signs in pointed at none, so this is the ordinary first screen for an owner |
| 2 | **Shift** — `PosShiftGate` | A sale with no shift has no drawer to be counted against, so the Z-Report would be short by exactly the transactions nobody attached to anything |
| 3 | **Warehouse**, inside the shift gate | Which shelves the day's sales come off. Filtered to the chosen branch — a shift pairing Cabang A with Cabang B's warehouse books revenue to A while deducting stock from B, and nothing looks wrong until somebody counts a shelf |

Each is a GATE, not a banner. A catalogue rendered behind a warning would let a cashier
build a basket that cannot be paid for and discover it with a customer waiting.

**The branch switch is session-wide**, which is why it lives in `AuthContext` and not in this
feature: the branch decides where a sale, a shift and its journal entry are booked, and a
branch that meant something different on each screen would be a bookkeeping error nobody
could see.

---

## The screen

`PosScreen` composes everything. Left is what you can sell, right is what you have sold —
the layout every till in the reference set uses and the one a cashier already knows.

```
PosScreen
├── PosBranchGate            no branch chosen yet
├── PosShiftGate             no shift open
└── the till
    ├── PosShiftBar          navy status strip, always visible while open (FR-9)
    ├── PosCatalog           search · PosCategoryPills · PosProductCard grid · pager
    │   └── PosVariantDialog a parent is not sellable — pick a variant
    ├── PosCart              PosCartLine · PosDiscountPopover · PosOtherChargesEditor
    └── dialogs
        ├── PosHeldCartsDialog     parked baskets (FR-6)
        ├── PosApprovalDialog      a discount past the cashier's limit (FR-4)
        ├── PosPaymentDialog       PaymentChannelPicker · PaymentLinesList (FR-7)
        ├── ReceiptDialog          ReceiptPreview, 58/80 mm and A4 (FR-8)
        ├── TodayTransactionsDialog  where a void or a return starts (FR-11)
        ├── VoidTransactionDialog
        ├── ReturnDialog           ReturnItemsPicker
        ├── PosXReportDialog       read-only and repeatable (FR-9)
        └── PosCloseShiftDialog    the Z-Report
```

---

## The server is the only pricer

**Nothing in this feature multiplies a quantity by a price.** Every mutation sends the WHOLE
basket and renders what comes back.

The reason is the discounts: a cart discount is measured against the post-item-discount
subtotal, so changing one line changes what every other figure means. A till that computed
its own subtotal would eventually disagree with the receipt, and the disagreement would reach
a customer before it reached us.

Concretely:

- `runningTotals` comes from the server on every cart response, derived by the same routine
  that gives a discount its basis. `PosCart` reads it.
- `lineTotal` is stored on each line rather than recomputed — `qty × unitPrice` in JavaScript
  numbers rounds differently from the server's minor-unit arithmetic on a fractional quantity
  or a 7,5% discount.
- The Retur form shows **no refund figure at all**. What comes back is what was paid, net of
  the basket discount's share, and displaying it would mean implementing that arithmetic
  twice.

**Money crosses the wire as strings, in both directions.** `JSON.parse("199999.99")` is
already not 199999.99 before any code of ours runs, and every figure here is either invoiced
or reconciled against a drawer.

---

## Two rules that look alike and are not

`PosPaymentDialog` carries `TYPED_RUPIAH` and `serverRupiah`, and conflating them was a real
bug: the dialog offered a bill of **Rp 0**.

| | Reads | Rule |
| --- | --- | --- |
| `TYPED_RUPIAH` | what a cashier types | Digits only. "300.000" is three hundred thousand to an Indonesian and 300 to `Number()`, so a till that accepted it would take a thousandth of the bill |
| `serverRupiah` | what the server sent | Four decimal places — `"300000.0000"`. Reading it with the typed-input rule matched nothing |

One guards what a person may type; the other reads a format we control.

---

## Payment (FR-7)

**The remainder is the whole screen.** Largest thing on it, updates on every keystroke, and
Selesaikan is disabled until it is exactly zero — not "at least".

| Rule | Why |
| --- | --- |
| Underpaid blocks | A debt nobody recorded |
| Overpaid on non-cash blocks | The bank has the money; handing over notes empties the till against a receipt saying otherwise |
| Cash absorbs the excess as **change** | The remainder still reads zero and the drawer still balances |
| Change is **computed, never typed** | A second field to get wrong is a drawer that disagrees with the receipt |
| A reference is required where the channel says so | An unmatchable QRIS line is indistinguishable from one that never arrived |

The channel picker is **two rows** — a type pill row, then the specific channels within it.
A shop with three bank accounts and two QRIS providers has more channels than fit on a row,
and flattening them would put "BCA 1234" beside "Tunai" as if they were the same decision.

It is a **pill row, not a tablist**, despite the PRD calling them tabs. Tab semantics need
tabpanels; a screen reader would announce a tab and find nothing it controls.

---

## The receipt (FR-8)

Assembled on the SERVER, which is what makes a reprint mean anything. The two halves age
differently, deliberately:

- **The header** reads `branches` as it is TODAY. A shop that has moved wants its new address
  on the reprint a customer walks back in with.
- **`totals`** is read back frozen. The tenant's tax rate may have changed, and recomputing
  would silently rewrite what the customer was charged.

A branch field the shop never filled in prints as an **absent line**, never `undefined` —
that on a thermal print is how a shop finds out its own data is thin, in front of a customer.

**One stylesheet, three widths**, chosen by `data-receipt-sheet`. The three differ in a
width, a font size and a padding; three files would drift the moment somebody fixed a margin
in one. What is on screen is what prints — there is no separate print template, so a receipt
cannot look right in the preview and wrong on the roll.

**The WhatsApp button copies, it does not send.** Sending a message to a customer's phone
from a till is something they agreed to with the shop, not with us. A blocked clipboard —
permission denied, or an insecure origin with no API at all — falls back to selectable text
rather than failing silently.

---

## Undoing a sale (FR-11)

Two different acts, and keeping them apart is the point.

| | Void | Retur |
| --- | --- | --- |
| Says | this sale should not have happened | the customer changed their mind afterwards |
| Scope | all or nothing | partial, line by line |
| Time | only while the sale's shift is **open** | crosses shifts and days freely |
| Stock | the sale's own movements mirrored, lot for lot | only the lines going back on the shelf |
| Ledger | both entries reversed | its own entry, debiting `4192 Retur Penjualan` |
| Grant | `posTransactions:void` | `posTransactions:refund` |

Both start from **Transaksi hari ini** on the shift bar — which is also how a cashier
reprints a receipt somebody lost, the most common reason to open it.

**The shift rule is not checked in the browser.** The server refuses a void once the sale's
shift is closed and names Retur as the alternative; that refusal is surfaced as written.
Guessing at it here would mean two rules to keep in step, and the browser's copy is the one
that drifts.

**`returnToStock` is per line.** One carrier bag holds an unopened sack and a chewed toy. A
service gets no checkbox at all — a grooming that already happened is not on a shelf, and the
server forces the flag to false whatever is sent.

**A return starts every line at zero.** Starting at the full quantity would make "return
everything" the one-tap answer and "return one of three" the careful one, which is backwards.

**What is returnable comes from the server** (`GET /pos/transactions/:id/returnable`), which
calls the same rule the write enforces. The form can only ever offer what would be accepted.

**A cash refund empties the drawer open right now**, not the one that made the sale. Both the
X-Report and the Z-Report net it out of `expectedCash` and show it on its own line — a netted
figure with no explanation is one nobody trusts, and this is the shape of variance that looks
like theft and is not.

---

## Closing (FR-9)

The cashier **counts first, then sees the variance**. The expected figure is hidden until a
count is typed, and that ordering is the entire control: shown up front, it is a number to
make the drawer agree with, and the count stops being independent evidence of anything.

**A large variance does not block closing.** A shop cannot stop trading tomorrow because
money went missing today, and a system that refused would be worked around by counting the
drawer to match. It asks for a note instead.

---

## Permissions

| Feature · action | Staff | Manager |
| --- | --- | --- |
| `posShifts:open` · `read` | ✅ | ✅ |
| `posShifts:close` | ❌ | ✅ |
| `posTransactions:create` · `read` | ✅ | ✅ |
| `posTransactions:discountOverride` | ❌ | ✅ |
| `posTransactions:void` · `refund` | ❌ | ✅ |

Each withholding is FR-4 or FR-9 written as a permission: a cashier does not sign off their
own drawer count, does not approve their own over-limit discount, and does not reverse money
already taken. The **Manager** holds `discountOverride` deliberately — if only the Owner did,
every 15% discount in every branch would wait on one person's phone, and the rule would be
worked around rather than followed.

**The nav item is gated on `posTransactions:read`**, not `create`: somebody who may look at
the day's sales but not ring one up should still reach the screen, where the Buka Kasir form
is what they will not be offered.

---

## Adding a movement type is a three-file change

`pos_void` shipped to the backend and crashed the **stock card** — `MovementBadge`
destructured `undefined` the moment a voided sale appeared on one.

`tsc` could not catch it. The frontend mirrors the backend's enum by hand, and the union was
missing the value too — so the label `Record` was complete *for the union it knew about*, and
the gap existed only between the two codebases.

What has to be visited, and only the first two are checked by the compiler:

| File | Checked by `tsc`? |
| --- | --- |
| `types/inventory.ts` — the `MovementType` / `ReferenceType` union | — it is the source |
| `MovementBadge.tsx`, `StockLedgerTable.tsx` — `Record<…, …>` maps | ✅ adding to the union breaks them until filled in |
| `StockCardFilters.tsx` — the filter options **array** | ❌ a forgotten type produces rows no filter can select |

`StockCardScreen.test.tsx` now renders every member of the union, so a badge that would throw
fails a test instead of a stock card.

---

## Not built

- **Piutang.** FR-7's credit tab and its 30-day terms. Every sale must be settled in full at
  the till. FR-11's rule that a credit sale's refund credits `1103` is unreachable until this
  exists.
- **Store credit** as a refund method. It is in the API's enum because the PRD asks for it,
  and the server refuses it: a customer has no balance to hold it, and writing the return
  anyway would take the goods back and give nothing in exchange.
- **PDF download.** Printing through the browser dialog works, and save-as-PDF lives there.
- **A PIN.** FR-4 describes an Admin/Owner PIN; this system has sessions and roles and no PIN
  store, and inventing one would be a second credential nobody rotates. What the rule is
  *for* — a second authorised person agreed — is what is checked, via
  `posTransactions:discountOverride`, and the approver's id is recorded either way.
