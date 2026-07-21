/**
 * Typed, validated access to public environment variables.
 *
 * Next.js inlines NEXT_PUBLIC_* at build time, so these must be referenced
 * as full literal property accesses — `process.env[key]` is NOT replaced by
 * the compiler and would be undefined in the browser.
 *
 * Nothing outside this module should read process.env.
 */

const DEV_API_BASE_URL = "http://localhost:5000/api";

/**
 * Resolves the backend base URL.
 *
 * Outside production the local backend is a safe default, so a fresh clone
 * runs with no setup. In production the value must be explicit: silently
 * pointing a deployed frontend at localhost would fail confusingly at
 * runtime rather than loudly at build time.
 */
function resolveApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (configured) {
    // Trailing slash would produce "//api/health" once joined with a path.
    return configured.replace(/\/+$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Missing NEXT_PUBLIC_API_BASE_URL. Set it in the deployment environment " +
        "(see .env.example) — it is required for production builds.",
    );
  }

  return DEV_API_BASE_URL;
}

export const env = {
  /** Base URL of the PawCRM backend, including the /api prefix. */
  apiBaseUrl: resolveApiBaseUrl(),
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",
} as const;
