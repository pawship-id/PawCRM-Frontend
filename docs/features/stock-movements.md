# Penyesuaian Stok & Transfer Stok

The two screens that **write** to the stock ledger, against `POST /api/stock-movements`.
Branch: `feature/inventory-purchasing`.

| Screen | Route | File |
|---|---|---|
| Stok awal & penyesuaian | `/dashboard/inventory/adjustments` | `StockAdjustmentForm.tsx` |
| Transfer stok antar gudang | `/dashboard/inventory/transfers` | `StockTransferForm.tsx` |

Both moved off the in-memory prototype store (`features/inventory/data/demoStore.ts`) onto
the real API. The UI is unchanged; what changed is that pressing Simpan now writes
something that survives a refresh.

## Why these two, together

They are the **entire write surface** the API offers a client. `POST /api/stock-movements`
takes an `operation` of `adjustment` or `transfer` and nothing else — a goods receipt, a POS
sale, a bundle consumption and an opname difference are all posted service-to-service by the
module that owns the document, because a client able to claim a receipt could conjure stock
that no purchase order accounts for.

So this pair completes the stock module's write side. There is no third form waiting.

## The difference between them

| | Penyesuaian | Transfer |
|---|---|---|
| Question | "the system is wrong, correct it" | "the goods moved" |
| Warehouses | one | two |
| Total stock | **changes** | **unchanged** — only the location |
| Quantity | may be negative | must be positive; direction comes from the two ids |
| Ledger rows | 1, or one per lot under FEFO | **≥ 2** — an out/in pair per lot |
| Journal | yes | **no** |
| Weighted average | may move | never |
| Batch fields | yes, on the way in | none — lots travel as they are |

The client sends an `operation`; the server decides the movement type, the reference, the
signs and how many rows come out. Neither form ever names a `movementType`.

## The sign lives in the toggle

The API takes a signed quantity — `"-3"` writes stock off. Asking a shop owner to type a
minus to record breakage is how you get `3` entered on a Monday morning, so
**Barang masuk (+) / Barang keluar (−)** owns the sign and the field only ever holds a
magnitude. The transfer form has no toggle at all: `-5` from A to B is a transfer in the
other direction written so every report reads backwards, so the API refuses it and the form
never offers it.

## The previews come from the server

`POST /api/stock-movements/preview` is the posting path with the commit left off, so the
FEFO split, the weighted average and the journal on the right of each form are the ones
that will actually be written.

**This used to be a file.** `features/inventory/utils/preview.ts` reimplemented three
server decisions — FEFO allocation and its short pick, the perpetual weighted average, and
the fact that an adjustment books its counter-value to `5201` and never `5101`. The copies
agreed with the server; the risk was entirely in the future, because a drifting preview
does not throw. It renders a confident wrong number that the user approves. The file is
deleted, along with `useJournalAccounts` and `chartOfAccounts.service.ts`, which existed
only to put names on the two account codes it hardcoded.

**`useMovementPreview` is debounced** (350 ms) — the trade for a live preview is a request
per keystroke, and typing "12" should be one. It keeps the previous answer on screen while
a new one is in flight, because clearing it makes the panel flicker between every keystroke
and its response, which reads as instability rather than as work.

**One payload, two uses.** Each form builds its request object once and passes it to both
the preview and the save. A preview of a *different* request is worse than no preview, and
that object is the only place the two could diverge — `StockMovementForms.test.tsx` asserts
they match, modulo the retry token the preview endpoint refuses.

The endpoint **refuses what the create refuses**, so an inactive warehouse or a missing
batch code surfaces while the user is still filling the form rather than after they press
save.

## Retrying a save is safe

Each form mints an `idempotencyKey` when it opens, **keeps it across a failed attempt**,
and replaces it only after a save succeeds. That is the whole semantics: a retry says
"this is the same intent as my last attempt", so an attempt that actually landed before the
connection dropped replays its original rows instead of moving the stock a second time.

It matters here more than anywhere else in the app: a manual adjustment has no upstream
document, so without the key the API cannot tell a retry from a user adjusting twice on
purpose — and stock is the one number where guessing wrong needs a physical count to undo.

## What is validated where

Only rules a user can fix **without a round trip** are checked locally: a missing quantity,
a non-decimal, a missing batch code on a product that tracks expiry, two identical
warehouses. Everything else — an inactive warehouse, a product that cannot hold stock, a
quantity the API reads differently — comes back as a 400 and is rendered verbatim via
`ApiError.fullMessage`, which carries the actionable half of the refusal
("Warehouse 'Gudang Bazar' is not active and cannot accept movement") that `message` alone
drops.

**Only active warehouses are offered**, unlike the stock card, which lists inactive ones
too. The card reads; these write, and the API refuses a movement at an inactive location —
offering one would produce a rejection after the form was filled in.

The transfer form refuses to render at all when the tenant has fewer than two active
warehouses, rather than showing two selects stuck on the same value above a permanently
disabled button.

## Files

```
services/
  stockMovement.service.ts     gained `create` and `preview`

features/inventory/
  hooks/useMovementPreview.ts  debounced POST /preview
  utils/idempotency.ts         newIdempotencyKey — one per intent, not per request
  components/StockAdjustmentForm.tsx
  components/StockTransferForm.tsx
```

Both forms reuse the stock card's read hooks — `useStockCardLookups` for the pickers and
`useProductStock` for the "stok saat ini / HPP" strip — and bump a local `refreshKey` after
a successful post, which re-reads those AND re-asks the preview: the same question has a
different answer once the lots and the average have moved.

Neither form loads lots any more. `useProductBatches` was needed to compute the FEFO split;
the preview now names every lot it would touch.

## Backend gaps

All three found here are closed — `PawCRM-Backend` 0.21.0, gaps 7–9 of
**`PawCRM-Backend/docs/stock-card-gaps.md`**.

| # | Gap | How it closed |
|---|---|---|
| 7 | No preview endpoint | `POST /stock-movements/preview` — `utils/preview.ts` deleted |
| 8 | Posting accounts not discoverable | The preview's `journal` carries resolved codes **and** names |
| 9 | No idempotency key | `idempotencyKey` on the create; the forms mint one per intent |

**One limitation carried over from gap 9**, and it is the server's rather than this
feature's: the API's replay check is a read followed by a write, so it makes a *retry* safe
and does not make two genuinely simultaneous requests safe. The form's disabled-while-saving
button covers the double click, which is the case a browser can actually produce.

## Tests

- `StockMovementForms.test.tsx` (15) — the sign the toggle sends, the preview panel
  rendering the server's answer, **the previewed payload matching the saved one**, the
  retry token surviving a failure and being replaced after a success, the toast reporting
  the server's row count, a rejection surfaced with its `reason`, active-only warehouses,
  and the two-warehouse guard.
- `stockLedger.service.test.ts` covers `create`'s payload and array-return, and that
  `preview` posts the same body without a retry token.
- `stockPreview.test.ts` is **deleted** along with the calculations it pinned. Its
  replacements live in the backend suite, next to the one implementation that remains.
