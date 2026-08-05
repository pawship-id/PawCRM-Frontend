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
  WarehouseIcon,
  CustomerIcon,
  RolesIcon,
  AuditLogIcon,
  FinanceIcon,
  EcommerceSyncIcon,
  ReportsIcon,
  HotelIcon,
  ProductIcon,
  CategoryIcon,
  StockCardIcon,
  BatchIcon,
  OpnameIcon,
  TransferIcon,
  AdjustmentIcon,
  PurchasingIcon,
  SupplierIcon,
  ReceiptIcon,
  PayableIcon,
  PurchaseReturnIcon,
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
  /**
   * Inventory is a GROUP rather than a leaf: the module has five screens that
   * split cleanly into master data (products) and stock activity (the other
   * four), and burying them behind one landing page made the daily screens two
   * clicks away instead of one.
   *
   * Ordered by how the data flows rather than alphabetically — you define a
   * product, then watch its card, then manage its lots, then count it, then
   * move it, and only then correct it by hand. A reader learning the module
   * top-down learns it in the right order.
   */
  {
    label: "Inventory",
    icon: InventoryIcon,
    children: [
      {
        label: "Produk & Varian",
        href: "/dashboard/inventory/products",
        icon: ProductIcon,
        permission: { feature: "products", action: "read" },
      },
      {
        // Directly under products, and above the stock screens, because it is
        // the other half of the catalogue rather than an activity: you cannot
        // file a product without one.
        label: "Kategori",
        href: "/dashboard/inventory/categories",
        icon: CategoryIcon,
        permission: { feature: "categories", action: "read" },
      },
      {
        label: "Kartu Stok",
        href: "/dashboard/inventory/stock-card",
        icon: StockCardIcon,
        permission: { feature: "stockMovements", action: "read" },
      },
      {
        label: "Batch & Expired",
        href: "/dashboard/inventory/batches",
        icon: BatchIcon,
        permission: { feature: "productBatches", action: "read" },
      },
      {
        label: "Stok Opname",
        href: "/dashboard/inventory/opname",
        icon: OpnameIcon,
        /**
         * Gated on `stockOpnames:read`, NOT on the ledger's `create`.
         *
         * Counting the shelves is Staff work — it is most of the labour an
         * opname costs — and the seeded Staff role deliberately holds
         * create/read/update here while holding only `read` on the ledger. Gating
         * this on `stockMovements:create` would have hidden the whole feature
         * from exactly the people who do it, while showing it to anyone who can
         * post a manual adjustment. The two are different privileges.
         */
        permission: { feature: "stockOpnames", action: "read" },
      },
      {
        label: "Transfer Stok",
        href: "/dashboard/inventory/transfers",
        icon: TransferIcon,
        permission: { feature: "stockMovements", action: "create" },
      },
      {
        /**
         * Last, and that is the ordering doing its job rather than an
         * afterthought. An adjustment is the correction of last resort: a real
         * discrepancy is found by an opname, and goods that moved are moved by a
         * transfer. Putting it above either would offer the shortcut before the
         * procedure.
         *
         * It is also, at the other end of a tenant's life, how opening stock is
         * entered on day one — which is why it is in the menu at all rather than
         * only on the hub, where it used to be reachable from a single card.
         *
         * Gated on `create`, so the seeded Staff role (read-only on the ledger)
         * never sees it: a manual adjustment with no document behind it is the
         * easiest way to hide a shortage.
         */
        label: "Penyesuaian Stok",
        href: "/dashboard/inventory/adjustments",
        icon: AdjustmentIcon,
        permission: { feature: "stockMovements", action: "create" },
      },
    ],
  },
  /**
   * Purchasing — the supply side, ordered the way a purchase actually unfolds:
   * you set up a supplier, receive their goods, owe them money, and sometimes
   * send some of it back.
   *
   * Kept separate from Inventory rather than folded into it, because the two
   * answer different questions and are usually done by different people. Stock
   * screens ask "what do we have"; these ask "who did we buy it from and what do
   * we still owe". They meet at exactly one point — a goods receipt raises stock
   * — and that seam is thin enough not to justify one menu.
   */
  {
    label: "Purchasing",
    icon: PurchasingIcon,
    children: [
      {
        label: "Supplier",
        href: "/dashboard/purchasing/suppliers",
        icon: SupplierIcon,
        permission: { feature: "suppliers", action: "read" },
      },
      {
        label: "Penerimaan Barang",
        href: "/dashboard/purchasing/receipts",
        icon: ReceiptIcon,
        permission: { feature: "goodsReceipts", action: "read" },
      },
      {
        label: "Utang Supplier",
        href: "/dashboard/purchasing/payables",
        icon: PayableIcon,
        permission: { feature: "purchaseInvoices", action: "read" },
      },
      {
        label: "Retur ke Supplier",
        href: "/dashboard/purchasing/returns",
        icon: PurchaseReturnIcon,
        permission: { feature: "purchaseReturns", action: "read" },
      },
    ],
  },
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
        // Directly under Branch: a warehouse is its sibling, not its child —
        // stock location vs. bookkeeping unit — and the pair is read together.
        // Labelled in English like its Master Data siblings (User, Branch,
        // Customer), not "Gudang" like the Indonesian Inventory group.
        label: "Warehouse",
        href: "/dashboard/master/warehouses",
        icon: WarehouseIcon,
        permission: { feature: "warehouses", action: "read" },
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
