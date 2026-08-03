# Changelog

All notable changes to the PawCRM frontend.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/).

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
