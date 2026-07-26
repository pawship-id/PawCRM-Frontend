"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components";
import { CloseIcon, ChevronDownIcon } from "@/components/icons";
import { usePermissions } from "@/features/permissions";
import {
  NAV_ITEMS,
  filterNavItems,
  isActive,
  isActiveHref,
  type NavItem,
} from "../nav";

interface SidebarProps {
  /** Mobile drawer open state; ignored on desktop where the sidebar is fixed. */
  open: boolean;
  /** Desktop icon-rail state. On mobile the drawer is always full width. */
  collapsed: boolean;
  onClose: () => void;
  /**
   * Force the rail back to full width. The collapse/expand control lives in the
   * top bar, not here; this is only used so opening a group (e.g. Master Data)
   * while collapsed can expand the rail to make room for the submenu.
   */
  onExpand: () => void;
}

/**
 * The admin navigation rail.
 *
 * Three modes, all driven by NAV_ITEMS:
 *   - Desktop expanded: full-width column with labels and dropdowns.
 *   - Desktop collapsed: a w-16 icon rail (labels/dropdowns hidden via `md:`
 *     classes, so mobile is unaffected).
 *   - Mobile: an off-canvas drawer over a scrim, always full width.
 */
export function Sidebar({ open, collapsed, onClose, onExpand }: SidebarProps) {
  const pathname = usePathname();
  const { can } = usePermissions();

  // Hide sections the current role cannot use. Recomputed only when the grant
  // set changes (can is memoized by usePermissions).
  const items = useMemo(() => filterNavItems(NAV_ITEMS, can), [can]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-foreground/30 md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-surface",
          "transition-[transform,width] duration-200 md:static md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-16" : "md:w-64",
        ].join(" ")}
        aria-label="Primary"
      >
        <div
          className={`flex h-16 shrink-0 items-center px-3 ${
            collapsed ? "md:justify-center" : "justify-between"
          }`}
        >
          <Link
            href="/dashboard"
            aria-label="PawShip dashboard"
            className="flex items-center px-2"
          >
            {/* Full logo: always on mobile, on desktop only when expanded. */}
            <span className={collapsed ? "md:hidden" : ""}>
              <Logo size={28} />
            </span>
            {/* Mark only: desktop collapsed rail. */}
            <span className={`hidden ${collapsed ? "md:flex" : "md:hidden"}`}>
              <Logo size={28} markOnly />
            </span>
          </Link>

          {/* Mobile close (the collapse/expand control lives in the top bar) */}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:text-foreground md:hidden"
            aria-label="Close menu"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          {items.map((item) =>
            item.children ? (
              <NavGroup
                key={item.label}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onClose}
                onExpand={onExpand}
              />
            ) : (
              <NavLeaf
                key={item.href}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
                onNavigate={onClose}
              />
            ),
          )}
        </nav>

        <div
          className={`px-5 py-4 text-xs text-muted ${
            collapsed ? "md:hidden" : ""
          }`}
        >
          PawShip CRM · Admin
        </div>
      </aside>
    </>
  );
}

const ROW_BASE =
  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors";

function NavLeaf({
  item,
  pathname,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      href={item.href!}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={[
        ROW_BASE,
        collapsed ? "md:justify-center md:px-0" : "",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted hover:bg-primary/5 hover:text-foreground",
      ].join(" ")}
    >
      <Icon className={active ? "text-primary" : "text-muted"} />
      <span className={collapsed ? "md:hidden" : ""}>{item.label}</span>
    </Link>
  );
}

function NavGroup({
  item,
  pathname,
  collapsed,
  onNavigate,
  onExpand,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
  onExpand: () => void;
}) {
  const groupActive = isActive(item, pathname);
  // Open by default when a child route is active (e.g. deep link).
  const [open, setOpen] = useState(groupActive);
  const Icon = item.icon;

  function handleToggle() {
    // On the collapsed rail there is no room for the submenu — expand first.
    if (collapsed) onExpand();
    setOpen((v) => !v);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        title={item.label}
        className={[
          ROW_BASE,
          "w-full",
          collapsed ? "md:justify-center md:px-0" : "",
          groupActive
            ? "text-primary"
            : "text-muted hover:bg-primary/5 hover:text-foreground",
        ].join(" ")}
      >
        <Icon className={groupActive ? "text-primary" : "text-muted"} />
        <span className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}>
          {item.label}
        </span>
        <ChevronDownIcon
          width={16}
          height={16}
          className={`transition-transform ${open ? "rotate-180" : ""} ${
            collapsed ? "md:hidden" : ""
          }`}
        />
      </button>

      {/* Children: hidden when the group is closed; on the collapsed desktop
          rail they are hidden too (mobile keeps them visible). */}
      <div
        className={[
          "mt-1 space-y-1",
          open ? "" : "hidden",
          collapsed ? "md:hidden" : "",
        ].join(" ")}
      >
        {item.children!.map((child) => {
          const active = isActiveHref(child.href, pathname);
          const ChildIcon = child.icon;
          return (
            <Link
              key={child.href}
              href={child.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={[
                "flex items-center gap-3 rounded-lg py-2 pl-10 pr-3 text-sm transition-colors",
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted hover:bg-primary/5 hover:text-foreground",
              ].join(" ")}
            >
              <ChildIcon
                width={16}
                height={16}
                className={active ? "text-primary" : "text-muted"}
              />
              {child.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
