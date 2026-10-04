"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { usePermissions } from "@/features/permissions";
import {
  NAV_SECTIONS,
  filterNavSections,
  isActive,
  isActiveChild,
  type NavChild,
  type NavItem,
} from "../nav";

interface SidebarProps {
  /** Mobile drawer open state; ignored from `md` up, where the rail is fixed. */
  open: boolean;
  /** Desktop icon-rail state. On mobile the drawer is always full width. */
  collapsed: boolean;
  onClose: () => void;
  /**
   * Force the rail back to full width. The collapse/expand control lives in the
   * top bar, not here; this is only used so opening a group while collapsed can
   * expand the rail to make room for the submenu.
   */
  onExpand: () => void;
}

/**
 * The admin navigation rail.
 *
 * Three modes, all driven by NAV_SECTIONS:
 *   - Desktop expanded: a 250 px column of labelled sections and submenus.
 *   - Desktop collapsed: a 68 px icon rail — labels, submenus and section
 *     headings hidden (via `md:` classes, so mobile is unaffected), each row
 *     naming itself in a tooltip on hover.
 *   - Mobile: an off-canvas drawer over a scrim, always full width and never
 *     collapsed.
 *
 * It sits BELOW the top bar rather than beside it (`top-14`), which is what the
 * mockup's chrome does and what lets the Buloo logo live in the bar and be seen
 * at both rail widths.
 */
export function Sidebar({ open, collapsed, onClose, onExpand }: SidebarProps) {
  const pathname = usePathname();
  const { can } = usePermissions();

  // Hide sections the current role cannot use. Recomputed only when the grant
  // set changes (can is memoized by usePermissions).
  const sections = useMemo(() => filterNavSections(NAV_SECTIONS, can), [can]);

  /**
   * Submenus the reader has folded or unfolded BY HAND, keyed by group label.
   *
   * Only their clicks are stored; a group with no entry here falls back to
   * whether it owns the current route, so a deep link or a back/forward lands
   * with the right submenu already open without anything being written down.
   * Storing the route-driven state instead would mean an effect that writes
   * state on every navigation, and a reader's own click would be overwritten by
   * the next one.
   *
   * HELD HERE RATHER THAN INSIDE EACH GROUP, which is where it used to live: a
   * `useState` per group is lost on every remount, so a submenu folded itself
   * again as soon as the rail re-rendered from a new permission set.
   */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const isOpen = (item: NavItem) =>
    toggled[item.label] ?? isActive(item, pathname);

  function toggleGroup(item: NavItem) {
    // On the collapsed rail there is no room for a submenu — widen first, then
    // open, so the click does one legible thing instead of nothing visible.
    if (collapsed) {
      onExpand();
      setToggled((prev) => ({ ...prev, [item.label]: true }));
      return;
    }
    setToggled((prev) => ({ ...prev, [item.label]: !isOpen(item) }));
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-foreground/40 md:hidden"
          aria-hidden="true"
          onClick={onClose}
        />
      )}

      <nav
        className={[
          "fixed bottom-0 left-0 top-14 z-40 w-[250px] overflow-y-auto overflow-x-hidden",
          "border-r border-border bg-surface px-3 pb-5 pt-2",
          "transition-[transform,width] md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
          collapsed ? "md:w-[68px] md:px-2.5" : "md:w-[250px]",
        ].join(" ")}
        aria-label="Menu utama"
      >
        {sections.map((section, index) => (
          <div
            key={section.label}
            className={
              index === 0 ? "pt-0.5" : "mt-3 border-t border-border pt-3.5"
            }
          >
            {/*
              On the icon rail the heading has nowhere to sit, so it keeps its
              words for a screen reader and gives up its line. The rule above it
              is the wrapper's own border, which is doing the separating in both
              modes — the sections stay legible as groups on the narrow rail.
            */}
            <p
              className={[
                "px-3 pb-2 text-xs font-semibold text-muted",
                collapsed ? "md:sr-only" : "",
              ].join(" ")}
            >
              {section.label}
            </p>

            {section.items.map((item) =>
              item.children ? (
                <NavGroup
                  key={item.label}
                  item={item}
                  pathname={pathname}
                  collapsed={collapsed}
                  open={isOpen(item)}
                  onToggle={() => toggleGroup(item)}
                  onNavigate={onClose}
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
          </div>
        ))}
      </nav>
    </>
  );
}

/** The shell every top-level row shares — one place for height, radius, focus. */
const ROW_BASE =
  "group/row relative flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

const ROW_IDLE =
  "font-medium text-muted hover:bg-surface-hover hover:text-foreground";
/** Selected: the sanctioned bg-navy-100 (ui-rules §3) under navy ink. */
const ROW_ACTIVE = "bg-surface-selected font-semibold text-primary";
/** A group holding the current page: navy ink, no fill — the fill is the child's. */
const ROW_BRANCH = "font-semibold text-primary hover:bg-surface-hover";

/** Hidden on the wide rail; the icon rail's only way of naming a row. */
function Tip({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (!collapsed) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute left-full z-50 ml-2.5 hidden whitespace-nowrap rounded-md bg-navy-800 px-2.5 py-1.5 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover/row:opacity-100 md:block"
    >
      {label}
    </span>
  );
}

function Badge({ count }: { count: number }) {
  return (
    <span className="flex h-5 min-w-5 flex-none items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-bold tabular-nums text-secondary-foreground">
      {count}
    </span>
  );
}

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
      className={[
        ROW_BASE,
        "mb-0.5",
        collapsed ? "md:justify-center md:gap-0 md:px-0" : "",
        active ? ROW_ACTIVE : ROW_IDLE,
      ].join(" ")}
    >
      <Icon className="size-5 flex-none" />
      <span className={`flex-1 truncate ${collapsed ? "md:hidden" : ""}`}>
        {item.label}
      </span>
      {item.badge ? <Badge count={item.badge} /> : null}
      <Tip label={item.label} collapsed={collapsed} />
    </Link>
  );
}

