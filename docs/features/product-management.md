# Product & Variant Management (Inventory → Produk & Varian)

Frontend for the product catalogue — standalone items, variant families and
bundles — wired to `/api/products`. Branch: `feature/inventory-purchasing`.

Replaces the demo-store version of these two screens. The other inventory
screens (stock card, batches, opname, transfers) still read the demo store and
are untouched by this work.

## What it does

Under **Dashboard → Inventory → Produk & Varian** a permitted user can:

- **List** the catalogue — one row per family, paginated, with free-text search,
  type/category/warehouse filters on the bar, and status plus "show deleted"
  behind `Filter lain`.
- **Expand** a parent into its variants, fetched on demand.
- **Open** one product read-only — every stored field, its stock per warehouse,
  and, for a parent, the whole family with each variant's quantity.
- **Create** a product in one of three shapes, with optional opening stock.
- **Edit** a product, including adding variants to an existing family.
- **Delete / restore**, both guarded by the backend and reported verbatim.

### One row per family

A tenant with six sizes × two flavours has **twelve documents for one product**.
The list asks for `excludeVariants=true`, so the exclusion happens in the query
and `pagination.total` counts the rows the screen actually shows — filtering them
out client-side would leave a pager promising pages of ghosts.

Under that flag the API also **surfaces a parent when the search matches one of
its variants**, so searching "3kg" finds the product rather than nothing.

### The Stok column asks a different question per type

| Type         | Column shows                          | Field read           |
| ------------ | ------------------------------------- | -------------------- |
| `standalone` | what is on the shelf                  | `stockByWarehouse`   |
| `variant`    | what is on the shelf                  | `stockByWarehouse`   |
| `parent`     | its variants' total, per warehouse    | `variantStock`       |
| `bundle`     | how many can be **built**             | `bundleAvailability` |

All three are computed by the backend. The **warehouse selector is a view, not a
filter**: every product arrives carrying its quantities for every warehouse, so
switching location re-reads what is already on the page and issues no request.

### Row actions behind a kebab menu

**Detail · Edit · Hapus / Pulihkan**, in a dropdown on each parent row — the same
arrangement the supplier list uses, and for the same reason: this table already
carries three numeric columns it exists for (HPP, harga jual, stok), and a third
inline button pushed them off the right edge on a laptop.

**Detail is the first item and the only ungated one.** It needs `products:read`,
which is already what put the row on screen, so the menu can never open onto
nothing — which is why the Aksi column is unconditional here while the supplier
table hides its own. A deleted row offers only Pulihkan; restoring it first is
what makes editing it meaningful again.

Variant rows have no menu: the variant's own name links to its detail page, and
everything else about a variant is edited through its parent's form.

### Detail is its own screen, not the form

`ProductDetail` answers "what IS this product right now"; `ProductForm` answers
"what should it be". They are different pages because they show different things:
the form hides stock entirely (an existing product's quantity moves through the
stock screens, never through a text box) and renders a parent's family as a grid
of price inputs, while the detail screen shows the quantities and nothing
editable.

That is also why `/[id]` is the **detail** page and editing sits at `/[id]/edit`
— the same split the supplier routes use. Arriving at a product from a low-stock
alert or a search means wanting to look at it, and a URL that opened a form full
of live inputs is an edit nobody asked for.

One **warehouse selector scopes every quantity on the page**, defaulting to all
of them. Like the list's selector it is a view rather than a filter: the response
already carries the per-warehouse rows, so switching location re-reads what is on
screen instead of issuing a request. Its options include **inactive** warehouses
— a closed location still owns the stock it held, and a row it appears in has to
be named rather than shown as an id.

A parent lists its variants from `GET /:id/variants` (unpaginated — a parent has
a handful by construction), each row linking to its own detail page: a variant is
a product in its own right, carrying the barcode, the price and the stock the
parent carries none of. A **variant** fetches its parent for the reverse reason —
`parentId` is an id, and "induk: 68f1a…" tells a reader nothing.

