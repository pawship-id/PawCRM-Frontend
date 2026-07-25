"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Spinner } from "@/components";
import { MenuIcon, PanelLeftIcon } from "@/components/icons";
import { Sidebar } from "@/features/dashboard/components/Sidebar";
import { UserMenu } from "./UserMenu";
import { useAuth } from "../hooks/useAuth";

/**
 * The authenticated admin frame: a left navigation rail (Sidebar) plus a top
 * bar carrying the mobile menu toggle, the signed-in user, and sign-out.
 *
 * It is also the client-side half of the route guard. proxy.ts blocks a
 * hint-less request, but the hint can be stale (expired session); here the
 * AuthProvider's /me verdict is the authority — while it is loading we show a
 * spinner, and if it comes back unauthenticated we redirect to /login.
 */
export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status, user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  // The mobile drawer is closed by its own links/scrim/close button (Sidebar
  // calls onClose on every navigation), so no route-change effect is needed.

  if (status !== "authenticated" || !user) {
    return (
      <div className="flex flex-1 items-center justify-center text-primary">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1">
      <Sidebar
        open={menuOpen}
        collapsed={collapsed}
        onClose={() => setMenuOpen(false)}
        onExpand={() => setCollapsed(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/80 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
            <div className="flex items-center gap-2">
              {/* Mobile: open the drawer */}
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                className="rounded-md p-1.5 text-muted hover:text-foreground md:hidden"
                aria-label="Open menu"
              >
                <MenuIcon />
              </button>

              {/* Desktop: collapse/expand the sidebar rail */}
              <button
                type="button"
                onClick={() => setCollapsed((v) => !v)}
                className="hidden rounded-md p-1.5 text-muted hover:bg-primary/5 hover:text-foreground md:inline-flex"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={collapsed}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                <PanelLeftIcon width={20} height={20} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <UserMenu />
            </div>
          </div>
        </header>

        {/* Content fills the column and flows with the sidebar width — a fixed
            centered max-width would drift away from the rail as it collapses. */}
        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
