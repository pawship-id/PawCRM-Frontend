# Product & Variant Management (Inventory → Produk & Varian)

Frontend for the product catalogue — standalone items, variant families and
bundles — wired to `/api/products`. Branch: `feature/inventory-purchasing`.

Replaces the demo-store version of these two screens. The other inventory
screens (stock card, batches, opname, transfers) still read the demo store and
are untouched by this work.

## What it does

Under **Dashboard → Inventory → Produk & Varian** a permitted user can:

- **List** the catalogue — one row per family, paginated, with free-text search,
  type/category/status filters and a "show deleted" toggle.
- **Expand** a parent into its variants, fetched on demand.
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

### Three shapes, one form

| Mode        | Writes                                                    |
| ----------- | --------------------------------------------------------- |
| Produk biasa | one `standalone`                                          |
| Punya varian | a `parent` **plus every combination**, in ONE request      |
| Bundle       | one `bundle` with its components                          |

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

It travels in the same request as the product and is posted to the ledger by the
API. **The API commits the products before the ledger runs**, so a ledger failure
comes back on a `201` as `openingStock.posted: false` — the form then tells the
user the product exists and its opening stock does not, and points at Penyesuaian
Stok.

## Routes

| Route                                    | File                                                  | Screen                     |
| ---------------------------------------- | ----------------------------------------------------- | -------------------------- |
| `/dashboard/inventory/products`          | `app/(dashboard)/dashboard/inventory/products/page.tsx`     | List (`ProductsScreen`)    |
| `/dashboard/inventory/products/new`      | `.../products/new/page.tsx`                           | Create (`ProductForm`)     |
| `/dashboard/inventory/products/[id]`     | `.../products/[id]/page.tsx`                          | Edit (`ProductForm`)       |

All three are behind `<RequirePermission feature="products" …>` (`read`,
`create`, `update` respectively). The `[id]` route is an async Server Component
that awaits the Next 16 `params` Promise.

## Structure

- `features/inventory/`
  - `hooks/useProducts.ts` — list query state (page/search/type/category/status/
    deleted), `refetch`. Sends `excludeVariants` **or** `productType`, never both
    (the API rejects the pair).
  - `hooks/useProductVariants.ts` — lazy per-parent expand, cached; the
    already-asked set lives in a ref so a re-expand cannot refire the request.
  - `hooks/useProductDetail.ts` — the edit screen's product + its variants.
  - `hooks/useCatalogLookups.ts` — categories and active warehouses, in parallel.
  - `hooks/useBundleCandidates.ts` — standalone + variant products for the
    component picker, fetched only in bundle mode.
  - `utils/catalogue.ts` — `qtyAt`, `stockOf`, `limitedByAt`,
    `variantCombinations`, `attributesFor`, `defaultVariantSku`, `matchVariant`.
  - `components/` — `ProductsScreen`, `ProductsToolbar`, `ProductsTable`,
    `ProductForm`, plus the existing `VariantAxisEditor`, `BundleComponentEditor`
    and `ProductTypeBadge`.
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

## Tests

- `tests/ProductsScreen.test.tsx` — the list against a mocked service: the
  `excludeVariants` request, `variantCount` without expanding, the expand
  fetching once and caching, the bundle's "bisa dibuat" and its cap, the
  warehouse switch not refetching, delete → confirm → refetch, a 409 shown
  verbatim, restore on a deleted row, a read-only role seeing no write actions,
  and both failure paths.
- `tests/ProductForm.test.tsx` — the payloads: no `openingStock` when the switch
  is off, the full instruction when it is on, a discarded quantity after
  switching off, batch/expiry demanded for expiring goods, `posted: false`
  reported to the user, a 409 bound to the SKU field, a family in ONE request,
  per-variant opening stock with blanks omitted, a row-scoped refusal routed to
  its row, edit sending only what changed, and a new combination created against
  the parent.
- `tests/InventoryCatalogue.test.tsx` — what remains there is the demo-backed
  batch and opname coverage.
