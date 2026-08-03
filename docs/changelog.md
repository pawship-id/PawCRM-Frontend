# Changelog

All notable changes to the PawCRM frontend.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased] — Preview dari server, dan retry yang aman

Branch: `feature/inventory-purchasing`. Follows the entry below, which shipped the
two write forms against an API that could only report what it had already done.

`PawCRM-Backend` 0.21.0 closed the three gaps that entry lists, and this pass
**deletes the code that existed because of them**. Net effect on the user: the
preview panel now shows what will actually be written, and a save that times out
can be retried without moving stock twice. Net effect on the code: three files
fewer.

### Added

- **`stockMovementService.preview`** + **`useMovementPreview`** — a debounced
  (350 ms) `POST /stock-movements/preview`. It keeps the last answer on screen
  while a new one is in flight, because clearing it makes the panel flicker
  between every keystroke and its response
- **`utils/idempotency.ts`** — `newIdempotencyKey`, minted once per **intent**.
  Both forms keep it across a failed attempt, so a retry replays instead of
  writing twice, and replace it only after a save succeeds
- `types/inventory.ts` — `PreviewStockMovementInput`, `PreviewMovementRow`,
  `PreviewHpp`, `StockMovementPreview`, `HppCalculation`; `idempotencyKey` on
  both create inputs

### Removed

- **`features/inventory/utils/preview.ts`** — the reimplementations of FEFO
  allocation, the perpetual weighted average and the counter-account choice. They
  agreed with the server; the risk was that a future divergence would not throw,
  it would render a confident wrong number the user approves
- **`hooks/useJournalAccounts.ts`** and **`services/chartOfAccounts.service.ts`**
  — they existed only to put names on the two account codes `utils/preview.ts`
  hardcoded. The preview response carries codes and names
- **`ChartAccount`** from `types/api.ts`, and **`stockPreview.test.ts`** (14
  cases) — the rules they pinned now have one implementation, in the backend

### Changed

- **Both forms build ONE payload and use it for the preview and the save.** A
  preview of a different request is worse than no preview, and that object was
  the only place they could diverge; the test asserts they match
- **Neither form loads lots any more.** `useProductBatches` was there to compute
  the FEFO split — the preview now names every lot it would touch
- `FefoPreview` takes the server's rows instead of a client-computed allocation;
  `HppStrip` takes `HppCalculation` from `types/inventory` instead of a demo-store
  type. The "sisa lot" caption is gone — it was the one field the preview does not
  return, and keeping a second request alive for a caption is not a trade worth
  making
- `StockMovementForms.test.tsx` rewritten around the fetched preview (14 → 15)
- **The expiry checkbox on an existing variant family now says that changing it
  cascades to every variant.** The backend cascade is new (`PawCRM-Backend`
  unreleased); the checkbox looks like a small edit and is not one, and finding
  that out from a stock card six weeks later is worse than reading it here
- **Penyesuaian Stok now has a sidebar entry**, last in the Inventory menu, with
  a new `AdjustmentIcon`. It was previously reachable only from the hub. Last on
  purpose — a real discrepancy is found by an opname and moved goods are moved by
  a transfer, so the by-hand correction should not sit above either — and gated
  on `stockMovements:create`, which the seeded Staff role does not hold.
  `nav.test.ts` pins both the order and the read-only case

---

## [Unreleased] — Penyesuaian & Transfer Stok

Branch: `feature/inventory-purchasing`.

The two screens that **write** to the stock ledger move off the prototype store
onto `POST /api/stock-movements`. Together they are the entire write surface the
API offers a client — an `operation` of `adjustment` or `transfer`, and nothing
else — so the stock module's write side is now complete. See
`docs/features/stock-movements.md`.

Frontend only. **No backend change**, but three new gaps were found and written
up: `PawCRM-Backend/docs/stock-card-gaps.md` gaps 7–9.

### Added

- **`stockMovementService.create`** — posts an adjustment or a transfer and
  returns the ARRAY the server wrote. Callers must not assume one row: FEFO
  splits a withdrawal across every lot it draws from, and a transfer writes a
  pair per lot
- **`services/chartOfAccounts.service.ts`** (`getByCode`) — one method, so the
  journal preview can name the accounts it is about to post against. By code,
  never by id: account ids differ per tenant, codes do not
