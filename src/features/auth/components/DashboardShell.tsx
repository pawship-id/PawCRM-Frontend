"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Menu, PanelLeft } from "lucide-react";

import { Logo, Spinner } from "@/components";
import { Sidebar } from "@/features/dashboard/components/Sidebar";
import { usePermissions } from "@/features/permissions";
import { useTenant } from "@/features/tenant";
import { UserMenu } from "./UserMenu";
import { useAuth } from "../hooks/useAuth";

/**
 * The authenticated admin frame: a navy top bar across the full width, and the
 * navigation rail hanging below it.
 *
 * THE BAR SPANS THE RAIL rather than sitting beside it, which is the one
 * structural change from the old chrome. It is what lets the Buloo mark stay
 * visible at both rail widths — it used to live inside the rail and shrink to a
 * `b` when the rail collapsed — and it gives the tenant chip somewhere to sit
 * where it reads as "which business am I in" rather than as a nav row.
 *
 * It is also the client-side half of the route guard. proxy.ts blocks a
 * hint-less request, but the hint can be stale (expired session); here the
 * AuthProvider's /me verdict is the authority — while it is loading we show a
 * spinner, and if it comes back unauthenticated we redirect to /login.
 */

/**
 * The rail width, remembered across reloads — which it was not before: somebody
 * who works on a laptop collapsed the rail once and had it spring back at every
 * refresh.
 *
 * READ THROUGH useSyncExternalStore RATHER THAN AN EFFECT. localStorage does not
 * exist on the server, so the value cannot be read while rendering without the
 * two passes disagreeing; reading it in an effect and calling setState fixes the
 * mismatch by rendering twice on every mount. This is the API for exactly that
 * shape: `false` on the server, the stored answer on the client, one render.
 *
 * The listener set is what makes a write in this tab repaint; the `storage`
 * event covers the same account open in another one.
 */
const RAIL_KEY = "buloo.rail.collapsed";
const railListeners = new Set<() => void>();

function subscribeRail(onChange: () => void) {
  railListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    railListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function railCollapsed(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === "1";
  } catch {
    // Private mode, or storage disabled. The default width is a fine answer.
    return false;
  }
}

function setRailCollapsed(next: boolean) {
  try {
    window.localStorage.setItem(RAIL_KEY, next ? "1" : "0");
  } catch {
    // See above — failing to remember is not worth failing the click over.
  }
  railListeners.forEach((notify) => notify());
}

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, user } = useAuth();
  const { can } = usePermissions();
  const [menuOpen, setMenuOpen] = useState(false);

  const collapsed = useSyncExternalStore(subscribeRail, railCollapsed, () => false);

  /**
   * The business name in the bar. `enabled` is the point: GET /tenants/me needs
   * `tenants:read`, which the seeded Staff role does not hold, and firing it
   * anyway would paint a 403 across the chrome of every screen. Without the
   * grant the chip simply is not there.
   */
  const { tenant } = useTenant(can("tenants", "read"));

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // The mobile drawer is closed by its own links/scrim (Sidebar calls onClose on
  // every navigation), so no route-change effect is needed.

  if (status !== "authenticated" || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-primary">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-3 bg-primary px-3 text-primary-foreground sm:px-4">
        {/*
          Two controls, one visible at a time, because they are two different
          acts: on a phone the rail is a drawer that opens over the page, on a
          laptop it is a column that narrows. One button would have to describe
          itself differently at each width, and a wrong aria-label is worse than
          a second button nobody sees.
        */}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="inline-flex size-9 items-center justify-center rounded-lg text-primary-foreground/85 transition-colors hover:bg-white/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 md:hidden"
          aria-label="Buka menu"
        >
          <Menu className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => setRailCollapsed(!collapsed)}
          className="hidden size-9 items-center justify-center rounded-lg text-primary-foreground/85 transition-colors hover:bg-white/15 hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60 md:inline-flex"
          aria-label={collapsed ? "Lebarkan menu" : "Ciutkan menu"}
          aria-pressed={collapsed}
          title={collapsed ? "Lebarkan menu" : "Ciutkan menu"}
        >
          <PanelLeft className="size-5" />
        </button>

        <Logo size={24} reversed />

        {/* Hidden on a phone, where the bar has room for the toggle, the mark
            and the account and nothing else. */}
        {tenant && (
          <div className="ml-1 hidden items-center gap-2 border-l border-white/20 pl-3.5 text-sm font-semibold text-primary-foreground/85 md:flex">
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-md bg-secondary text-xs font-bold text-secondary-foreground"
            >
              {initialsOf(tenant.name)}
            </span>
            <span className="max-w-[22ch] truncate">{tenant.name}</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          <UserMenu />
        </div>
      </header>

      <Sidebar
        open={menuOpen}
        collapsed={collapsed}
        onClose={() => setMenuOpen(false)}
        onExpand={() => setRailCollapsed(false)}
      />

      {/* The rail is fixed, so the content is held clear of it by a margin that
          follows its width. Below `md` the rail is a drawer over the page and
          the margin goes away entirely. */}
      <main
        className={[
          "pt-14 transition-[margin-left]",
          collapsed ? "md:ml-[68px]" : "md:ml-[250px]",
        ].join(" ")}
      >
        <div className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}

/**
 * "Anabul Group" → "AG". Two letters at most: the chip is 24 px square, and a
 * three-word business name would otherwise set its own type size.
 */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]!.toUpperCase())
    .join("");
}
