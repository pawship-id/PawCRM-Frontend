# User Management (Master Data → User)

Frontend CRUD for staff users, wired to the already-existing `/api/users` API.
Branch: `feature/project-initialization`.

## What it does

Under **Dashboard → Master Data → User** an admin can:

- **List** staff users — paginated, with free-text search (name/email/phone), a
  status filter (active/suspended), and a "show deleted" toggle.
- **Create** a user — email, password, full name, optional phone, an optional
  role, and a required branch scope (all branches, or specific branches).
- **Edit** a user — details, plus dedicated controls for status
  (activate/suspend), an administrative password reset, and a danger zone
  (delete, restore, unlock).

## Routes

| Route | File | Screen |
|---|---|---|
| `/dashboard/master/users` | `app/(dashboard)/dashboard/master/users/page.tsx` | List (`UsersScreen`) |
| `/dashboard/master/users/new` | `.../users/new/page.tsx` | Create (`UserCreateForm`) |
| `/dashboard/master/users/[id]` | `.../users/[id]/page.tsx` | Edit (`UserEditForm`) |

The `[id]` route is the app's first dynamic segment. In Next 16 `params` is a
Promise, so the page is an async Server Component that awaits it and passes the
id to the client form.

## Structure

- `features/users/` — the feature module (barrel `index.ts`).
  - `hooks/useUsers.ts` — list query state (page/search/status/deleted),
    loading/error, and `refetch` for post-mutation refresh.
  - `hooks/useLookups.ts` — loads roles + branches once for the form pickers.
  - `components/` — `UsersScreen`, `UsersToolbar`, `UsersTable`, `Pagination`,
    `UserCreateForm`, `UserEditForm`, `RoleSelect`, `BranchScopeField`,
    `StatusBadge`, `ConfirmDialog`. These compose the shadcn/ui primitives in
    `components/ui/*` — `Table` (list), `Dialog` (confirmations), `Select`
    (role + status), `RadioGroup`/`Checkbox` (branch scope), `Badge` (status);
    icons from `lucide-react`.
- `services/user.service.ts` — extended with `list`, `getById`, `create`,
  `update`, `setStatus`, `unlock`, `remove`, `restore`.
- `services/role.service.ts`, `services/branch.service.ts` — read-only lookups.
- `types/api.ts` — `PageResult<T>` (the nested list envelope), `UserListQuery`,
  `CreateUserInput`, `UpdateUserInput`, `Role`, `Branch`; `User` gained
  `lockedUntil` and `deletedAt` (both returned by the list/read endpoints).

Forms follow the established hand-rolled pattern (see `ProfileForm`): local
`useState`, client validation from `utils/validation.ts`, and
`ApiError.fieldErrors` mapped onto inputs so backend validation surfaces inline.
The inputs/buttons/cards/alerts are the shadcn/ui-backed `@/components`
primitives (`TextField` composes shadcn `Input` + `Label`).

## API consumed (no backend change)

`GET/POST /users`, `GET/PATCH/DELETE /users/:id`, `PATCH /users/:id/password`,
`/users/:id/status`, `/users/:id/unlock`, `/users/:id/restore`, and
`GET /roles`, `GET /branches`. The session cookie carries auth and tenant scope;
the frontend never sends `tenantId`.

## How to test

- `npm test` — service tests (`users.service`, `lookup.service`) and component
  tests (`UserCreateForm`, `UsersTable`) run fully mocked, no backend needed.
- `npm run type-check`, `npm run lint`, `npm run build` — all clean.
- Manual (backend on `:5000`, signed in): create with a duplicate email to see
  the inline conflict; edit status/password; delete then toggle "show deleted"
  and restore.