- **`features/inventory/utils/preview.ts`** — `previewFefo`, `previewHpp`,
  `previewAdjustmentJournal`. The API has no preview endpoint, so these
  reimplement three server decisions; the file's header says which, and why the
  duplication is a risk rather than a convenience
- **`hooks/useJournalAccounts`** — code → name, and the only lookup in this
  feature that swallows its failure. The preview falls back to showing `5201`,
  which is still true; a red banner because the role lacks
  `chartOfAccounts:read` would block a stock adjustment over a missing caption
- `types/api.ts` — `ChartAccount`
- Tests: `stockPreview.test.ts` (14), `StockMovementForms.test.tsx` (14)

### Changed

- **`StockAdjustmentForm` and `StockTransferForm`** now read their warehouses,
  products, lots and HPP from the API and post to it. The UI is unchanged; what
  changed is that Simpan writes something that survives a refresh
- **Only ACTIVE warehouses are offered**, unlike the stock card, which lists
  inactive ones because it only reads. The API refuses a movement at an inactive
  location, so offering one would be a rejection waiting to happen
- **The transfer form refuses to render** with fewer than two active warehouses,
  rather than showing two selects stuck on the same value above a disabled button
- **Rejections are surfaced with `ApiError.fullMessage`**, which carries the
  actionable half of a 400 ("Warehouse 'Gudang Bazar' is not active…") that
  `message` alone drops. Only rules a user can fix without a round trip are
  validated locally
- **The success toast reports the SERVER's row count**, not the predicted one —
  so a disagreement between preview and reality is visible rather than silent
- `InventoryScreens.test.tsx` is down to the hub: it is the last inventory screen
  on the demo store, apart from opname

### Known limitations

Each traced to a backend gap — `PawCRM-Backend/docs/stock-card-gaps.md`:

- the previews are computed in the browser and can drift from the server's own
  rules (gap 7); both forms say so in their copy
- the account codes a movement posts to are hardcoded; only their names are
  looked up per tenant (gap 8)
- **a manual movement cannot be retried safely** (gap 9). The submit button is
  disabled while in flight, which stops a double click and nothing else: a
  request that times out and is retried writes the adjustment twice

> **All three are gone** — `PawCRM-Backend` 0.21.0 closed the gaps and the entry
> above rewired the forms. This entry is kept as the record of what the screens
> looked like when the API could only report what it had already done.

---

## [Unreleased] — Kartu stok, rewired

Branch: `feature/inventory-purchasing`. Follows the entry below, which shipped the
screen against an API that returned neither a balance nor a label.

`PawCRM-Backend` 0.20.0 closed five of the six gaps that entry lists, and this
pass **deletes the workarounds** rather than keeping them beside the new fields.
Net effect on the user: the balance column survives every filter, the ledger
pages like every other list, there is a "diinput oleh" column, period totals, and
an export button. Net effect on the code: less of it.

### Added

- **Period tiles** — `useStockCardSummary` + `GET /stock-movements/summary`.
  Total masuk, keluar, nett and movement count for the filtered range. Omitted
  before, because summing the loaded page reports the page and grows as the user
  pages. Deliberately not keyed on the page number: the totals do not change when
  you page
- **Export CSV** — a button beside the filters it obeys, plus
  `stockMovementService.export` and a new `apiClient.download`. The blob is
  fetched and saved rather than linked to: an anchor pointing at the endpoint
  would turn a 403 into a downloaded file containing `{"success":false}`.
  `download` shares credentials, timeout and error translation with every other
  call — only the `{ success, data }` unwrapping is skipped, because it would
  throw on the first byte of CSV
- **"Diinput oleh" column**, and `batchCode` read straight off the row. `null`
  renders as "sistem" — the API's answer for a movement a background process
  posted
- **`openingBalance` in the ledger's footer** — the balance before the page's
  oldest row, so a reader can check the page's own arithmetic
- `types/inventory.ts` — `StockMovement` gains the six fields the API computes
  (`balanceAfter` and the five labels); new `StockMovementPage`,
  `StockMovementSummary`; `ProductListQuery.holdsStock`

### Changed

- **The ledger pages by jumping again.** `Pagination` replaces "Muat lebih
  banyak", and `useStockCard` returns one page instead of accumulating. The
  append-only feed existed because the balance was reconstructed by walking
  backwards from the newest row, which a page-jump would have invalidated —
  every balance on screen wrong by the sum of the pages it skipped
