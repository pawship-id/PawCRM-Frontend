# Changelog

All notable changes to the PawCRM frontend.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

Branch: `feature/project-initialization`.

### Added

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