### Three shapes, one form

| Mode   | Writes                                                |
| ------ | ----------------------------------------------------- |
| Satuan | one `standalone`                                      |
| Varian | a `parent` **plus every combination**, in ONE request |
| Bundle | one `bundle` with its components                      |

The mode is **locked after creation**, mirroring the backend: changing it would
strand the stock rows and sales history written against the old shape.

A family is created in a single `POST` carrying `variants[]`, which the API
commits as one transaction. On **edit** the rows have independent lives, so the
form diffs them: changed rows are patched, newly-added combinations are created
against the parent, untouched rows are not sent at all. A combination that
disappeared is never deleted here — removing an axis value is refused by the API
while a live variant sits on it, and deleting a variant is a decision made on the
list, where its stock and history are visible.

### Opening stock, behind a switch

Defaulted **off**. Turning it on writes a stock movement that cannot be edited or
deleted afterwards (the ledger is append-only) and locks the product against
deletion, so it is a decision rather than a side effect of typing in a field.

- **Standalone** — one quantity, one purchase cost, one warehouse.
- **Family** — one quantity **per variant**; a blank row is created with no
  stock. The warehouse (and, for expiring goods, the batch code and expiry date)
  is asked once for the whole entry.
- **Bundle** — never offered. A bundle holds no stock of its own.

**The purchase price is required wherever a quantity is entered**, and validated
here rather than left to the API — which now refuses the whole create *before
writing anything*, so an unpriced row would cost the user the entire form rather
than one cell. In a family this is per row: a variant left blank asks for no
price, a variant given stock demands one.

The reason is accounting, not tidiness. The price is what the opening inventory
journal is built from (**Dr 1201 Persediaan / Cr 3101 Modal**). Without it the
movement carries a quantity with no value, the journal line is skipped, and the
tenant is left holding stock the balance sheet says is worth nothing — a hole
that only surfaces at the first stocktake, by which time the original price is a
question nobody can answer. `0` is accepted: donated stock and free samples are
real.

It travels in the same request as the product and is posted to the ledger by the
API. **The API commits the products before the ledger runs**, so a ledger failure
comes back on a `201` as `openingStock.posted: false` — the form then tells the
user the product exists and its opening stock does not, and points at Penyesuaian
Stok. Everything predictable is refused before anything is written, so this path
now covers only the narrow window between the check and the posting.

## The marketplace fields

Merk, deskripsi, pre-order, informasi pengiriman, foto/video, and the two accounting references.
All optional — a tenant that never sells online fills none of them in and the catalogue works
exactly as it did.

### Inheritance: the one rule to keep

**Inputs bind to the STORED value. The parent's value is a PLACEHOLDER.**

The API returns both — `product.shipping.weight` (what this product itself holds, `null` when it
inherits) and `product.resolved.shipping.weight` (the effective value) — precisely so the form can
keep them apart:

```tsx
value={row.weight}                    // stored: "" when inherited
placeholder={parentShipping.weight}   // effective: shown, never bound
```

Getting this backwards is the one bug this feature can produce silently. A variant loads its
parent's 500 g into the input, the user edits the SKU and saves, and the variant now holds an
explicit 500 g that has stopped following its family — with nothing on screen to say so. `buildPatch`
and `saveFamily` diff against `product.shipping`, never `product.resolved.shipping`, for the same
reason.

Clearing a field is how an override is removed and inheritance resumes. There is no reset button.

`inheritedFields[]` names which values came from the parent; the detail screen renders *"warisan
dari induk"* beside each, because the two states are otherwise indistinguishable and they lead to
different actions — edit here, or edit the parent and move every sibling at once.

**`isPreorder` is not inherited.** Inheriting a boolean needs a tri-state that renders as an
indeterminate checkbox nobody reads correctly, so it is a plain per-product flag.

### Media

Up to 9 images/videos on the parent or standalone; exactly one image per variant. The array's
order is the display order and the first item is the primary image everywhere — catalogue row, POS
tile, marketplace listing — which is why the reorder controls matter and why there is no separate
sort field.