- **No filter costs the balance column any more.** The paragraph in
  `StockCardFilters` explaining that a type or end-date filter disabled it is
  gone, not reworded: the server sums the rows it hides too
- **The product picker issues one request** (`holdsStock=true`) instead of two
  merged by type, and no longer carries a copy of the server's
  `STOCK_TRACKING_TYPES`
- **`utils/ledger.ts` is down to `partitionBatches` and `qtyAtWarehouse`.**
  `withRunningBalance` and `canAnchorBalance` are deleted; the file's header now
  records why they existed, so nobody rebuilds them
- `useProductStock` is still fetched, but for the position tiles only — it is no
  longer the balance anchor, so a stale reading no longer moves every number in
  the table
- Tests: `stockLedger.test.ts` drops its balance arithmetic (10 → 4);
  `StockCardScreen.test.tsx` rewritten around the rendered-not-derived seams
  (8 → 14); `stockLedger.service.test.ts` covers `summary` and `export` (8 → 10)

### Still missing

- **`referenceNo`.** The Referensi column names a document *kind*, not a
  document, because `goodsreceipts`, `postransactions` and `stockopnames` are not
  collections yet. It lands with those modules

---

## [Unreleased] — Kartu stok

Branch: `feature/inventory-purchasing`.

Inventory → Kartu Stok moves off the prototype store and onto the real
`/api/stock-movements` and `/api/product-batches`. Frontend only — **no backend
change**. See `docs/features/stock-card.md`, and
`PawCRM-Backend/docs/stock-card-gaps.md` for what the API still owes this screen.

### Added

- `services/stockMovement.service.ts` (`list`, `getById`) and
  `services/productBatch.service.ts` (`list`, `expiring`, `getById`) — both
  **read-only**, mirroring APIs that have no write surface. The ledger is
  append-only; a batch is born from a movement
- `features/inventory/utils/ledger.ts` — `withRunningBalance`,
  `canAnchorBalance`, `partitionBatches`, `qtyAtWarehouse`. The balance the API
  does not return, derived by anchoring backwards from `qtyOnHand` on BigInt
  minor units
- Hooks `useStockCardLookups`, `useProductStock`, `useStockCard`,
  `useProductBatches` — one `refreshKey` drives the last three together, so a
  refresh can never measure a fresh ledger against a stale anchor
- `components/StockCardFilters.tsx` (movement type, date range, reset, refresh),
  `StockLedgerTable.tsx`, `BatchLotTable.tsx`
- `types/inventory.ts` — `StockMovementListQuery`, `ProductBatchListQuery`,
  `ExpiringBatchListQuery`, `ExpiringBatchesResult`
- Tests: `stockLedger.test.ts` (10), `stockLedger.service.test.ts` (8),
  `StockCardScreen.test.tsx` (8)

### Changed

- **`StockCardScreen`** rewritten as a container over the four hooks: per-section
  loading, per-section errors, an empty state, and stat tiles that read `—`
  rather than guessing when `products:read` is missing
- **The ledger appends, and no longer offers a pager.** The running balance is
  anchored to the current on-hand quantity, which is only valid while the loaded
  rows run contiguously from the newest one — a page-jump would leave every
  balance on screen wrong by the sum of the pages it skipped
- **A movement-type filter or an end date blanks the balance column**, on purpose
  and with the reason stated on the filter itself: both hide rows newer than the
  ones displayed, which breaks the anchor
- **`WarehouseProductPicker`** gains opt-in `includeInactiveWarehouses` and a
  `productPlaceholder`. Only a read-only screen passes the first — the stock card
  does, because a deactivated warehouse still owns its whole history
- `/dashboard/inventory/stock-card` now sits behind
  `RequirePermission feature="stockMovements"`; the batch tab carries its own
  `productBatches:read` check and is not requested without it
- `InventoryScreens.test.tsx` drops its three StockCardScreen cases — that screen
  no longer reads the demo store, so it needs mocked services and an auth context

### Known limitations

Each traced to a backend gap rather than a frontend decision — see
`PawCRM-Backend/docs/stock-card-gaps.md`:

- no "siapa yang input" column, and the reference shows a document **type**
  rather than a number (gap 2)
