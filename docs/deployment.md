# Deployment

## Environment variables

| Variable                   | Required        | Default (non-production)     | Notes                            |
| -------------------------- | --------------- | ---------------------------- | -------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL` | **in production** | `http://localhost:5000/api` | Backend base URL, `/api` included |

`NEXT_PUBLIC_*` variables are **inlined into the client bundle at build
time** and are visible to anyone who opens the site. Never put a secret,
token or database credential in one.

Because they are baked in at build time, changing the API URL requires a
rebuild — not just a restart.

Production builds fail fast if `NEXT_PUBLIC_API_BASE_URL` is unset, rather
than shipping a bundle that points at `localhost`.

---

## Build

```bash
npm ci
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api npm run build
npm start
```

`npm ci` installs exactly what `package-lock.json` pins — reproducible,
unlike `npm install`.

---

## CORS

The backend restricts origins via its own `CORS_ORIGIN` variable. It must
name this frontend's deployed origin, or every request fails in the browser.

| Environment | Frontend origin         | Backend `CORS_ORIGIN`   |
| ----------- | ----------------------- | ----------------------- |
| Development | `http://localhost:3000` | `http://localhost:3000` |
| Production  | `https://app.example.com` | `https://app.example.com` |

`apiClient` sends `credentials: "include"`, so once authentication uses
cookies the backend must keep `credentials: true` in its CORS config and
name an exact origin — a wildcard is invalid with credentials.

---

## Pre-deployment checklist

- [ ] `NEXT_PUBLIC_API_BASE_URL` points at the production backend over HTTPS
- [ ] Backend `CORS_ORIGIN` names this frontend's origin
- [ ] `npm run build` succeeds
- [ ] `npm test` passes
- [ ] `npm run type-check` is clean
- [ ] `npm run lint` is clean
- [ ] No secret in any `NEXT_PUBLIC_*` variable
- [ ] `.env.local` is not in the image or the repository

---

## Known advisories

`npm audit` reports 2 moderate advisories from a `postcss` version nested
inside `next`. The only offered remediation downgrades Next.js to v9, which
is not viable. It is a build-time dependency and is not shipped to the
browser. Re-check when Next.js publishes an updated release.

---

## Not yet configured

- Hosting platform
- CI/CD pipeline
- Error tracking and analytics
- Preview/staging environment
- Custom domain and CDN caching
