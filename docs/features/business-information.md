# Business Information (tenant detail)

The signed-in user's own business, read-only, at **`/dashboard/business`**,
reached from the **account dropdown** in the top bar (below _My profile_).
Branch: `feature/inventory-purchasing`.

`/dashboard/profile` answers "who am I". Nothing answered "what business am I
in, and how is it configured" — not its timezone, not its currency, not whether
the trial has days left on it. This screen is that answer, and it is the
organizational counterpart of the profile page.

**Not in the sidebar, on purpose.** The two questions this menu answers belong
together, and Master Data is where a user MAINTAINS records — nothing on this
screen is editable, so it would have been the one entry in that group that leads
nowhere you can act.

## What it shows

Four cards, all fed by one read:

- **Business profile** — logo (or the name's initials), name, slug,
  timezone, currency, tenant id. The slug carries a hint explaining that it is a
  public URL identifier and is **not** re-derived when the business is renamed,
  because that is the field most likely to be misread as cosmetic.
- **Subscription** — status badge, plan, and the trial deadline as a
  **sentence**: `12 Aug 2026, 19.56 (10 day(s) left)`. A deadline that has
  already passed is reported as `(ended 3 day(s) ago)` rather than clamped to
  zero — a lapsed trial on an account still marked `trialing` is exactly the
  state an owner needs to see.
- **Settings** — `hotelMode`, in words (`Numbered cages` / `Named zones`)
  rather than the stored enum.
- **Record** — created / last updated, and the account currently signed in.

Every instant is formatted **in the tenant's own timezone**, which is what the
`timezone` field is for: a business in `Asia/Jakarta` reading its trial deadline
on a laptop still set to UTC would otherwise be shown a date that is a day out at
either end of the day. An unsupported zone falls back to the browser's — a
wrong-looking date beats a screen that will not render.

A tenant that was soft-deleted while the session is still live gets a **Deleted**
badge, because the backend will `404` the next read and saying so first is
kinder than the blank screen that follows.

## Read-only, on purpose

There is no edit form and no `update` in `services/tenant.service.ts`. Renaming a
business, changing its slug or moving its timezone are not per-user preferences:
the slug is a public URL identifier existing links depend on, and the timezone
re-anchors every report and every stock movement date the tenant has. Those
edits live behind `PATCH /api/tenants/:id`, which is **platform-owner**
administration today. This screen answers the question staff actually ask and
never pretends to be more.

For the same reason the service exposes only `me()`: the rest of
`/api/tenants` administers *other* businesses, and a method for it here would
invite a screen that has no business existing in a tenant's own app.

## Permissions

Gated on **`tenants:read`**, in three places that must agree:

| Layer                           | Effect without the grant                   |
| ------------------------------- | ------------------------------------------ |
| `UserMenu` dropdown entry       | the item does not appear                   |
| `RequirePermission` on the page | direct URL entry shows **Access denied**   |
| `GET /api/tenants/me`           | `403` — the authority the other two mirror |

No seeded role but **Owner** holds `tenants:read`, and Owner holds it by the
`isSuperAdmin` bypass rather than an explicit grant. That is deliberate rather
than an oversight: the screen shows the subscription plan and billing state, so
an owner delegates it explicitly through Master Data → Roles rather than every
member of the business seeing it by default.

## Structure

- `app/(dashboard)/dashboard/business/page.tsx` — Server Component shell: the
  heading and the `RequirePermission` guard, nothing else. There is nothing to
  await (the tenant comes from the session on the client's first call).
- `features/auth/components/UserMenu.tsx` — the **Business information** entry,
  below _My profile_ and above _Logout_, rendered only when `can("tenants",
  "read")`.
- `features/tenant/` — the feature module (barrel `index.ts`).
  - `hooks/useTenant.ts` — one fetch on mount, no polling; `refetch` exists for
    the error state's **Try again**. A tenant's name and plan change about as
    often as the business is renamed.
  - `components/TenantDetail.tsx` — the four cards, the timezone-aware date
    formatting, the trial sentence, the logo/initials fallback, and the
    `DetailList` label/value grid (the `ProfileSummary` `dl` shape plus a hint
    line, which the tenant fields need).
  - `components/TenantSubscriptionBadge.tsx` — status badge. The three unhappy
    states are **not** collapsed into one colour: `past_due` is a bill to pay,
    `suspended` means the service is already withheld, and `cancelled` is the end
    of the relationship. The palette has no `warning` token, so `past_due` uses
    the peach `secondary` that `ExpiryBadge` already uses for caution.
- `services/tenant.service.ts` — `me()` → `GET /tenants/me`. No id parameter, by
  design: the backend derives the tenant from the session cookie.
- `types/api.ts` — `Tenant`, `TenantSubscription`, `TenantSettings`, hand-synced
  with the backend model like the rest of the response contract.
- `components/icons.tsx` — `BusinessIcon`, a storefront. Deliberately unlike
  `BranchIcon` (a multi-storey building) and `WarehouseIcon` (a pitched shed):
  the tenant is the business as a whole and its branches are its buildings.

## How to test

Automated:

```bash
npm test -- TenantDetail tenant.service UserMenu
```

`TenantDetail.test.tsx` (8 tests) mocks `tenantService.me` and covers the loaded
profile, the status/plan/hotel-mode wording, both directions of the trial
countdown, the initials fallback, the deleted badge, the signed-in account line,
and the failure → **Try again** path. `UserMenu.test.tsx` (3 tests) covers the
dropdown entry appearing with the grant, being absent without it, and closing
the menu on click.

Manually, signed in as an Owner:

1. Open the account dropdown → **Business information**. Every field matches the
   tenant document.
2. Sign in as a Staff user — the dropdown entry is gone, and `/dashboard/business`
   shows **Access denied**.
3. Grant `tenants:read` to that role in Master Data → Roles, sign in again: both
   the entry and the screen appear.
