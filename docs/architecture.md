# Frontend Architecture

Next.js 16 App Router · TypeScript (strict) · Tailwind CSS 4 · React 19

---

## Data flow

```
Component        rendering and user interaction
    │
    ▼
  Hook           React state, effects, caching
    │
    ▼
 Service         typed domain calls  (customerService.list())
    │
    ▼
apiClient        the only module that calls fetch()
    │
    ▼
 Backend         PawCRM-Backend REST API
```

Each layer may only call the one below it. A component never calls
`apiClient`, and `apiClient` never knows about a domain concept.

---

## Folder structure

| Folder        | Holds                                              |
| ------------- | -------------------------------------------------- |
| `app/`        | Routes, layouts, pages. Routing only — no business logic |
| `components/` | Shared presentational components used by 2+ features |
| `features/`   | Self-contained feature modules                     |
| `hooks/`      | Shared React hooks                                 |
| `services/`   | API layer                                          |
| `types/`      | Shared TypeScript types                            |
| `utils/`      | Pure helpers, environment access                   |
| `tests/`      | Cross-cutting tests                                |
| `styles/`     | Global stylesheet                                  |

### Feature module shape

```
features/customers/
├── components/    UI specific to this feature
├── hooks/         state and data fetching
├── services/      thin wrapper over apiClient
├── types.ts
└── index.ts       public surface — other code imports only from here
```

A feature is self-contained. Code is promoted to the top-level
`components/` or `hooks/` only when a **second** feature genuinely needs it —
premature sharing produces components with a prop for every caller.

---

## Key decisions

### 1. One HTTP entry point

`services/api-client.ts` is the only module that calls `fetch`.

**Why:** authentication headers, token refresh, retries, timeouts and error
translation each need to exist exactly once. Scattered `fetch` calls make
every one of those a codebase-wide migration.

It also unwraps the backend's `{ success, data }` envelope, so callers
receive `T` and never destructure `.data` by hand.

### 2. Every failure is an `ApiError`

HTTP errors, network failures, timeouts and non-JSON responses all surface as
one type.

**Why:** without it, callers need three separate branches — a thrown
`TypeError` from `fetch`, a non-2xx status, and a body that failed to parse.
One type means one `catch`.

`ApiError` exposes intent rather than raw status codes:

- `isNetworkError` — request never reached the server
- `isUnauthorized` — 401, redirect to login
- `isValidationError` — 400 with field details
- `fieldErrors` — `Record<field, message>`, ready to bind to form inputs

### 3. Environment access is centralized and fails loudly

`utils/env.ts` is the only module that reads `process.env`.

Outside production the API base URL defaults to `http://localhost:5000/api`,
so a fresh clone runs with no setup. In production the variable is required
and its absence fails the **build**.

**Why:** a deployed frontend silently pointing at `localhost` fails
confusingly at runtime for users. Failing at build time is cheaper.

Note that Next.js inlines `NEXT_PUBLIC_*` at build time only for full literal
property accesses. `process.env[key]` is not replaced and would be
`undefined` in the browser — hence the literal reads in `utils/env.ts`.

### 4. `types/api.ts` mirrors the backend contract

The response envelope from `.claude/architecture.md` is declared once as
`ApiSuccess<T>` / `ApiFailure`, kept in sync with the backend by hand.

**Why:** a generated client would be better, but it needs an OpenAPI spec the
backend does not yet produce. Until then, one hand-maintained file is
honest and reviewable — and it is small.

### 5. `globals.css` lives in `styles/`, not `app/`

`create-next-app` places it in `app/`. Moved to `src/styles/` to match the
structure mandated by `.claude/rules.md`, imported via the `@/` alias in
`app/layout.tsx`.

---

## Testing

Jest + React Testing Library via `next/jest`, which supplies the SWC
transform, CSS and `next/font` mocking, `.env` loading and path aliases.

- **Component tests** — render, assert on accessible roles rather than
  class names or test IDs
- **Unit tests** — services and utilities with `fetch` mocked

`fetch` is always mocked, so the suite runs with no backend and no network.

Async Server Components are not testable under Jest (a known React/Jest
limitation). They need end-to-end coverage — Playwright is the likely choice
when the first one appears.

---

## Not yet built

Deliberately absent from the foundation branch:

- Authentication, session handling, protected routes
- Any business feature — no dashboard, login page or customer view
- State management beyond React's built-ins (add only when a real need
  appears; server state may well be handled by a data-fetching library
  rather than a global store)
- Design system and shared component library
- End-to-end tests