- no period totals and no CSV/PDF export (gaps 3 and 4)
- the product picker issues two requests and caps at 500 rows per type, warning
  when a catalogue exceeds it (gap 5)

> **All of these are gone** — `PawCRM-Backend` 0.20.0 closed the gaps and the
> entry above rewired the screen. `referenceNo` is the one that remains. This
> entry is kept as the record of what the screen looked like when the API
> returned neither a balance nor a label.

---

## [Unreleased] — Warehouse management

Branch: `feature/inventory-purchasing`.

Master Data → Warehouse, against the already-existing `/api/warehouses`. Frontend
only — **no backend change**. See `docs/features/warehouse-management.md`.

### Added

- `features/warehouses/` — `WarehousesScreen`, `WarehousesToolbar`,
  `WarehousesTable`, `WarehouseStatusBadge`, `WarehouseBranchSelect`,
  `WarehouseCreateForm`, `WarehouseEditForm`; hooks `useWarehouses` (list query
  state) and `useWarehouseBranches` (branch names + picker options)
- Routes `/dashboard/master/warehouses`, `/new` and `/[id]`, each behind
  `RequirePermission` (`warehouses` / `:create` / `:update`)
- `types/api.ts` — `Warehouse`, `WarehouseListQuery`, `CreateWarehouseInput`,
  `UpdateWarehouseInput`
- `utils/validation.ts` — `validateWarehouseName`, `validateWarehouseAddress`,
  `validatePicName`, `validatePicPhone`
- `components/icons.tsx` — `WarehouseIcon`; Master Data → Warehouse nav entry
  gated on `warehouses:read`
- Tests: `warehouse.service.test.ts` (7), `WarehousesTable.test.tsx` (9),
  `WarehouseCreateForm.test.tsx` (5)

### Changed

- **`services/warehouse.service.ts`** grows from a picker's `list` into the full
  set (`list/getById/create/update/remove/restore`). `list` gains `page`,
  `defaultBranchId` and `includeDeleted`, keeps its `limit: 100` default, and now
  returns `PageResult<Warehouse>` — structurally assignable to the slim
  `StockWarehouse`, so `useCatalogLookups` and the product screens are untouched
- **`api-client` / `ApiError` carry the envelope's `reason`**, with a new
  `ApiError.fullMessage` (`"message — reason"`). The warehouse delete guards put
  the actionable half of a 409 there ("still holds stock for 3 product(s)"), and
  it was being dropped — every feature benefits, none changes behaviour
- A branch's **default warehouse offers no Delete** (table and danger zone): the
  backend refuses it unconditionally, so the badge and a line of copy explain it
  instead of a button that can only 409
- `tests/ProductForm.test.tsx` / `tests/ProductsScreen.test.tsx` warehouse
  fixtures are now full `Warehouse` documents

### Not implemented (needs backend)

Reassigning a branch's default warehouse (no `set-default` route, `isDefault` is
server-owned), a per-warehouse stock summary, a populated `defaultBranchId`, and
filtering for central (unassigned) warehouses only.

---

## [Unreleased] — Product & Variant management

Branch: `feature/inventory-purchasing`.

The catalogue screens leave the demo store and run against `/api/products`. See
`docs/features/product-management.md`.

### Added

- `services/product.service.ts` —
  `list/getById/listVariants/getByBarcode/lowStock/create/update/remove/restore`
- `services/warehouse.service.ts` — `list`, for the stock-column and
  opening-stock pickers
- `features/inventory/hooks/` — `useProducts` (list query state),
  `useProductVariants` (lazy, cached per-parent expand), `useProductDetail` (the
  edit screen's product + family), `useCatalogLookups` (categories + active
  warehouses), `useBundleCandidates` (component picker, bundle mode only)
- `features/inventory/utils/catalogue.ts` — the pure helpers both screens share:
  `qtyAt`, `stockOf`, `limitedByAt`, `variantCombinations`, `attributesFor`,
  `defaultVariantSku`, `matchVariant`
- `features/inventory/components/` — `ProductsToolbar` and `ProductsTable`, split
  out of `ProductsScreen` the way the customers and branches screens are
