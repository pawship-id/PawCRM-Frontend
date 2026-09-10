"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * One tab.
 *
 * `href` IS REQUIRED, and a tab whose screen is not built yet gets a route that
 * opens on a "belum tersedia" panel rather than an inert grey label. A dead
 * control cannot say why it does nothing, reads to a screen reader as an
 * ordinary word, and cannot be linked to; a placeholder page answers the
 * question the click was asking. Leaving the unbuilt tabs OUT is not the
 * alternative either — the row is the module's table of contents, and a
 * four-part module drawn as a two-part one sends people looking for the missing
 * half in Pengaturan.
 */
export interface PageTab {
  label: string;
  href: string;
  /**
   * Match the pathname exactly rather than by prefix — for a tab whose route is
   * the parent of its siblings'.
   */
  exact?: boolean;
}

export interface PageTabsProps {
  tabs: PageTab[];
  /** Names the row for a screen reader: "Bagian pelanggan". */
  ariaLabel: string;
  className?: string;
}

/**
 * The underline tab row that sits under a page title, from the mockup
 * (buloo-navbar-v3.html, `.tabs`): the sections of ONE module, each its own
 * route.
 *
 * ROUTES, NOT `useState`. The mockup switches tabs in memory because it is a
 * prototype with no routes to switch between; here Pelanggan and Hewan are real
 * screens with real permissions, detail pages and deep links. A remembered-tab
 * version would have to either duplicate those screens inside one route or drop
 * the ability to send somebody a link to the animal register.
 *
 * NOT `FilterPills`, which is the other row of buttons in this codebase that
 * switches a view. That one narrows the list you are looking at and stays on the
 * page; this one navigates. Same gesture, different consequence — and the
 * underline is what tells them apart at a glance.
 */
export function PageTabs({ tabs, ariaLabel, className }: PageTabsProps) {
  const pathname = usePathname();

  const isCurrent = (tab: PageTab) =>
    tab.exact
      ? pathname === tab.href
      : pathname === tab.href || pathname.startsWith(`${tab.href}/`);

  return (
    <nav
      aria-label={ariaLabel}
      className={cn("overflow-x-auto border-b border-border", className)}
    >
      <ul className="flex gap-1">
        {tabs.map((tab) => {
          const current = isCurrent(tab);

          return (
            <li key={tab.label}>
              <Link
                href={tab.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center whitespace-nowrap border-b-2 px-4 text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  current
                    ? "border-primary text-primary"
                    : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
