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
  RolesIcon,
} from "@/components/icons";

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
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: DashboardIcon, exact: true },
  { label: "Booking", href: "/dashboard/booking", icon: BookingIcon },
  { label: "Inventory", href: "/dashboard/inventory", icon: InventoryIcon },
  { label: "POS", href: "/dashboard/pos", icon: PosIcon },
  { label: "Sales & Invoice", href: "/dashboard/sales", icon: SalesIcon },
  {
    label: "Master Data",
    icon: MasterDataIcon,
    children: [
      { label: "User", href: "/dashboard/master/users", icon: UsersIcon },
      { label: "Branch", href: "/dashboard/master/branches", icon: BranchIcon },
      { label: "Roles", href: "/dashboard/master/roles", icon: RolesIcon },
    ],
  },
];

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