Reordering is native HTML5 drag **plus ◀ ▶ buttons**. The buttons are the touch path, the keyboard
path and the only path testable in jsdom, which is what makes a drag-and-drop library unnecessary
for nine one-dimensional items rather than merely avoidable.

Cropping happens in the browser before upload, so the server receives already-cropped bytes.

#### Compression

Split between the browser and the server, and the split is on purpose: the browser decides what is
**sent**, the server decides what is **stored**.

**Images** are downscaled to 2048px and re-encoded (WebP, JPEG where that is unsupported) by the
crop dialog. The cap is deliberately above the server's 1600 — a canvas downscale is a crude
filter, so leaving the final resample to sharp produces a sharper stored image than sending
exactly 1600 would. What this fixes is not only bandwidth: the dialog used to encode at full
natural resolution, so a photo straight off a phone routinely exceeded the 5 MB ceiling and was
rejected outright.

The server stores three sizes — 1600, **800** and 320. Read them by the box being drawn into and
narrow through the chain, because media stored before the 800 existed has neither derivative:

```ts
const src = item.mediumUrl ?? item.thumbUrl ?? item.url;
```

**Videos** are not transcoded in the browser. It is possible — WebCodecs, or ffmpeg in wasm — and
it is the wrong trade: WebCodecs needs a muxer and gives different output on every device, and
ffmpeg.wasm is a ~30 MB download needing cross-origin isolation headers the app does not set. The
server has a real ffmpeg and gets the same result every time. What the browser does is the cheap
half — capture a poster frame, and refuse an oversized file **before** the upload rather than
after fifty megabytes have gone out.

A poster is best-effort: the server extracts one when none arrives. Sending one anyway is what
makes the tile fill in the instant the transfer completes rather than after the transcode.

**The tile shows "Memproses…" once the transfer hits 100%.** The server is still working — three
image encodes, or a video transcode that runs tens of seconds — and a percentage frozen at 100 is
indistinguishable from a hung request to the user watching it.

Deleting a tile removes it from the array only. The bytes go when the product is saved; doing it
sooner would strand a live product's image if the user then cancelled.

### Bundle weight

A bundle's weight defaults to the sum of its components', in grams, shown as a **placeholder** so
that saving without touching it keeps the bundle following its components. Type a number to
override; clear it to go back. Components with no weight recorded are named, because a total the
user cannot reconcile against the scale is worse than no total.

### Akuntansi

`chartOfAccounts:read` and `businessLines:read` are separate permissions from `products:read`. When
either list cannot be loaded the two selects are replaced by an explanation and **the form still
saves** — both fields are optional, and taking down the whole form over an optional section would
be the wrong trade.

## Routes

| Route                                    | File                                                  | Screen                     |
| ---------------------------------------- | ----------------------------------------------------- | -------------------------- |
| `/dashboard/inventory/products`          | `app/(dashboard)/dashboard/inventory/products/page.tsx`     | List (`ProductsScreen`)    |
| `/dashboard/inventory/products/new`      | `.../products/new/page.tsx`                           | Create (`ProductForm`)     |
| `/dashboard/inventory/products/[id]`     | `.../products/[id]/page.tsx`                          | Detail (`ProductDetail`)   |
| `/dashboard/inventory/products/[id]/edit`| `.../products/[id]/edit/page.tsx`                     | Edit (`ProductForm`)       |

All four are behind `<RequirePermission feature="products" …>` (`read`, `create`,
`read`, `update` respectively). The dynamic routes are async Server Components
that await the Next 16 `params` Promise.

## Structure

