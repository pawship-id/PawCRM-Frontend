import type { PageTab } from "@/components/PageTabs";

import type { Action, Feature } from "./types";

/**
 * A tab on a page's tab row, and the grants that open it — any one of them.
 *
 * Since 14 October 2026 every tab answers to its own "Lihat" in the role
 * editor, so a module header lists its tabs ONCE in this shape: the header
 * draws the ones `can` allows, and the page a tab row lands on (Ringkasan)
 * uses the same list to send a reader who may not see it to the first tab
 * they may (RequirePermission's `redirectTo`).
 */
export interface GatedTab {
  label: string;
  href: string;
  exact?: boolean;
  anyOf: Array<{ feature: Feature; action?: Action }>;
}

export type CanCheck = (feature: Feature, action: Action) => boolean;

export function tabAllowed(tab: GatedTab, can: CanCheck): boolean {
  return tab.anyOf.some((grant) => can(grant.feature, grant.action ?? "read"));
}

/** The tabs `can` allows, as PageTabs draws them. */
export function visibleTabs(tabs: GatedTab[], can: CanCheck): PageTab[] {
  return tabs
    .filter((tab) => tabAllowed(tab, can))
    .map(({ label, href, exact }) => ({ label, href, exact }));
}
