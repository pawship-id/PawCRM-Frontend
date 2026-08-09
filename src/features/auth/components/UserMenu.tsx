"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ChevronDownIcon,
  ProfileIcon,
  BusinessIcon,
  LogoutIcon,
} from "@/components/icons";
import { usePermissions } from "@/features/permissions";
import { useAuth } from "../hooks/useAuth";

/**
 * The top-bar account control: the signed-in user's name/avatar, which opens a
 * dropdown with "My profile", "Business information" and "Logout".
 *
 * The two links are the pair this menu exists to answer — who I am, and what
 * business I am in — which is why the tenant screen lives here rather than in
 * the sidebar: Master Data is where records are maintained, and neither of these
 * is a record this user edits.
 *
 * Accessibility: a proper menu button (aria-haspopup / aria-expanded) over a
 * role="menu" list. It closes on outside click, on Escape, and after any item
 * is chosen.
 */
export function UserMenu() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.replace("/login");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2.5 transition-colors hover:bg-primary/5"
      >
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {user.fullName.charAt(0).toUpperCase()}
        </span>
        <span className="hidden text-sm font-medium text-foreground sm:inline">
          {user.fullName}
        </span>
        <ChevronDownIcon
          width={16}
          height={16}
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-foreground">
              {user.fullName}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>

          <Link
            href="/dashboard/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-primary/5"
          >
            <ProfileIcon width={18} height={18} className="text-muted" />
            My profile
          </Link>

          {/* Hidden without `tenants:read`, the same grant GET /tenants/me
              requires — no seeded role but Owner holds it (by the super-admin
              bypass), because the screen shows the subscription and billing
              state. Offering a link that can only ever open an access-denied
              panel would be worse than not offering it. */}
          {can("tenants", "read") && (
            <Link
              href="/dashboard/business"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-primary/5"
            >
              <BusinessIcon width={18} height={18} className="text-muted" />
              Business information
            </Link>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-danger transition-colors hover:bg-danger/10"
          >
            <LogoutIcon width={18} height={18} />
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