- `features/inventory/`
  - `hooks/useProducts.ts` — list query state (page/search/type/category/status/
    deleted), `refetch`. Sends `excludeVariants` **or** `productType`, never both
    (the API rejects the pair).
  - `hooks/useProductVariants.ts` — lazy per-parent expand, cached; the
    already-asked set lives in a ref so a re-expand cannot refire the request.
  - `hooks/useProductDetail.ts` — one product plus the rest of its family: a
    parent's variants, or a variant's parent. Feeds both `ProductForm` and
    `ProductDetail`.
  - `hooks/useCatalogLookups.ts` — categories and warehouses, in parallel. Active
    warehouses by default (an inactive one cannot take an opening balance);
    `{ includeInactive: true }` for the detail screen, which names locations
    rather than offering them. Categories come back whole, retired ones
    included — the catalogue's category FILTER needs them, since finding the
    products still filed under a retired label is the point of retiring it.
    `ProductForm` narrows the list itself, to the active ones plus whichever the
    product being edited already uses.
  - `hooks/useBundleCandidates.ts` — standalone + variant products for the
    component picker, fetched only in bundle mode.
  - `utils/catalogue.ts` — `qtyAt`, `stockOf`, `limitedByAt`,
    `variantCombinations`, `attributesFor`, `defaultVariantSku`, `matchVariant`.
  - `components/` — `ProductsScreen`, `ProductsToolbar`, `ProductsTable`,
    `ProductDetail`, `ProductForm`, plus the existing `VariantAxisEditor`,
    `BundleComponentEditor` and `ProductTypeBadge`.
- `services/product.service.ts` — `list/getById/listVariants/getByBarcode/
  lowStock/create/update/remove/restore`.
- `services/warehouse.service.ts` — `list` (picker).
- `services/category.service.ts` — already existed (categories feature).
- `types/inventory.ts` — `ProductStockRow`, `BundleAvailabilityRow`,
  `ProductListQuery`, `OpeningStockInput`, `CreateFamilyVariantInput`, the
  `CreateProductInput` union, `UpdateProductInput`, `CreatedProduct`,
  `OpeningStockReport`.

The create payloads are a **discriminated union**, not one optional-everything
interface: the backend rejects a field a type has no use for (a `sellPrice` on a
parent is a 400 naming the field), so a payload the API would refuse does not
compile.

## API

Requires authentication and the matching `products` permission. The screens also
need `categories:read` and `warehouses:read` for their pickers, and
`stockMovements:create` is enforced server-side for opening stock.

| Method   | Path                          | Purpose                                                             |
| -------- | ----------------------------- | ------------------------------------------------------------------- |
| `GET`    | `/api/products`               | List — `page, limit, search, categoryId, productType \| excludeVariants, isActive, includeDeleted` |
| `GET`    | `/api/products/:id`           | One product                                                         |
| `GET`    | `/api/products/:id/variants`  | A parent's variants (`{ parent, items }`, unpaginated)              |
| `POST`   | `/api/products`               | Create — may carry `variants[]` and `openingStock`                  |
| `PATCH`  | `/api/products/:id`           | Update — send only what changed                                     |
| `DELETE` | `/api/products/:id`           | Soft delete (guarded three ways)                                    |
| `PATCH`  | `/api/products/:id/restore`   | Undo a soft delete                                                  |

### Errors

Both `400` and `409` carry `details: [{ field, message }]`, including inside a
family (`variants.3.sku`). `ApiError.fieldErrors` binds the plain fields to their
inputs; row-scoped ones are routed to the variant row that caused them, because a
twelve-row form is exactly where "SKU already exists" with no row attached is
useless.

Delete refusals are shown **verbatim** — the message names which of the three
guards stopped it (live variants / used by a bundle / still holds stock) and
suggests deactivating instead, which is the only actionable part.

## Money

Prices and quantities are decimal **strings** end to end, never JSON numbers.
Arithmetic goes through `utils/decimal.ts` (`toMinor`, `sumDecimals`,
`multiplyDecimals`); nothing parses them at the type boundary.

## Stock is grouped by branch, and a branchless warehouse still shows

PCR-010's "grouped by branch di UI". A warehouse belongs to a branch by **soft
default** (PCR-019), so one set up for a bazaar genuinely belongs to none — those
collect under **"Tanpa cabang"** rather than being dropped. Same rule the
stock-on-hand report follows: stock nobody visits is exactly what these screens
exist to surface.

