# Inventory Hub

The module's landing screen, at `/dashboard/inventory`. Two alert lists and a card per
screen — nothing else.

Backed by `GET /products/low-stock` and `GET /product-batches/expiring`. It was a prototype
over the in-memory `demoStore` until this change; it is the last inventory screen to leave
it.

---

## The two questions

A shop owner opening this page is asking one of exactly two things — **what do I need to
reorder** and **what is about to go bad** — and both are answers you act on the same day.
Everything else (stock value, movement history, the full lot list) is a click away on the
stock card and the batch report, where there is room to read it properly.

The lists are therefore **chosen, not exhaustive**: five rows each, most urgent first.

## Both lists are the server's answer

The prototype computed both in the browser, and each was wrong in a way nobody would have
noticed:

| List           | What the prototype did                                                      | Why it was wrong                                                                                                     |
| -------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Perlu restock  | compared **one warehouse's** shelf against `minStock`, once per warehouse    | `minStock` is a per-**product** threshold. A product stored in three warehouses appeared three times and read as low whenever it was merely kept elsewhere |
| Kedaluwarsa    | scanned the lots it happened to hold                                        | it could only ever see its own fixtures, so the count was the count of the fixtures                                    |

`GET /products/low-stock` sums a product's stock **across** warehouses, which is what the
threshold means, and excludes inactive products and any with `minStock: 0` — a threshold of
zero is how a tenant says "do not alert me", and without that rule the list would contain
every product nobody has started stocking yet.

## The badge is the total, not the row count

Each section shows five rows and badges `pagination.total`. A list of five out of forty
badged "5" tells somebody the job is nearly done. Where the total exceeds what is shown,
the remainder is stated in as many words (`+35 produk lain juga di bawah batas minimum`)
rather than silently dropped.

While a request is in flight the badge reads `…`, never `0`. A tile that says "0 perlu
restock" and changes its mind a second later has already told somebody there was nothing to
do — the same rule the batch report's tiles follow.

## A section the role cannot read is not requested

`perlu restock` needs `products:read`; the expiry list needs `productBatches:read`. Each is
gated on its own grant and, when the grant is missing, **the request is never issued** — a
landing page that opens on a red 403 for a section the user was never meant to see is worse
than one that quietly does not offer it.

The action cards are gated the same way and with the same requirements the sidebar uses, so
the hub and the menu can never disagree about what a role may open. `Penyesuaian cepat` is
the one to note: it is gated on `stockMovements:**create**`, so the seeded Staff role
(read-only on the ledger) never sees the shortcut that writes off stock with no document
behind it.

## What this screen deliberately does not do

- **Filter by warehouse.** `minStock` is a product-level threshold; a per-warehouse restock
  list would be answering a question the data cannot support. The batch report has a
  warehouse filter because a lot genuinely sits in one.
- **Sort or paginate.** Both orders are the server's — most urgent first — and a landing
  page that could be paged would be a report.
- **Join the catalogue.** `productName`, `productSku` and `warehouseName` arrive resolved on
  the lot rows.

## The two alerts also live on the dashboard now

PCR-013 and PCR-018 put the restock badge and the expiry card on the **dashboard**
specifically — the screen somebody opens first every morning, one click out from here.

`useLowStockAlert` and `useExpiringAlert` are therefore exported from
`features/inventory` and consumed by `DashboardOverview` as well. A second copy of "what
counts as low" is exactly the drift the barrel exists to prevent. Both take an `enabled`
flag, so each caller's permission check decides whether the request is made at all rather
than making one that 403s.

The hub keeps its versions: they list the five most urgent rows, where the dashboard shows
only the count. "Is there anything to do today" and "what, exactly" are two questions, and
the hub is where the second one is answered.

## Files

```
features/inventory/hooks/
  useLowStockAlert.ts     GET /products/low-stock, limit 5
  useExpiringAlert.ts     GET /product-batches/expiring, limit 5, 30 days
features/inventory/components/InventoryHub.tsx
```

Both hooks take an `enabled` flag — that is the permission gate, and it is why a denied
section costs no request.

## Tests

`InventoryScreens.test.tsx` (7) — the badge being the server's total rather than the rows
on screen, the remainder line, the request shape (five rows, thirty days), the action cards
a role may open, a section that is not requested without its grant, and one list surviving
the other's failure.

## Note on `demoStore`

`features/inventory/data/demoStore.ts` is still here, and still real: the **purchasing**
prototype screens (suppliers, receipts, payables, returns) run on it, and eight components
import it. What left with this change is the last inventory consumer. It goes when
purchasing is wired.