function NavGroup({
  item,
  pathname,
  collapsed,
  open,
  onToggle,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  collapsed: boolean;
  open: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const branchActive = isActive(item, pathname);
  const Icon = item.icon;

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={[
          ROW_BASE,
          "mb-0.5 text-left",
          collapsed ? "md:justify-center md:gap-0 md:px-0" : "",
          branchActive ? ROW_BRANCH : ROW_IDLE,
        ].join(" ")}
      >
        <Icon className="size-5 flex-none" />
        <span className={`flex-1 truncate ${collapsed ? "md:hidden" : ""}`}>
          {item.label}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={[
            "size-4 flex-none opacity-50 transition-transform",
            open ? "rotate-180" : "",
            collapsed ? "md:hidden" : "",
          ].join(" ")}
        />
        <Tip label={item.label} collapsed={collapsed} />
      </button>

      {/*
        Folded with a 0fr→1fr grid row rather than by unmounting, so the submenu
        slides instead of appearing — and without anybody measuring a height.
        `inert` while folded keeps the hidden links out of the tab order, which
        overflow:hidden alone would not.
      */}
      <div
        className={[
          "ml-[22px] grid border-l border-border pl-3 transition-[grid-template-rows] duration-240",
          open ? "mb-2 grid-rows-[1fr]" : "grid-rows-[0fr]",
          collapsed ? "md:hidden" : "",
        ].join(" ")}
        inert={!open}
      >
        <div className="overflow-hidden">
          {/*
            A real list, named after its group. Three submenus have a row called
            "Ringkasan" and two have "Kategori"; without the list around them a
            screen reader reads the same word three times with nothing to tell
            the modules apart.
          */}
          <ul aria-label={item.label}>
            {item.children!.map((child) => (
              <li key={child.href}>
                <SubLink
                  child={child}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function SubLink({
  child,
  pathname,
  onNavigate,
}: {
  child: NavChild;
  pathname: string;
  onNavigate: () => void;
}) {
  const active = isActiveChild(child, pathname);
  return (
    <Link
      href={child.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={[
        "relative flex min-h-10 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        active
          ? "bg-surface-selected font-semibold text-primary"
          : "text-muted hover:bg-surface-hover hover:text-foreground",
      ].join(" ")}
    >
      {/* A dot, not the child's own icon: nine icons stacked under one parent
          read as nine unrelated modules. The parent's icon already says which
          module this is. */}
      <span
        aria-hidden="true"
        className={`size-1.5 flex-none rounded-full bg-current ${active ? "" : "opacity-40"}`}
      />
      <span className="flex-1 truncate">{child.label}</span>
      {child.badge ? <Badge count={child.badge} /> : null}
    </Link>
  );
}