- `types/inventory.ts` — the request/response contract: `ProductStockRow`,
  `BundleAvailabilityRow`, `ProductListQuery`, `OpeningStockInput`,
  `CreateFamilyVariantInput`, the `CreateProductInput` discriminated union,
  `UpdateProductInput`, `CreatedProduct`, `OpeningStockReport`
- Tests: `ProductsScreen.test.tsx` (11) and `ProductForm.test.tsx` (15), both
  against mocked services

### Changed

- **`ProductsScreen`** now lists from the API with server pagination, asking for
  `excludeVariants=true` so a family is one row and `total` counts what is shown.
  A parent's variants are fetched when its row is expanded, and cached. The
  warehouse selector re-reads quantities already on the page rather than
  refetching. Delete and restore run through `ConfirmDialog` and surface the
  backend's refusal verbatim — it names which guard stopped it
- **`ProductForm`** now loads its product (and, for a parent, its variants)
  before rendering, and saves through the API: a family goes in ONE request
  carrying `variants[]`; an edit sends only the fields that changed and creates
  only the combinations that are new. `openingStock` travels with the create, per
  variant, and a `posted: false` on a successful create is reported to the user
  rather than swallowed. Field-level refusals (`400` and `409` alike) bind to
  their inputs, and row-scoped ones to the variant row
- **`BundleComponentEditor`** is fed by the API instead of the demo store
- The three product routes are behind `<RequirePermission feature="products">`,
  and every row action behind `<Can>`
- `demoStore` products carry `stockByWarehouse: []`, matching the API shape now
  that `Product` is the API's type. The demo store still backs the stock card,
  batches, opname and transfer screens
- `tests/InventoryCatalogue.test.tsx` keeps the demo-backed batch/opname
  coverage; the catalogue cases moved to the two new files

### Requires (backend, same branch)

`POST /api/products` accepting `variants[]` + `openingStock`, `excludeVariants`
on the list with parent-surfacing search, `variantCount`/`variantStock` on a
parent, `bundleAvailability` on a bundle, and `details[]` on a `409`. See the
backend changelog `[0.19.0]`.

---

## [Unreleased]

Branch: `feature/project-initialization`.

### Added

**Customer management (Master Data → Customer)** — CRUD for the people a tenant
does business with (pet owners, buyers, clients), against the existing
`/api/customers` API. See `docs/features/customer-management.md`.

- Routes: `/dashboard/master/customers` (list), `/customers/new` (create),
  `/customers/[id]` (edit) — mirrors the branches routes
- `features/customers/` module: `CustomersScreen`, `CustomersToolbar` (search +
  VIP-tier filter + show-deleted), `CustomersTable` (name/email/phone, VIP +
  status badges, delete/restore row actions), `CustomerCreateForm`,
  `CustomerEditForm` (details + danger-zone), `VipTierSelect`,
  `CustomerVipBadge` / `CustomerStatusBadge`, and the `useCustomers` hook
- `services/customer.service.ts` — `list/getById/create/update/remove/restore`
- `types/api.ts`: `VipTier`, `Customer`, `CustomerListQuery`,
  `CreateCustomerInput`, `UpdateCustomerInput`
- Validation: `validateCustomerName`, `validateOptionalEmail`,
  `validateCustomerPhone`, `validateCustomerAddress`
- Gated on a new `customers` permission; nav item + `CustomerIcon`; pages behind
  `<RequirePermission feature="customers">`
- **Backend (permission wiring only, no business-logic change):** added
  `customers` to the RBAC catalog (`config/permissionCatalog.js`), gated every
  `/api/customers` route with `requirePermission("customers", …)` (mirroring
  `/api/audit-logs`), and granted the new permission to the seeded **Manager**
  (all actions) and **Staff** (read) roles. `PERMISSION_CATALOG` in the frontend
  hand-synced to match.
- Tests: `CustomerCreateForm.test.tsx`; `nav.test` updated; backend
  `customer.api.test.js` updated for the new gate (all 646 backend tests pass)

**Audit Log (Master Data → Audit Log)** — a read-only, paginated, filterable view
of the tenant's security audit trail. Gated on the new `auditLogs:read`
permission; the nav item and page hide without it. Reuses the master-data list
pattern (toolbar + table + pager) with no row actions, since the trail is
immutable.

- `features/audit-logs/`: `AuditLogsScreen`, `AuditLogsToolbar` (search + action
  filter + refresh), read-only `AuditLogsTable` (populated actor, tinted
  `AuditActionBadge`, metadata summary), `useAuditLogs` hook, and the action
  vocabulary in `constants.ts`
