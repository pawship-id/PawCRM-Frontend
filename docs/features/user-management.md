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

| Route                          | File                                              | Screen                    |
| ------------------------------ | ------------------------------------------------- | ------------------------- |
| `/dashboard/master/users`      | `app/(dashboard)/dashboard/master/users/page.tsx` | List (`UsersScreen`)      |
| `/dashboard/master/users/new`  | `.../users/new/page.tsx`                          | Create (`UserCreateForm`) |
| `/dashboard/master/users/[id]` | `.../users/[id]/page.tsx`                         | Edit (`UserEditForm`)     |

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

## The roster card — `RosterSection`

Added with FR-4/FR-6 and not covered above. It sets **when somebody cannot be
booked** and **what they earn**, on the user edit screen.

**Both fields had been storable since this module shipped and neither had a
screen.** `users.availability` and `users.commissionRate` were validated,
editable through the API, and read by nothing — until the booking module made the
first load-bearing (it decides who may be booked) and the second decide what
somebody is paid. That is the recurring shape in this codebase: *master data with
no reader*, and later *a reader with no writer*.

| Control | Notes |
| --- | --- |
| **Groomer** | `isGroomer` — can this person be assigned an animal. It decides who appears in the booking form's dropdown, who gets a calendar column, and who the booking list filters by. **Not a role**: a role says what somebody may DO in this system, this says what they do in the SHOP, and an owner who grooms on Saturdays is both |
| **Libur mingguan** | Checkboxes in JavaScript's day numbering — 0 is Sunday, 3 is Wednesday. A friendlier numbering would be a translation layer with one job: to be got wrong once, quietly, on somebody's day off |
| **Cuti tanggal tertentu** | A start date and an **optional** "sampai". A range is expanded here into individual days — see below |
| **Komisi** | `percentage`, `fixed`, `matrix`, or none. Only the meaningful key is sent: the server forbids `value` beside a matrix and `matrix` beside a percentage |
| **Rate per layanan** | The matrix editor. A row is a service picked from the catalogue and a percent |

**A leave RANGE is a typing convenience, not a storage shape.** `leaveDates` is a
list of days and stays one. Storing an interval would need every reader —
`offReason`, the clash check, the calendar — to learn about intervals, and each is
a place to get an off-by-one wrong on somebody's last day off. Expanded with
`setDate` rather than adding milliseconds, which breaks across a daylight-saving
boundary; Indonesia has none, but this component has no business knowing that.

**A matrix row's key is a SERVICE ID, not a label.** It was free text once, and
`backfillCommissionMatrixKeys.js` exists to clean up after that. The picker is
what keeps the ids ids — a text box here would re-open exactly what that migration
closed. **A service with no row earns nothing**, which the form says above the
list rather than leaving it to be discovered on a payslip.

**Adding leave asks what it would strand, before the save** (kriteria 4.9).
Marking somebody off for next Wednesday when they already have four animals booked
is a decision, not a typo — so the affected bookings are shown and the save is
still allowed. A form that refused would send that decision somewhere this system
cannot see. The whole range is checked in **one** request: asking per day would be
seven round trips and seven warnings a reader has to add up.

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