The heading renders only when there is **more than one group**. A single-branch
tenant would otherwise get the same label above every row, and a grouping that
groups nothing is noise.

`branches:read` is its own permission, so the lookup **fails softly**: without it
every row lands in one unnamed group and the table renders exactly as it did
before grouping existed — which is the right thing for a missing optional lookup
to degrade to.

## A batch panel, for products that expire

PCR-013's "tab Batch + hari ke expired" — a **card** rather than a tab. The rest
of this screen is a column of cards read top to bottom; a tab strip for one extra
view would hide it behind a click and make the page two shapes. What the AC asks
for is that somebody looking at a product can see its lots without going
elsewhere.

Gated twice, and both matter:

| | |
| --- | --- |
| `hasExpiry` | a product that does not expire still has one internal lot per receipt — plumbing the API creates so quantities have somewhere to live, and showing it to somebody who never asked about batches is noise |
| `productBatches:read` | a separate grant from `products:read`, and a request that 403s is one that should not have been made |

Only lots with something left (`hasRemaining`). An emptied lot is history the
stock card tells better — with the movement that emptied it — while this card
answers "what is on the shelf, and when does it turn".

## The barcode field warns while you type

PCR-018's "warning duplicate barcode saat input". **The data was never at risk**:
the API enforces a partial unique index and answers a clash with a 409. What was
missing is *when* the user finds out — after filling in a whole product and
pressing save, at which point the fix is to go and work out which existing product
owns the code.

**Advisory, never a gate.** The save button stays enabled: the check races
anything another user does in the same second, and the server is the authority
either way. Disabling it would block a save the API would have accepted.

Debounced at 500ms because a barcode is usually **scanned** — a burst of
keystrokes ending in a newline. Firing per character would be a dozen requests for
one scan.

A `404` is the *good* answer: the endpoint reports "nothing has this barcode" by
not finding one, so the miss is the success case. Editing the product that already
owns the code is not a clash, or the edit form would warn on every save that never
touched the barcode.

## Each warehouse row links to its stock card

PCR-010 asks for the movement history on the detail. The link carries **both** the product
and the warehouse, because the stock card is a ledger of that pair — one naming only the
product would land the user on a screen still asking which shelf, while they are looking at
the row.

Withheld in two cases, for two different reasons:

| | |
| --- | --- |
| no `stockMovements:read` | a link that leads to access-denied is worse than no link |
| a `parent` or a `bundle` | neither owns a ledger — the quantity beside it is its variants' or its components', so the card would open empty and read as a bug in the ledger rather than a property of the type |

## Tests

- `tests/ProductsScreen.test.tsx` — the list against a mocked service: the
  `excludeVariants` request, `variantCount` without expanding, the expand
  fetching once and caching, the bundle's "bisa dibuat" and its cap, the
  warehouse switch not refetching, delete → confirm → refetch, a 409 shown
  verbatim, restore on a deleted row, Detail and Edit pointing at their two
  routes, a read-only role keeping Detail and losing everything that writes, and
  both failure paths.
- `tests/ProductDetail.test.tsx` — the read-only page: the stored fields and the
  stock summed across warehouses, a closed warehouse still named, a parent's
  whole family listed with each variant's quantity and its axes, a variant naming
  its parent instead of showing an id, the edit link hidden from a read-only
  role, and the server's refusal shown rather than an empty page.
- `tests/ProductForm.test.tsx` — the payloads: no `openingStock` when the switch
  is off, the full instruction when it is on, a discarded quantity after
  switching off, batch/expiry demanded for expiring goods, `posted: false`
  reported to the user, a 409 bound to the SKU field, a family in ONE request,
  per-variant opening stock with blanks omitted, a row-scoped refusal routed to
  its row, edit sending only what changed, and a new combination created against
  the parent.
- `tests/InventoryCatalogue.test.tsx` — what remains there is the demo-backed
  batch and opname coverage.
