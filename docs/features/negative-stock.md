# Stok Minus

Every shelf that owes what it has already sold, at
`/dashboard/inventory/negative-stock`. Backed by `GET /products/negative-stock`.

---

## What this screen is about

The other stock screens describe the ROOM: how much is there, what is running out, what is
about to expire. This one describes **the books being wrong**. Goods left that the system
never recorded arriving, so the balance is below zero and every figure derived from it —
the stock value on a report included — is wrong along with it.

That is why the Inventory hub leads with it rather than filing it with the rest, and why
an empty answer here is framed as the **good** outcome ("catatan dan barang di rak sedang
cocok") rather than as "no data yet".

## Why a balance can be negative at all

`tenants.settings.allowNegativeStock`, **true by default**. The till sells an empty shelf
and the balance goes negative rather than the sale being refused, because the goods left
the room and the customer is holding them: a till that refused would produce books which
disagree with the room and a queue nobody can serve, and the cashier's workaround — ringing
it up as something else — hides the gap for good.

The usual cause is a delivery nobody has keyed in yet, not a theft. **The fix is a goods
receipt or an opname**, which is what the note above the table says, with the opname link
in it.

A shop that wants the till to be the control turns the setting off; the server then refuses
any sale that would take a shelf below zero, wherever it comes from. That does **not**
clear what is already negative — only a receipt or an opname moves those — so this screen
goes on listing them.

## One row is one product at one warehouse

A shortfall happens at a PLACE. The same product can be three short in one shop and
perfectly fine in the next, and "you are three short somewhere" is not something anybody
can act on.

That is deliberately **not** the grain of the restock list, and the difference is the
question each answers:

| | Grain | Inactive products | Ordering |
| --- | --- | --- | --- |
| Perlu restock | one row per **product**, summed across warehouses — `minStock` is a property of the product | excluded: a discontinued line is not something to reorder | furthest below its threshold first |
| Stok minus | one row per **(product, warehouse)** | **included**, marked `nonaktif`: one sitting at −3 is exactly the row somebody has to explain | worst first **by value** |

## The money keeps its sign

`value` is `qty × hppAvg` and is negative on screen. It is cost the shop has already
expensed for goods it does not hold — a magnitude somebody has to remember to read as a
debt is how a report gets misread.

**`hppAvg` is unchanged by the oversell.** Goods leave AT the average, so an outbound
movement cannot move it; the shelf still carries what the shop last paid. The column shows
two decimals because the next receipt weights the negative balance against exactly that
figure — see the costing note in the backend's `docs/api.md`.

The total above the table is the **whole hole** across every row in reach, not the page's
worth of it: a figure that added up the twenty rows on screen would read as the answer
while being a fraction of it. It is hidden entirely on a clean shop, because a standing
"Rp 0" is a number that teaches people to ignore the row it sits on.

## One filter, on the bar

Gudang, applying on click. ui-rules §8 sets the floor plainly: a single field behind a
`Filter (1)` button is a button that hides one thing, which is worse than showing it — the
same call Transfer Stok makes.

**Inactive warehouses stay in the list.** This is a read, and a location closed last month
can still hold a balance below zero; hiding it would hide the row somebody has to clear.

**There is no search and no sort control.** The API narrows by warehouse and nothing else,
so a search box would either lie (filtering one page of twenty in the browser) or need a
server field nobody has asked for. The order is fixed at worst-first by value — the −200
sacks of feed matter and the −1 collar does not — and offering "by name" would be offering
a way to push the expensive rows below the fold.

## Where it is reached from

**Not the sidebar.** A healthy shop has nothing here, and a permanent nav row for a screen
that is usually empty is a row people learn to skip. The hub's card appears exactly when
there is something to see — or whenever the shop allows overselling, so the place is
discoverable before the day it matters — and "Lihat semua stok minus" is the way in.

## Files

```
app/(dashboard)/dashboard/inventory/negative-stock/page.tsx
features/inventory/components/NegativeStockScreen.tsx
features/inventory/hooks/useNegativeStock.ts     GET /products/negative-stock, limit 20
```

The hub's five-row version is a separate hook, `useNegativeStockAlert` — same endpoint,
`limit: 5`, and no filter. "Is anything wrong" and "what, exactly" are two questions.

## Tests

`NegativeStockScreen.test.tsx` (17) — the row naming both the product and the shelf, the
sign on the money, the average to the sen, the `nonaktif` chip, a row whose warehouse has
gone missing, the server's total rather than the page's, the total hidden on a clean shop,
the explanation and its opname link, the filter reaching the server and resetting the page,
`warehouseId` left off the wire when unset, an inactive warehouse offered and marked, the
warehouse lookup failing softly, paging, and the retry after a failed read.