- `services/auditLog.service.ts` — `list(query)` → `GET /api/audit-logs`
- `types/api.ts`: `AuditLog`, `AuditLogActor`, `AuditLogBranchRef`,
  `AuditLogListQuery`
- `auditLogs: ["read"]` added to `PERMISSION_CATALOG`; nav item + `AuditLogIcon`;
  route `app/(dashboard)/dashboard/master/audit-logs/page.tsx` behind
  `<RequirePermission feature="auditLogs">`
- Search highlight: matched characters in the Action / IP cells are wrapped in a
  yellow `<mark>` via the new shared `HighlightText` component, so it is clear why
  each row was returned. Backend search is a case-insensitive substring match
  over `action` / `ipAddress`, so a few characters is enough.
- Tests: `auditLog.service`, `AuditLogsTable`, `HighlightText`; `nav.test` updated

**Search highlight extended to master data** — the same yellow `HighlightText`
now marks the matched characters in the Users (name, email), Roles (name,
description) and Branches (name, address) tables, paired with the backend's
substring search so typing a few characters highlights exactly what matched.
Each list screen passes its active `search` term down to the table.

**Numbered pagination** — the shared `Pagination` component now renders page
numbers (`1 2 3 …`) with a windowed range and ellipses, flanked by
Previous / Next, instead of Prev/Next alone — easier to jump around once a list
has many pages. Backward compatible (same props), so every list screen (users,
roles, branches, audit log) picks it up automatically. Windowing logic is the
pure `getPageItems(current, total)`, unit-tested in `Pagination.test.tsx`.

**Permission gating (RBAC-aware UI)** — frontend-only. Navigation, buttons and
pages hide when the signed-in user's role lacks the matching permission. A UX
guard, not a security boundary; the backend still authorizes every request. No
backend changes. See `docs/features/permission-gating.md`.

- `features/permissions/` module: `usePermissions` (`can` / `canAny` / `canAll`
  + super-admin bypass), `<Can>` render gate, `<RequirePermission>` page guard
  with an Access-denied panel, and the `PERMISSION_CATALOG` / `Feature` /
  `Action` vocabulary (mirrors the backend catalog)
- Grants read from the auth payload: `AuthProvider` now holds `permissions` +
  `isSuperAdmin` from `/api/auth/login` and `/api/auth/me`
- `types/api.ts`: `AuthPermissions`; `LoginPayload` / `MePayload` extended
- Sidebar hides Master Data children (and the group when empty) via
  `filterNavItems`; Master create buttons, row actions and routes gated
- Tests: `nav.test.ts`, `permissions.test.tsx`, `tests/helpers/renderWithAuth`

**User management (Master Data → User)** — frontend CRUD for staff users against
the existing `/api/users` API. No backend changes. See
`docs/features/user-management.md`.

- Routes: `/dashboard/master/users` (list), `/users/new` (create),
  `/users/[id]` (edit) — the app's first dynamic route segment
- `features/users/` module: `UsersScreen`, `UsersToolbar`, `UsersTable`,
  `Pagination`, `UserCreateForm`, `UserEditForm`, `RoleSelect`,
  `BranchScopeField`, `StatusBadge`, `ConfirmDialog`, plus `useUsers` and
  `useLookups` hooks
- List with search, status filter, "show deleted" toggle and pagination; create
  with role picker + branch-scope picker; edit with status toggle, admin
  password reset, and delete / restore / unlock
- `services/user.service.ts` extended with `list`, `getById`, `create`,
  `update`, `setStatus`, `unlock`, `remove`, `restore`
- `services/role.service.ts`, `services/branch.service.ts` — read-only lookups
- `types/api.ts`: `PageResult<T>`, `UserListQuery`, `CreateUserInput`,
  `UpdateUserInput`, `Role`, `Branch`; `User` gained `lockedUntil`, `deletedAt`
**shadcn/ui component system** — the shared UI primitives and the user
management screens now render on [shadcn/ui](https://ui.shadcn.com/) (Radix +
CVA + Tailwind).

- Added `components/ui/*` (button, input, label, card, alert, badge, dialog,
  select, checkbox, radio-group, table), `lib/utils.ts` (`cn`), and
  `components.json`
