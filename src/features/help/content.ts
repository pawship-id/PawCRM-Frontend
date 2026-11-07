import { HELP_MODULES, HELP_RELEASE } from "@/content/help";

import type { HelpArticle, HelpModule, HelpRelease } from "./types";

/**
 * Read access to the generated guide, for the server-rendered help pages.
 *
 * SERVER-SIDE ONLY by convention: `HELP_MODULES` statically imports every
 * module's JSON (~1 MB of article HTML). The pages are built at build time from
 * it, so none of that reaches the browser — a client component importing this
 * file would ship all of it. Client code gets the small `route-map.json` and the
 * lazily loaded `search.json` instead.
 */

export const HELP_BASE = "/dashboard/help";

export interface HelpGroup {
  key: string;
  label: string;
  modules: HelpModule[];
}

/**
 * The home page's three shelves, following the manual's own "Daftar Buku
 * Panduan": book 00 first, 01–04 are set up once by the owner, 05 onwards is
 * the daily work.
 */
const GROUPS: { key: string; label: string; from: number; to: number }[] = [
  { key: "mulai", label: "Mulai dari sini", from: 0, to: 0 },
  { key: "pengaturan", label: "Pengaturan awal", from: 1, to: 4 },
  { key: "harian", label: "Pekerjaan sehari-hari", from: 5, to: Infinity },
];

export function helpRelease(): HelpRelease {
  return HELP_RELEASE;
}

/** "2026-11-04" → "4 November 2026". A calendar date, so no time zone shifts it. */
export function formatHelpDate(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

export function helpModules(): HelpModule[] {
  return HELP_MODULES;
}

export function helpGroups(): HelpGroup[] {
  return GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    modules: HELP_MODULES.filter((m) => m.order >= g.from && m.order <= g.to),
  })).filter((g) => g.modules.length > 0);
}

export function helpModule(slug: string): HelpModule | undefined {
  return HELP_MODULES.find((m) => m.slug === slug);
}

export interface HelpArticleContext {
  module: HelpModule;
  article: HelpArticle;
  previous?: HelpArticle;
  next?: HelpArticle;
}

export function helpArticle(
  moduleSlug: string,
  articleSlug: string,
): HelpArticleContext | undefined {
  const topic = helpModule(moduleSlug);
  if (!topic) return undefined;
  const index = topic.articles.findIndex((a) => a.slug === articleSlug);
  if (index < 0) return undefined;
  return {
    module: topic,
    article: topic.articles[index]!,
    previous: topic.articles[index - 1],
    next: topic.articles[index + 1],
  };
}

export const moduleHref = (slug: string) => `${HELP_BASE}/${slug}`;
export const articleHref = (moduleSlug: string, articleSlug: string) =>
  `${HELP_BASE}/${moduleSlug}/${articleSlug}`;
