# Permission Gating (RBAC-aware UI)

Frontend-only. Hides navigation, buttons and pages the signed-in user's role has
no permission for. Branch: `feature/project-initialization`.

A **UX guard, not a security boundary** — the backend still authorizes every
request. This only spares a user actions and screens their role cannot use.

## What it does

- **Navigation** — a Master Data child (User / Branch / Roles) disappears from
  the sidebar unless the role has the matching `*:read`. The Master Data group
  hides entirely when none of its children are permitted. Sections without a
  catalog feature yet (Dashboard, Booking, Inventory, POS, Sales) are never
  gated.
- **Actions** — create buttons and row actions (edit / delete / restore /
  unlock) render only when the role holds the matching action.
- **Pages** — direct-URL entry to a Master route without the required
  permission shows an **Access denied** panel instead of a non-functional
  screen (`*:read` for lists/edits, `*:create` for the new-record routes).

## Where permissions come from

The signed-in user's effective grants arrive with the **auth payload**:
`/api/auth/login` and `/api/auth/me` return, alongside `user` and `session`:

```jsonc
{
  "permissions": [{ "feature": "users", "actions": ["read", "create"] }],
  "isSuperAdmin": false
}
```

`AuthProvider` stores these and exposes them on the auth context — no extra
fetch. Both fields default safely (`[]` / `false`) if absent, so the UI degrades
to "deny" rather than breaking. A `roleId: null` user has an empty grant set;
`isSuperAdmin: true` passes every check.

> The `permissions` / `isSuperAdmin` fields are hand-synced in `types/api.ts`
> (`AuthPermissions`), the same convention the rest of the response contract
> uses. The backend `getMe` / `login` were extended to resolve the user's role
> (`roleRepository.findById(tenantId, roleId)`) and emit these fields — see
> `PawCRM-Backend/src/services/auth.service.js` (`#authPermissions`).

## Structure

- `features/permissions/` — the feature module (barrel `index.ts`).
  - `types.ts` — `PERMISSION_CATALOG` (mirrors the backend catalog:
    `tenants` / `branches` / `users` / `roles`), the `Feature` / `Action`
    unions, `PermissionRequirement`, and `permissionKey`.
  - `usePermissions.ts` — reads the auth context, builds an O(1)
    `"feature:action"` lookup set, and returns `{ can, canAny, canAll,
    isSuperAdmin }`.
  - `Can.tsx` — `<Can feature=… action=…>` render gate (action may be an array →
    ANY-of), with optional `fallback`.
  - `RequirePermission.tsx` — page guard rendering the Access-denied panel when
    the required permission is missing.
- `features/auth/context/AuthProvider.tsx` — now holds `permissions` +
  `isSuperAdmin`, set from the login/me payload and cleared on sign-out.
- `features/dashboard/nav.ts` — nav items gained an optional `permission`;
  `filterNavItems(items, can)` is the pure filter the `Sidebar` memoizes.
- `types/api.ts` — `AuthPermissions`, extended `LoginPayload` / `MePayload`.

## Consuming it

```tsx
// A button
<Can feature="users" action="create">
  <NewUserButton />
</Can>

// A page (in the route's page.tsx)
<RequirePermission feature="users">
  <UsersScreen />
</RequirePermission>

// Imperatively
const { can } = usePermissions();
if (can("roles", "delete")) { /* … */ }
```

## Permission map

| Area | Requirement |
|---|---|
| Nav → User / Branch / Roles | `users:read` / `branches:read` / `roles:read` |
| New user / branch / role | `users:create` / `branches:create` / `roles:create` |
| Edit route + row Edit | `*:update` |
| Row Delete / Restore | `*:delete` / `*:restore` |
| Row Unlock (users) | `users:unlock` |

## Testing

- `tests/nav.test.ts` — `filterNavItems` (ungated items survive, groups collapse
  when empty, no source mutation).
- `tests/permissions.test.tsx` — `usePermissions` (grant match, empty-set deny,
  super-admin bypass), `Can` (permit / fallback / ANY-of array),
  `RequirePermission` (page vs. access-denied).
- `tests/helpers/renderWithAuth.tsx` — renders a component inside a stub
  AuthContext; existing table tests use it (default super-admin) so gated
  actions remain present.

Verified: `npm test` (101 passing), `npm run type-check`, `npm run lint`,
`npm run build` — all clean.