- The `@/components` primitives (`Button`, `TextField`, `Card`, `Alert`) are now
  thin adapters over shadcn/ui, keeping their existing prop APIs so every call
  site (auth, profile, dashboard) is unchanged while the markup/styling comes
  from shadcn
- Users feature rebuilt on shadcn: `Table` (list), `Dialog` (confirmations),
  `Select` (role + status filter), `RadioGroup`/`Checkbox` (branch scope),
  `Badge` (status); icons switched to `lucide-react`
- `styles/globals.css` gained shadcn's semantic tokens (card/popover/muted-
  foreground/accent/destructive/input/ring), mapped onto the existing PawShip
  palette — additive, so the original tokens keep their meaning
- Dependencies added: `radix-ui`, `class-variance-authority`, `clsx`,
  `tailwind-merge`, `lucide-react`, and `tw-animate-css` (dev)
- `jest.setup.ts` polyfills `ResizeObserver` and pointer-capture/`scrollIntoView`
  so the Radix-based components render under jsdom

### Verified

- `npm test` — 57/57 passing (11 suites)
- `npm run type-check` — clean
- `npm run lint` — clean
- `npm run build` — succeeds; `/dashboard/master/users/[id]` server-rendered on
  demand, list and `/new` prerendered

---

## [0.1.0] — 2026-07-21

Project foundation. Branch: `feature/project-initialization`.

Infrastructure only — no business features, by design.

### Added

**Scaffolding**

- Next.js 16.2.10 (App Router), React 19.2.4, TypeScript 5 in strict mode, Tailwind CSS 4
- Feature-based folder structure: `components/`, `features/`, `hooks/`, `services/`, `types/`, `utils/`, `tests/`, `styles/`

**API layer**

- `services/api-client.ts` — the only module that calls `fetch`; prefixes the base URL, unwraps the `{ success, data }` envelope, builds query strings, serializes JSON bodies, and times out after 15 s
- `services/api-error.ts` — one error type for every failure mode, exposing `isNetworkError`, `isUnauthorized`, `isValidationError` and a `fieldErrors` map ready to bind to form inputs
- `services/health.service.ts` — backend health check; the reference implementation for this layer

**Types**

- `types/api.ts` — `ApiSuccess<T>`, `ApiFailure`, `ValidationDetail`, `HealthPayload`, `Paginated<T>`, mirroring the backend contract in `.claude/architecture.md`

**Configuration**

- `utils/env.ts` — the only module that reads `process.env`; defaults to the local backend outside production and fails the build if unset in production
- `.env.example`, and a `.gitignore` negation so it is committed while `.env*` stays ignored

**Application**

- `app/layout.tsx` — PawCRM metadata, Geist fonts, imports the relocated global stylesheet
- `app/page.tsx` — minimal placeholder; no dashboard, login or business UI
- `styles/globals.css` — moved out of `app/` to match `.claude/rules.md`

**Testing**

- Jest + React Testing Library via `next/jest`, 16 tests across 2 suites, no backend or network required
- `api-client.test.ts` — envelope unwrapping, URL/path normalization, query serialization, JSON body handling, and every error path: HTTP error, validation details, 401, network failure, non-JSON body, empty body, `success:false` under a 200
- `page.test.tsx` — component-testing smoke test asserting on accessible roles

**Tooling**

- `npm run test`, `test:watch`, `test:coverage`, `type-check`
- ESLint via `eslint-config-next` (flat config)

**Documentation**

- `README.md`, `docs/architecture.md`, `docs/deployment.md`, this changelog

### Verified

- `npm test` — 16/16 passing
- `npm run type-check` — clean
- `npm run lint` — clean
- `npm run build` — succeeds; `/` and `/_not-found` prerendered as static

### Deliberately not included

Foundation branch only. Each arrives with its own feature branch:

- Authentication, session handling, protected routes
- Dashboard, login page, customer views, business components
- State management library, design system, end-to-end tests

### Notes

- Folder is `PawCRM-Frontend/` on disk where the rules say `frontend/`
- The backend is a separate repository with its own remote
- `npm audit` reports 2 moderate advisories from `postcss` nested inside
  `next`; the only offered fix downgrades Next.js to v9. Build-time only,
  not shipped to the browser. See `docs/deployment.md`.
