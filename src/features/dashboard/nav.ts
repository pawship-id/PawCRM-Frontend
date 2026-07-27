import type { ComponentType, SVGProps } from "react";
import {
  DashboardIcon,
  BookingIcon,
  InventoryIcon,
  PosIcon,
  SalesIcon,
  MasterDataIcon,
  UsersIcon,
  BranchIcon,
  CustomerIcon,
  RolesIcon,
  AuditLogIcon,
  FinanceIcon,
  EcommerceSyncIcon,
  ReportsIcon,
  HotelIcon,
} from "@/components/icons";
import type {
  Action,
  Feature,
  PermissionRequirement,
} from "@/features/permissions";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The admin sidebar navigation — the single source of truth for both the
 * Sidebar links and the active-route logic. Add a section here and it appears
 * everywhere; nothing else enumerates these routes.
 *
 * An item is either a LEAF (has `href`) or a GROUP (has `children`, an
 * expandable dropdown such as Master Data).
 */
export interface NavChild {
  label: string;
  href: string;
  icon: Icon;
  /**
   * The permission a user must hold for this link to appear. Omitted means
   * "always visible" — sections without a catalog feature yet (Booking, POS…)
   * carry no requirement.
   */
  permission?: PermissionRequirement;
}

export interface NavItem {
  label: string;
  icon: Icon;
  /** Present on a leaf item — the route it links to. */
  href?: string;
  /** Present on a group — the dropdown children. */
  children?: NavChild[];
  /**
   * Match the pathname exactly rather than by prefix. The dashboard home shares
   * its prefix with every other section, so only it needs an exact match.
   */
  exact?: boolean;
  /**
   * The permission a leaf must hold to appear. Omitted means always visible. A
   * GROUP needs no requirement of its own: it shows when it has a visible child.
   */
  permission?: PermissionRequirement;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardIcon, exact: true },
  { label: "Booking", href: "/dashboard/booking", icon: BookingIcon },
  { label: "Inventory", href: "/dashboard/inventory", icon: InventoryIcon },
  { label: "POS", href: "/dashboard/pos", icon: PosIcon },
  { label: "Sales & Invoice", href: "/dashboard/sales", icon: SalesIcon },
  { label: "Keuangan", href: "/dashboard/keuangan", icon: FinanceIcon },
  {
    label: "E-commerce Sync",
    href: "/dashboard/ecommerce-sync",
    icon: EcommerceSyncIcon,
  },
  { label: "Reports", href: "/dashboard/reports", icon: ReportsIcon },
  { label: "Hotel", href: "/dashboard/hotel", icon: HotelIcon },
  {
    label: "Master Data",
    icon: MasterDataIcon,
    children: [
      {
        label: "User",
        href: "/dashboard/master/users",
        icon: UsersIcon,
        permission: { feature: "users", action: "read" },
      },
      {
        label: "Branch",
        href: "/dashboard/master/branches",
        icon: BranchIcon,
        permission: { feature: "branches", action: "read" },
      },
      {
        label: "Customer",
        href: "/dashboard/master/customers",
        icon: CustomerIcon,
        permission: { feature: "customers", action: "read" },
      },
      {
        label: "Roles",
        href: "/dashboard/master/roles",
        icon: RolesIcon,
        permission: { feature: "roles", action: "read" },
      },
      {
        label: "Audit Log",
        href: "/dashboard/master/audit-logs",
        icon: AuditLogIcon,
        permission: { feature: "auditLogs", action: "read" },
      },
    ],
  },
];

/** Predicate matching usePermissions().can — lets the filter stay pure/testable. */
export type CanFn = (feature: Feature, action: Action) => boolean;

/**
 * Narrows NAV_ITEMS to what `can` permits: a leaf is dropped when its
 * `permission` is not granted; a group keeps only its permitted children and is
 * itself dropped when none remain. Items with no `permission` always pass. Pure
 * — the Sidebar memoizes it against the current `can`.
 */
export function filterNavItems(items: NavItem[], can: CanFn): NavItem[] {
  const allowed = (req?: PermissionRequirement) =>
    !req || can(req.feature, req.action);

  return items.reduce<NavItem[]>((visible, item) => {
    if (item.children) {
      const children = item.children.filter((child) => allowed(child.permission));
      if (children.length > 0) visible.push({ ...item, children });
    } else if (allowed(item.permission)) {
      visible.push(item);
    }
    return visible;
  }, []);
}

/** Whether a leaf route is the active one for the given pathname. */
export function isActiveHref(
  href: string,
  pathname: string,
  exact = false,
): boolean {
  return exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

/** Whether a nav item (leaf or group) is active for the given pathname. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.children) {
    return item.children.some((child) => isActiveHref(child.href, pathname));
  }
  return item.href ? isActiveHref(item.href, pathname, item.exact) : false;
}
