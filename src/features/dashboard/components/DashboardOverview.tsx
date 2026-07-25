"use client";

import Link from "next/link";

import { useAuth } from "@/features/auth";
import { NAV_ITEMS, type NavItem } from "../nav";

/**
 * The admin landing view. Greets the signed-in user and surfaces the section
 * entry points.
 *
 * The KPI figures are placeholders: there is no metrics API yet, so the tiles
 * render a "—" rather than an invented number — they exist to establish the
 * layout the real numbers will drop into.
 */

const KPIS = [
  { label: "Today's bookings", href: "/dashboard/booking" },
  { label: "Inventory items", href: "/dashboard/inventory" },
  { label: "POS sales today", href: "/dashboard/pos" },
  { label: "Outstanding invoices", href: "/dashboard/sales" },
];

// The section shortcuts are the top-level leaf sections (a direct href, and not
// the dashboard home itself). Groups like Master Data are excluded.
type LeafItem = NavItem & { href: string };
const SHORTCUTS = NAV_ITEMS.filter(
  (item): item is LeafItem => Boolean(item.href) && !item.exact,
);

export function DashboardOverview() {
  const { user } = useAuth();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back{user ? `, ${user.fullName.split(" ")[0]}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted">
          Here&apos;s what&apos;s happening across your clinic today.
        </p>
      </div>

      <section aria-label="Key metrics">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {KPIS.map((kpi) => (
            <Link
              key={kpi.label}
              href={kpi.href}
              className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/40"
            >
              <p className="text-sm text-muted">{kpi.label}</p>
              <p className="mt-2 text-3xl font-semibold text-foreground">—</p>
              <p className="mt-1 text-xs text-muted">No data yet</p>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Sections">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Quick access
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SHORTCUTS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/40"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon />
                </span>
                <span className="text-base font-medium text-foreground">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
