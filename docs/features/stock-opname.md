# Stock Opname

Physical stock counts, at `/dashboard/inventory/opname`. A sheet is opened as a draft,
counted against for as long as it takes, previewed, and submitted once — at which point
its differences become adjustment movements and one journal entry.

Backed by `/api/stock-opnames` (PawCRM-Backend 0.22.0, extended in 0.23.0). This screen
was a prototype over an in-memory store until that landed; the store's opname half is gone.

---

## The one rule that shapes everything

**System quantity is re-read at submit, not frozen when the sheet opened.**

A count takes an afternoon and the shop keeps selling while it runs. If the difference
were measured against the number captured this morning, every sale made during the count
would be booked a second time as shrinkage — and, worse, the system quantity would **still
not equal what is on the shelf** afterwards, which is the one thing an opname exists to fix.

The server therefore recomputes every line against live stock at submit. The consequence
for this screen is blunt: **the browser never subtracts anything.** `physicalQty` goes up;
`systemQty`, `diffQty`, `hppAtOpname`, `diffValue` and the sheet total come back computed.
A locally derived variance would drift from the posted one, silently.

## The three states of a line

| State | Looks like | Posts |
| ----- | ---------- | ----- |
| Belum dihitung | `physicalQty === systemQty`, `countedAt: null` | nothing |
| Dihitung, cocok | `physicalQty === systemQty`, `countedAt` set | nothing |
| Berselisih | `physicalQty !== systemQty` | one `opname_diff` movement |

The first two are **identical in the numbers**, and that is the problem `countedAt` solves.
A fresh line opens pre-filled with the system quantity — it has to, or an operator who
submitted after counting half the warehouse would write off everything they had not reached
— so nothing in the quantities distinguishes an unvisited shelf from a correct one. Without
the flag, "40 of 40 counted" and "12 of 40, the rest untouched" render the same, and
submitting the second believing it was the first certifies shelves nobody looked at.

**Typing a quantity marks the line counted.** The checkbox exists for the case the field
cannot express: a shelf that was walked and found exactly right, where the correct entry is
to change nothing.

## Auto-save

`PATCH /:id` on an 800 ms debounce, sending the **whole** `items` array. A patch-by-line
protocol would need a stable line id, an ordering rule and a conflict story for two tablets
counting one warehouse; replacing a bounded array in one atomic write needs none of them.

Two details in `useOpnameSheet` are load-bearing:

- **A stale response never lands on newer edits.** Each save captures a revision counter and
  discards its own result if the counter moved while it was in flight. Without it a slow
  save would overwrite the two lines typed after it — quantities silently reverting, on the
  one screen where nobody would notice until the submit.
- **`flush()` runs before submitting.** The debounce may still be holding the last thing
  typed, and submitting without it would post a count one line out of date.

The save indicator is explicit ("Menyimpan…" / "Tersimpan 14:22") because an auto-save
nobody can see is one nobody trusts — the alternative is a counter re-entering a whole
shelf because they were not sure it took.

## The preview is fetched, never computed

`POST /:id/preview` returns the movements FEFO will actually write and the journal lines
with their account codes and names resolved against the tenant's own chart.

The prototype hardcoded a surplus to **4901 Pendapatan Lain-lain**. The ledger books *both*
directions to the inventory-adjustment account, deliberately kept out of COGS so margin
stays readable. That copy never failed loudly — it rendered a confident wrong number that a
user then approved. The page copy said the same thing and has been corrected too.

## Lots for found stock

A **positive** difference is goods arriving as far as the ledger is concerned, so a product
with `hasExpiry` needs a batch code and expiry date on that line or the submit is refused.
The API sends `productHasExpiry` per line precisely so this screen can ask **while the
counter is at the shelf** rather than surfacing a 400 after they have walked away. A
**shortage** needs neither: FEFO decides which lots it comes out of.

The lot inputs appear inline on exactly the lines that need them, so the sheet stays a
column of quantities for the products that do not.

## Permissions

`stockOpnames: create | read | update | delete | submit`.

**`submit` is separate from `update`, and that is the point.** Counting the shelves is the
bulk of the work and is Staff work; accepting a shortage as a loss is not. The seeded Staff
role holds create/read/update and **not** submit or delete — someone other than the counter
signs off the variance, which is the ordinary internal control over a stock count. A
counter sees the sheet, fills it in, and is told plainly who finishes it.

The nav entry is gated on `stockOpnames:read`. It previously used
`stockMovements:create`, which hid the whole feature from exactly the people who do it.

## Files

```
services/stockOpname.service.ts          one method per endpoint
features/inventory/hooks/
  useOpnames.ts                          list + filters + paging
  useOpnameSheet.ts                      detail, debounced auto-save, flush
  useOpnamePreview.ts                    on-demand submit preview
features/inventory/components/
  OpnameScreen.tsx                       the list
  OpnameSheet.tsx                        the count sheet
  OpnameStartCard.tsx                    warehouse + optional category
  OpnameToolbar.tsx                      status / warehouse / dates / search
  OpnameStatusBadge.tsx
```

## What this screen deliberately does not do

- **Re-sort or re-page.** The order and the counts are the server's.
- **Join the warehouse name.** `GET /stock-opnames` resolves it per page.
- **Fetch the catalogue.** `productSku`, `productName`, `productUnit` and
  `productHasExpiry` arrive on the sheet.
- **Offer an un-submit or a restore.** Submitting posts immutable movements and a journal
  entry; a sheet that could go back to draft would claim to describe a count whose
  corrections had already been booked. A wrong count is corrected by taking another one.
