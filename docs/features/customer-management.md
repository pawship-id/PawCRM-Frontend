# Customer Management (Master Data → Customer)

Frontend CRUD for customers — the people a tenant does business with (pet owners,
buyers, clients) — wired to the already-existing `/api/customers` API.
Branch: `feature/project-initialization`.

## What it does

Under **Dashboard → Master Data → Customer** a permitted user can:

- **List** customers — paginated, with free-text search (name/email/phone), a VIP
  tier filter, and a "show deleted" toggle.
- **Create** a customer — name (required) plus optional email, phone, address and
  VIP tier. A walk-in can be recorded with just a name.
- **Edit** a customer — details, plus a danger zone (delete, restore).

A customer has two independent axes, shown as two badges: its **VIP tier**
(bronze / silver / gold / platinum, usually absent) and whether it is
soft-deleted. Unlike a branch, a customer has no active/inactive state.

Email is optional but **unique per tenant** — the backend returns 409 on a
duplicate (create) or on a restore whose email has since been taken; both surface
inline / as an alert.

## Routes

| Route | File | Screen |
|---|---|---|
| `/dashboard/master/customers` | `app/(dashboard)/dashboard/master/customers/page.tsx` | List (`CustomersScreen`) |
| `/dashboard/master/customers/new` | `.../customers/new/page.tsx` | Create (`CustomerCreateForm`) |
| `/dashboard/master/customers/[id]` | `.../customers/[id]/page.tsx` | Edit (`CustomerEditForm`) |

The `[id]` route is an async Server Component that awaits the Next 16 `params`
Promise and passes the id to the client `CustomerEditForm`.

## Structure

- `features/customers/` — the feature module (barrel `index.ts`).
  - `hooks/useCustomers.ts` — list query state (page/search/vipTier/deleted),
    loading/error, and `refetch` for post-mutation refresh. Any filter change
    resets to page 1.
  - `components/` — `CustomersScreen`, `CustomersToolbar`, `CustomersTable`,
    `CustomerCreateForm`, `CustomerEditForm`, `VipTierSelect`, `CustomerVipBadge`
    /`CustomerStatusBadge`. Composes the shared `@/components` and shadcn/ui
    `components/ui/*` primitives; mirrors the branches feature.
- `services/customer.service.ts` — one typed method per endpoint
  (`list/getById/create/update/remove/restore`) over `apiClient`.
- `types/api.ts` — `VipTier`, `Customer`, `CustomerListQuery`,
  `CreateCustomerInput`, `UpdateCustomerInput`.
- `utils/validation.ts` — `validateCustomerName`, `validateOptionalEmail`,
  `validateCustomerPhone`, `validateCustomerAddress` (mirror the backend bounds;
  the server remains the authority via `ApiError.fieldErrors`).

## API

All routes require authentication and the matching `customers` permission.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/customers` | List — `page, limit, vipTier, search, includeDeleted` |
| `GET` | `/api/customers/:id` | Read one |
| `POST` | `/api/customers` | Create (201) |
| `PATCH` | `/api/customers/:id` | Partial update (rejects empty body) |
| `DELETE` | `/api/customers/:id` | Soft delete |
| `PATCH` | `/api/customers/:id/restore` | Restore a soft-deleted customer |

## Permissions

Customer is gated on a new `customers` RBAC feature with the standard actions
(`create/read/update/delete/restore`):

- **Backend** — `customers` added to the code catalog
  (`config/permissionCatalog.js`); every `/api/customers` route enforces
  `requirePermission("customers", …)`, mirroring `/api/audit-logs`; the seeded
  **Manager** role gets all actions and **Staff** gets `read`.
- **Frontend** — `PERMISSION_CATALOG` hand-synced to match. The nav item, page
  guards (`<RequirePermission feature="customers">`), the "New customer" button,
  and each row action (`<Can>`) hide when the role lacks the grant. This is a UX
  guard; the backend is the security authority.

## Testing

- `tests/CustomerCreateForm.test.tsx` — validation gate (required name, invalid
  email), create + redirect, and duplicate-email conflict surfacing.
- `tests/nav.test.ts` — Customer appears in Master Data under the right grant.
- Backend `tests/customer.api.test.js` updated so the acting user holds the new
  `customers` grant; the full backend suite (646 tests) passes.
