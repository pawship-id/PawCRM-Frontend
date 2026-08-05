# Warehouse Management (Master Data → Warehouse)

Frontend CRUD for warehouses — a tenant's **physical stock locations** — wired to
the already-existing `/api/warehouses` API. No backend change was made.
Branch: `feature/inventory-purchasing`.

## Warehouse is not Branch

The two sit next to each other in Master Data and mean different things
(`warehouse.model.js`):

| | Branch | Warehouse |
|---|---|---|
| Unit of | bookkeeping — what a P&L is broken down by | stock — where goods physically sit |
| Referenced by | `journalentries.branchId` | stock levels and movements (`warehouseId`) |
| Cardinality | — | not 1:1 with a branch: one central warehouse can serve three branches, or one branch hold two |

`defaultBranchId` is the soft link: the branch a movement here posts against by
default. It is nullable, and null is a real configuration ("central warehouse"),
not missing data — the UI says so in as many words rather than showing a dash.

## What it does

Under **Dashboard → Master Data → Warehouse** a permitted user can:

- **List** warehouses — paginated (20/page), with free-text search
  (name/address/PIC), a branch filter, an active/inactive filter and a "show
  deleted" toggle.
- **Create** a warehouse — name (required) plus optional branch, address, PIC
  name and PIC phone. A tenant may register its locations before it has the
  address or the PIC to hand.
- **Edit** a warehouse — details, plus a danger zone (delete, restore).

Two independent axes, exactly as on a branch: `isActive` (exists but is not
accepting movement; still owns its stock and history) and `deletedAt` (removed,
restorable). Deleting never touches `isActive`, so a restore returns the
warehouse in the state it was in.

### `isDefault` — read-only, and why the Delete button disappears

The warehouse auto-created with a branch carries `isDefault: true`. The backend
sets it and strips it from every payload, so the UI can never write it. It is
also what makes `DELETE` refuse **unconditionally** — a branch must keep one
stock location.

So a default warehouse renders a "Default" badge and **no Delete button**, in the
table and in the danger zone alike: a button whose only possible outcome is a 409
is worse than no button. Both places explain the alternative (deactivate it).
Editing a default warehouse — rename, address, PIC, branch, active — is allowed
and unchanged.

Reassigning which warehouse is a branch's default is **not possible from any
client**: the backend has no endpoint for it. See "Backend gaps" below.

## Delete guards, and the `reason` field

`DELETE /warehouses/:id` refuses with 409 in three cases, and the useful half of
each refusal arrives in the envelope's `reason`, not its `message`:

| Guard | message | reason |
|---|---|---|
| default warehouse | Cannot delete warehouse | This is the default warehouse of its branch… |
| still holds stock | Cannot delete warehouse | Warehouse still holds stock for N product(s)… |
| has movement history | Cannot delete warehouse | Warehouse has N stock movement(s) in its history… |

`apiClient` previously read only `message` and `details`, so all three collapsed
to "Cannot delete warehouse". Fixed as part of this feature, and it applies to
every feature:

- `ApiFailure.reason?: string` in `types/api.ts` (matches
  `PawCRM-Backend/src/utils/apiResponse.js`);
- `ApiError.reason` plus `ApiError.fullMessage` (`"message — reason"`, falling
  back to the message when no reason was sent);
- `api-client.ts` passes it through.

Warehouse screens show `fullMessage` everywhere an ApiError reaches a single
string slot. Other features are unaffected — they keep showing `message`, which
is unchanged.

## Routes

| Route | File | Screen |
|---|---|---|
| `/dashboard/master/warehouses` | `app/(dashboard)/dashboard/master/warehouses/page.tsx` | List (`WarehousesScreen`) |
| `/dashboard/master/warehouses/new` | `.../warehouses/new/page.tsx` | Create (`WarehouseCreateForm`) |
| `/dashboard/master/warehouses/[id]` | `.../warehouses/[id]/page.tsx` | Edit (`WarehouseEditForm`) |

