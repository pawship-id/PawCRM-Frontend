# Customer Management (Master Data → Customer)

Frontend CRUD for customers — the people a tenant does business with (pet owners,
buyers, clients) — wired to the already-existing `/api/customers` API.
Branch: `feature/project-initialization`.

## What it does

Under **Dashboard → Master Data → Customer** a permitted user can:

- **List** customers — paginated, with free-text search (name/email/phone),
  Kategori / Jenis / Status filters, and a "show deleted" toggle.
- **Create** a customer — name (required) plus optional email, phone and
  address. A walk-in can be recorded with just a name.
- **Edit** a customer — details, plus a danger zone (delete, restore).
- **Tag** a customer (26 October 2026) — free-form labels in the create and edit
  form, just above Catatan, with the tenant's tags already in use offered as
  one-press suggestions (`GET /customers/tags`). **A label only** (BO decision):
  the tags show as `#chips` on the customer profile (a dash when there are none)
  and nowhere else — no list filter, no table column, nothing on a booking or at
  the till.

### Customer tags

- Normalised client-side exactly as the server does, and as pet tags are: trim,
  lowercase, a leading `#` dropped, spaces → hyphens, duplicates ignored. Same
  limits as pet tags — at most `MAX_TAGS` (10) per customer, `TAG_MAX_LENGTH`
  (40) characters each.
- The control is the shared `TagField` from `@/components` (`components/form/
  TagField.tsx`), promoted out of the pet Preferensi tab when customers became
  its second caller; `PetPreferencesTab` uses it too. Enter adds a tag, it does
  not submit the form.
- The form always sends `tags` on create and edit (the whole form is PATCHed);
  an emptied list is sent as `[]`, which clears them.
- Suggestions failing to load is silent — a tag can still be typed.

A customer's lifecycle is shown as one badge (`CustomerStatusBadge`):
**Terhapus** (soft-deleted) beats **Nonaktif** (`isActive === false`) beats
**Aktif** — the same `isActive`/`deletedAt` pair a branch has. The old VIP tier
was removed on 26 October 2026; membership cards are what mark a member now.

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
  - `hooks/useCustomers.ts` — list query state
    (page/search/category/kind/status/deleted), loading/error, and `refetch`
    for post-mutation refresh. Any filter change resets to page 1.
  - `components/` — `CustomersScreen`, `CustomersToolbar`, `CustomersTable`,
    `CustomerCreateForm`, `CustomerEditForm`, `CustomerStatusBadge`. Composes
    the shared `@/components` and shadcn/ui `components/ui/*` primitives;
    mirrors the branches feature.
- `services/customer.service.ts` — one typed method per endpoint
  (`list/getById/create/update/remove/restore/tags`) over `apiClient`.
- `types/api.ts` — `Customer`, `CustomerListQuery`, `CreateCustomerInput`,
  `UpdateCustomerInput`.
- `utils/validation.ts` — `validateCustomerName`, `validateOptionalEmail`,
  `validateCustomerPhone`, `validateCustomerAddress` (mirror the backend bounds;
  the server remains the authority via `ApiError.fieldErrors`).

## API

All routes require authentication and the matching `customers` permission.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/customers` | List — `page, limit, search, customerTypeId, kind, isActive, includeDeleted` |
| `GET` | `/api/customers/tags` | The tenant's customer tags in use, sorted — a bare `string[]` (suggestions) |
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
  email), create + redirect, and duplicate-email conflict surfacing; tags —
  Enter adds a normalised tag without submitting, duplicates ignored, picking a
  suggestion, removing a chip, `tags` in the payload, suggestions failing.
- `tests/CustomerEditForm.test.tsx` — the edit form seeds the stored tags, sends
  them back, hides suggestions already carried, and sends `[]` to clear.
- `tests/CustomerProfileScreen.test.tsx` — the Tag row shows chips, or a dash.
- `tests/nav.test.ts` — Customer appears in Master Data under the right grant.
- Backend `tests/customer.api.test.js` updated so the acting user holds the new
  `customers` grant; the full backend suite (646 tests) passes.
