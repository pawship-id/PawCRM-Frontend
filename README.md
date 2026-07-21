# PawCRM Frontend

Web client for PawCRM, a multi-tenant SaaS CRM.

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · React 19

---

## Path note

`.claude/rules.md` refers to this project as `frontend/`. On disk the folder
is **`PawCRM-Frontend/`**, and it is its own git repository with its own
remote. Wherever the rules say `frontend/src`, read `PawCRM-Frontend/src`.

The backend lives in a separate repository, `PawCRM-Backend`.

---

## Requirements

- Node.js >= 18
- The PawCRM backend running (default `http://localhost:5000`)

## Setup

```bash
npm install
cp .env.example .env.local   # optional in development
```

`NEXT_PUBLIC_API_BASE_URL` defaults to `http://localhost:5000/api` outside
production, so a fresh clone runs with no configuration. It is **required**
for production builds — see `src/utils/env.ts`.

## Running

```bash
npm run dev     # http://localhost:3000
npm run build
npm start
```

## Testing

```bash
npm test
npm run test:watch
npm run test:coverage
```

Jest + React Testing Library, wired through `next/jest`. `fetch` is mocked,
so **no backend is required** to run the suite.

## Code quality

```bash
npm run lint
npm run type-check
```

TypeScript runs in strict mode.

---

## Architecture

Feature-based. A feature owns its components, hooks and types; only genuinely
shared code moves up into the top-level folders.

```
src/
├── app/          App Router routes, layouts, pages
├── components/   shared presentational components (no business logic)
├── features/     self-contained feature modules
├── hooks/        shared React hooks
├── services/     API layer — the only place that talks HTTP
├── types/        shared TypeScript types
├── utils/        pure helpers, environment access
├── tests/        cross-cutting tests
└── styles/       global stylesheet
```

### Data flow

```
Component → Hook → Service → apiClient → Backend
```

Components render. Hooks hold React state and lifecycle. Services expose
typed domain calls. `apiClient` is the only module that calls `fetch`.

**Never call `fetch` directly from a component.** Everything routes through
`services/api-client.ts` so base URL, timeouts, error translation and (soon)
authentication live in one place.

### API layer

`services/api-client.ts`:

- prefixes the configured base URL
- unwraps the backend's `{ success, data }` envelope so callers receive `T`
- converts **every** failure — HTTP error, network failure, non-JSON body,
  timeout — into a single `ApiError`
- times out after 15 s by default

```ts
import { apiClient } from "@/services/api-client";
import { ApiError } from "@/services/api-error";

try {
  const customers = await apiClient.get<Customer[]>("/customers", {
    query: { page: 1, limit: 20 },
  });
} catch (error) {
  if (error instanceof ApiError) {
    if (error.isUnauthorized) redirectToLogin();
    if (error.isValidationError) setFieldErrors(error.fieldErrors);
  }
}
```

`error.fieldErrors` maps directly onto form field names — the backend's
`body.` / `params.` / `query.` prefix is stripped for you.

### Types

`types/api.ts` mirrors the backend response contract from
`.claude/architecture.md`. If the envelope changes in the backend, it changes
here in the same pull request.

---

## Adding a feature

Work on a `feature/<name>` branch, never `main`.

```
src/features/customers/
├── components/
├── hooks/
├── services/      # thin wrapper over apiClient
├── types.ts
└── index.ts       # public surface of the module
```

Then add the route under `src/app/`. Promote code to the top-level
`components/` or `hooks/` only once a second feature actually needs it.

---

## Notes

- `AGENTS.md` ships with `create-next-app` and warns that Next.js 16 differs
  from older versions. The authoritative docs are bundled in
  `node_modules/next/dist/docs/`.
- `npm audit` reports 2 moderate advisories from a `postcss` version nested
  inside `next`. There is no fix short of downgrading Next.js to v9, which
  is not viable. It is a build-time dependency, not shipped to the browser.