The `[id]` route is an async Server Component that awaits the Next 16 `params`
Promise and passes the id to the client `WarehouseEditForm`. Each route is
wrapped in `RequirePermission` (`warehouses` / `warehouses:create` /
`warehouses:update`).

## Structure

- `features/warehouses/` — the feature module (barrel `index.ts`).
  - `hooks/useWarehouses.ts` — list query state
    (page/search/active/branch/deleted), loading/error, and `refetch` for
    post-mutation refresh. Any filter change resets to page 1.
  - `hooks/useWarehouseBranches.ts` — loads the branch list once and exposes
    `branchName(id)`. It exists because `GET /warehouses` returns
    `defaultBranchId` **unpopulated**; the table column and both forms' pickers
    need it. A failed branch load is non-fatal — the warehouse list still reads.
  - `components/` — `WarehousesScreen`, `WarehousesToolbar`, `WarehousesTable`,
    `WarehouseStatusBadge`, `WarehouseBranchSelect`, `WarehouseCreateForm`,
    `WarehouseEditForm`. Composes the shared `@/components` and shadcn/ui
    primitives; mirrors the branches feature.
- `services/warehouse.service.ts` — was `list`-only (a picker's lookup); now one
  typed method per endpoint (`list/getById/create/update/remove/restore`). `list`
  keeps its `limit: 100` default so the existing catalogue picker
  (`useCatalogLookups`) is unchanged, and now returns `PageResult<Warehouse>`
  rather than the slim `StockWarehouse` — `Warehouse` is structurally assignable
  to it, so every existing consumer compiles untouched.
- `types/api.ts` — `Warehouse`, `WarehouseListQuery`, `CreateWarehouseInput`,
  `UpdateWarehouseInput`, plus `ApiFailure.reason`.
- `utils/validation.ts` — `validateWarehouseName`, `validateWarehouseAddress`,
  `validatePicName`, `validatePicPhone` (limits mirror `warehouse.model.js`:
  120 / 255 / 120 / 32, same permissive phone pattern).
- `features/dashboard/nav.ts` + `components/icons.tsx` — the Master Data →
  Warehouse entry, gated on `warehouses:read`, with a shed-shaped
  `WarehouseIcon` deliberately unlike the multi-storey `BranchIcon`.

## Permissions

`warehouses: [create, read, update, delete, restore]` was already in
`features/permissions/types.ts` (mirroring the backend catalog) — no change was
needed. Gating follows the branches pattern: `RequirePermission` on the route,
`Can` on each button, and the Actions column hides entirely when no listed row
would render one.

## Tests

- `tests/warehouse.service.test.ts` — verb, URL and query per method.
- `tests/WarehousesTable.test.tsx` — row rendering, the central-warehouse label,
  delete/restore confirm flow, the 409 `reason` surfacing in the dialog, the
  missing Delete on a default warehouse, and the Actions-column gating.
- `tests/WarehouseCreateForm.test.tsx` — client validation, the create payload
  (explicit `null`s), a 409 alert, and a backend field error binding to its
  input.
- `tests/api-client.test.ts` — two cases for the new `reason` / `fullMessage`.
- `tests/nav.test.ts` — updated for the new Master Data child.

## Backend gaps (not implemented, would need API work)

None of these block the CRUD above; they bound what the UI can offer.

1. **Reassigning a branch's default warehouse.** `isDefault` is server-owned and
   stripped from every payload, and there is no `set-default` route. A default
   warehouse therefore can never be deleted by any means — only deactivated.
2. **Per-warehouse stock summary.** Nothing exposes "how many products / how much
   value sits here" (`stockUsageRepository` is internal to the delete guard), so
   the list cannot show a stock column.
3. **`defaultBranchId` is not populated** on list or detail. Worked around in the
   frontend (`useWarehouseBranches`); a `.populate("defaultBranchId", "name")`
   would remove the extra request.
4. **Filtering for central warehouses only.** `?defaultBranchId=` accepts an id,
   so there is no way to ask for the unassigned ones; the filter offers branches
   only.
5. **No bulk actions or export.**
