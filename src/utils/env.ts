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
 * Buloo's own WhatsApp number, in the form `wa.me` wants: country code first,
 * digits only, no `+` and no spaces.
 *
 * HARD-CODED AS THE FALLBACK rather than left empty, for the same reason the
 * API base URL has one — a fresh clone has no `.env.local` (it is gitignored),
 * and a landing page whose only contact button links to `wa.me/` is worse than
 * one nobody configured.
 */
const DEFAULT_WHATSAPP_NUMBER = "62895358614848";

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

/**
 * Normalises whatever was configured into what `wa.me` accepts.
 *
 * DIGITS ONLY, and that is the whole rule. Somebody setting this in a hosting
 * dashboard will reasonably type `+62 895-3586-14848` — the shape a person
 * reads — and `wa.me/+62 895…` opens a broken link, silently, on the one button
 * a prospect presses. Stripping is cheaper than a validation error nobody sees.
 *
 * A value that strips down to nothing falls back to the default: an empty
 * number would render a link to `wa.me/`, which is a real page and not ours.
 */
function resolveWhatsappNumber(): string {
  const digits = (process.env.NEXT_PUBLIC_PHONE_NUMBER ?? "").replace(
    /\D/g,
    "",
  );

  return digits || DEFAULT_WHATSAPP_NUMBER;
}

export const env = {
  /** Base URL of the PawCRM backend, including the /api prefix. */
  apiBaseUrl: resolveApiBaseUrl(),
  /** Buloo's WhatsApp number, digits only — ready to append to `wa.me/`. */
  whatsappNumber: resolveWhatsappNumber(),
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",
} as const;
