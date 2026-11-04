import type { HelpRoute } from "./types";

const HELP_BASE = "/dashboard/help";

/**
 * The guide page for the screen at `pathname` — what the top bar's ? opens.
 *
 * 1. A route the guide explains → its article.
 * 2. A screen it does not, under a route it does (a new tab inside Kasir) → the
 *    nearest explained ancestor's MODULE page, not its article: the article is
 *    about a different screen, the module page at least lists the right ones.
 * 3. Anything else → the guide's home.
 *
 * Patterns are matched segment by segment, `[param]` matching any one segment,
 * and an exact static match beats a parameter (`/inventory/products/new` must
 * not read as product `new`).
 */
export function helpHrefFor(pathname: string, routes: HelpRoute[]): string {
  const path = stripTrailingSlash(pathname.split(/[?#]/)[0] ?? "");
  if (path === HELP_BASE || path.startsWith(`${HELP_BASE}/`)) return HELP_BASE;

  const exact = bestMatch(path, routes);
  if (exact) return `${HELP_BASE}/${exact.module}/${exact.article}`;

  const segments = path.split("/");
  // Stop above "/dashboard" itself: every screen is under it, so it says nothing.
  for (let length = segments.length - 1; length > 2; length--) {
    const ancestor = bestMatch(segments.slice(0, length).join("/"), routes);
    if (ancestor) return `${HELP_BASE}/${ancestor.module}`;
  }
  return HELP_BASE;
}

function bestMatch(path: string, routes: HelpRoute[]): HelpRoute | undefined {
  let best: { route: HelpRoute; params: number } | undefined;
  for (const route of routes) {
    const params = matchPattern(route.pattern, path);
    if (params === null) continue;
    if (!best || params < best.params) best = { route, params };
  }
  return best?.route;
}

/** The number of `[param]` segments used to match, or null for no match. */
function matchPattern(pattern: string, path: string): number | null {
  const want = pattern.split("/");
  const have = path.split("/");
  if (want.length !== have.length) return null;
  let params = 0;
  for (let i = 0; i < want.length; i++) {
    if (/^\[.+\]$/.test(want[i]!)) {
      if (!have[i]) return null;
      params++;
    } else if (want[i] !== have[i]) {
      return null;
    }
  }
  return params;
}

function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}
