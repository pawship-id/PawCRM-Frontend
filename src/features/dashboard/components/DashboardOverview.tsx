"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/features/auth";
import { usePermissions } from "@/features/permissions";
import { useExpiringAlert, useLowStockAlert } from "@/features/inventory";
import { NAV_ITEMS, type NavItem } from "../nav";

/**
 * The admin landing view — the screen somebody opens first every morning.
 *
 * TWO OF THE FOUR TILES CARRY REAL NUMBERS and two do not, and the difference is
 * shown rather than hidden. Restock and expiry are answerable today: both read
 * endpoints that exist and both are the alerts PCR-013 and PCR-018 ask for on
 * this page specifically. Bookings and POS sales have no data source at all
 * until those modules land.
 *
 * The dead pair is badged "Segera" rather than left showing "—". A dash reads as
 * a number that failed to load — which is the one impression a landing page must
 * not give — while a badge says the feature is coming. Same treatment the Sales
 * card gets on the reports hub, and for the same reason.
 *
 * EACH LIVE TILE IS GATED ON THE GRANT ITS OWN ENDPOINT ENFORCES. A groomer with
 * neither sees the shortcuts and no tiles, rather than two boxes that only ever
 * render a 403.
 */

/** The tiles with nothing behind them yet. See the header. */
const PENDING_KPIS = [
  { label: "Booking hari ini", href: "/dashboard/booking", blockedBy: "Menunggu modul Booking" },
  { label: "Penjualan hari ini", href: "/dashboard/pos", blockedBy: "Menunggu modul POS" },
];

// The section shortcuts are the top-level leaf sections (a direct href, and not
// the dashboard home itself). Groups like Master Data are excluded.
type LeafItem = NavItem & { href: string };
const SHORTCUTS = NAV_ITEMS.filter(
  (item): item is LeafItem => Boolean(item.href) && !item.exact,
);

export function DashboardOverview() {
  const { user } = useAuth();
  const { can } = usePermissions();

  const mayReadProducts = can("products", "read");
  const mayReadBatches = can("productBatches", "read");

  const lowStock = useLowStockAlert(mayReadProducts);
  const expiring = useExpiringAlert(mayReadBatches);

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
          {mayReadProducts && (
            <AlertTile
              label="Produk perlu restock"
              href="/dashboard/reports/low-stock"
              total={lowStock.total}
              loading={lowStock.loading}
              error={lowStock.error}
              caption="di bawah batas minimum"
              emptyCaption="semua di atas batas"
            />
          )}

          {mayReadBatches && (
            <AlertTile
              label="Mendekati kedaluwarsa"
              href="/dashboard/inventory/batches"
              total={expiring.total}
              loading={expiring.loading}
              error={expiring.error}
              caption={`lot, dalam ${expiring.withinDays} hari`}
              emptyCaption={`tidak ada dalam ${expiring.withinDays} hari`}
            />
          )}

          {PENDING_KPIS.map((kpi) => (
            <div
              key={kpi.label}
              aria-disabled="true"
              className="rounded-2xl border border-border bg-surface p-5 opacity-60"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-muted">{kpi.label}</p>
                <Badge variant="outline">Segera</Badge>
              </div>
              <p className="mt-2 text-xs text-muted">{kpi.blockedBy}</p>
            </div>
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

/**
 * One alert tile: a count, and what it means.
 *
 * THREE STATES, AND ZERO IS NOT NOTHING. "0 produk perlu restock" is a real,
 * reassuring answer and is rendered as one — the caption changes rather than the
 * tile disappearing, because a tile that vanishes when everything is fine leaves
 * the reader unsure whether it was checked at all.
 *
 * A FAILURE SAYS SO rather than showing zero. A dash beside "gagal dimuat" is
 * honest; a zero that is really an error is the most dangerous number a landing
 * page can display, because nobody goes and looks.
 */
function AlertTile({
  label,
  href,
  total,
  loading,
  error,
  caption,
  emptyCaption,
}: {
  label: string;
  href: string;
  total: number;
  loading: boolean;
  error: string | null;
  caption: string;
  emptyCaption: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-primary/40"
    >
      <p className="text-sm text-muted">{label}</p>
      <p
        className={
          error || total === 0
            ? "mt-2 text-3xl font-semibold text-foreground"
            : "mt-2 text-3xl font-semibold text-destructive"
        }
      >
        {loading || error ? "—" : total}
      </p>
      <p className="mt-1 text-xs text-muted">
        {error ? "gagal dimuat" : total === 0 ? emptyCaption : caption}
      </p>
    </Link>
  );
}
