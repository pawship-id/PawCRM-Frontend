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
  OpeningStockIcon,
  PurchasingIcon,
  SupplierIcon,
  ReceiptIcon,
  PayableIcon,
  PurchaseReturnIcon,
  AccountTreeIcon,
  JournalIcon,
} from "@/components/icons";
/*
  From lucide directly, not from components/icons — ui-rules §11 is retiring that
  file, so a NEW item should not add to it.

  PawPrint despite §12's "no paw prints as bullets": that rule is about paw
  prints used as decoration, and this is the functional icon identifying a
  module. A species-specific alternative (Dog, Cat) would pick a side the
  register deliberately does not.
*/
import { PawPrint, Scissors, Landmark } from "lucide-react";
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
   * Match the pathname exactly rather than by prefix — needed by a child whose
   * route is the parent of its siblings, such as the Inventory hub, which would
   * otherwise read as active on every screen below it.
   */
  exact?: boolean;
  /**
   * The permission a user must hold for this link to appear. Omitted means
   * "always visible" — sections without a catalog feature yet (POS…) carry no
   * requirement.
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
  {
    label: "Booking",
    href: "/dashboard/booking",
    icon: BookingIcon,
    /*
      GATED NOW THAT THE SCREEN IS REAL. While Booking was a placeholder the
      link cost nothing to show; the list behind it is gated `bookings:read` on
      every route, so without this a user who cannot read bookings would see the
      menu, click it, and be told the list "tidak bisa dimuat" — which reads as
      a fault rather than a permission they do not have.
    */
    permission: { feature: "bookings", action: "read" },
  },
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
        /**
         * The hub, first — the one screen in the module the menu used to have no
         * way of reaching at all, so the alert lists it exists for (perlu
         * restock, mendekati kedaluwarsa) could only be found by typing the URL.
         *
         * Ungated, unlike its siblings, because it has no single feature behind
         * it: every card and both lists gate themselves, so the page is already
         * exactly as much as the role may read. filterNavItems ignores it when
         * deciding whether the group survives — see there.
         *
         * `exact`, because its href is the prefix of every sibling's: without it
         * this row would be highlighted on all seven screens below it.
         */
        label: "Ringkasan",
        href: "/dashboard/inventory",
        icon: InventoryIcon,
        exact: true,
      },
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
        /**
         * GATED ON `create` THOUGH THE PAGE ONLY NEEDS `read` — the same call
         * Penyesuaian Stok makes below, and for the same reason. This route
         * opens on a list now, which anybody who may page the stock card may
         * read, but a menu row is an invitation and the screen's one action is a
         * write. Reading it by URL still works.
         */
        label: "Transfer Stok",
        href: "/dashboard/inventory/transfers",
        icon: TransferIcon,
        permission: { feature: "stockMovements", action: "create" },
      },
      {
        /**
         * Day one, and it sits directly above the adjustment for that reason:
         * these two are the pair somebody chooses between, and the wrong choice
         * is invisible until a P&L is read. Opening stock posts
         * `opening_balance` and credits 3101 Modal / Saldo Awal; an adjustment
         * credits 5201 Kerugian Persediaan, which is right for goods that
         * vanished and absurd for a shop's starting inventory. Adjacent rather
         * than merged: two named destinations are easier to aim at than one row
         * that could be either.
         *
         * Gated on `products:create` rather than on `stockMovements:create` —
         * the SAME grant that already posts an opening balance inside a product
         * create. It is the continuation of registering a catalogue, not a
         * correction to the ledger, and the seeded Staff role (products:read)
         * is untouched.
         */
        label: "Stok Awal",
        href: "/dashboard/inventory/opening-stock",
        icon: OpeningStockIcon,
        permission: { feature: "products", action: "create" },
      },
      {
        /**
         * Last, and that is the ordering doing its job rather than an
         * afterthought. An adjustment is the correction of last resort: a real
         * discrepancy is found by an opname, and goods that moved are moved by a
         * transfer. Putting it above either would offer the shortcut before the
         * procedure.
         *
         * NO LONGER THE DAY-ONE ROUTE. It used to be described here as how
         * opening stock is entered, which was true only because nothing else
         * could: a manual adjustment credits 5201 Kerugian Persediaan, so a
         * tenant's whole starting inventory arrived as a negative expense. Stok
         * Awal above posts it to capital.
         *
         * GATED ON `create` THOUGH THE PAGE ONLY NEEDS `read`. The route opens
         * on a list now, which anybody who may page the stock card may read —
         * but a menu row is an invitation, and inviting a role that cannot write
         * to a screen whose one action is a write is an invitation to a disabled
         * button. Reading it by URL still works, which is what the reports and
         * the stock card's links rely on.
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
        /**
         * Same shape as the Inventory hub, and `exact` for the same reason: its
         * href is the prefix of every sibling's, so prefix matching would light
         * this row up on all four screens below it.
         *
         * Ungated, like the Inventory hub — the page gates each section itself,
         * and the group still disappears entirely when no gated child survives.
         */
        label: "Ringkasan",
        href: "/dashboard/purchasing",
        icon: PurchasingIcon,
        exact: true,
      },
      {
        label: "Supplier",
        href: "/dashboard/purchasing/suppliers",
        icon: SupplierIcon,
        permission: { feature: "suppliers", action: "read" },
      },
      {
        /**
         * Directly under Supplier, because it is that list's setup screen — the
         * same neighbouring the Inventory group gives Kategori under Produk.
         *
         * `CategoryIcon`, shared with the product Kategori item, and that is the
         * intended reading: the two are the same kind of thing (a label set a
         * tenant maintains), told apart by which group they sit in rather than
         * by a second icon nobody would learn.
         *
         * Gated on its own feature, not on `suppliers`: a role that may read the
         * vendor list does not automatically get its taxonomy.
         */
        label: "Kategori Supplier",
        href: "/dashboard/purchasing/supplier-categories",
        icon: CategoryIcon,
        permission: { feature: "supplierCategories", action: "read" },
      },
      {
        label: "Penerimaan Barang",
        href: "/dashboard/purchasing/receipts",
        icon: ReceiptIcon,
        permission: { feature: "goodsReceipts", action: "read" },
      },
      {
        label: "Faktur Pembelian",
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
  /**
   * Gated on READING transactions rather than opening a shift: somebody who may
   * look at the day's sales but not ring one up should still reach the screen,
   * where the Buka Kasir form is what they will not be offered.
   */
  {
    // "Kasir", not "POS" — ui-rules §12 lists POS among the words the product
    // does not use. The route keeps its identifier.
    label: "Kasir",
    href: "/dashboard/pos",
    icon: PosIcon,
    permission: { feature: "posTransactions", action: "read" },
  },
  /**
   * A LEAF, not a group. The module has one destination — the receivables list —
   * and a dropdown over a single entry is a click that answers nothing. It grows
   * a Ringkasan and a create route with PCR-030.
   *
   * GATED, which it was not before: until the screen existed there was nothing
   * behind this link to protect, and docs/features/permission-gating.md lists it
   * among the sections without a catalog feature. It has one now, and who owes a
   * shop money is not something every role should see.
   */
  {
    label: "Sales & Invoice",
    href: "/dashboard/sales",
    icon: SalesIcon,
    permission: { feature: "customerInvoices", action: "read" },
  },
  /**
   * Keuangan — a GROUP rather than a leaf, now that the module has screens.
   *
   * Ordered the way double-entry bookkeeping is learned and the way the data
   * depends: the chart of accounts first, because a journal line has nowhere to
   * land without it, then the ledger those accounts are posted to. Reports
   * (laba rugi, neraca, arus kas) are queries over the ledger and will slot in
   * below it when they exist — they are deliberately not listed yet.
   */
  {
    label: "Keuangan",
    icon: FinanceIcon,
    children: [
      {
        // The hub, `exact` for the same reason the Inventory and Purchasing
        // ones are: its href is the prefix of every sibling's, so prefix
        // matching would light this row up on all of them. Ungated like those
        // two — the page gates each card itself.
        label: "Ringkasan",
        href: "/dashboard/keuangan",
        icon: FinanceIcon,
        exact: true,
      },
      {
        label: "Daftar Akun",
        href: "/dashboard/keuangan/chart-of-accounts",
        icon: AccountTreeIcon,
        permission: { feature: "chartOfAccounts", action: "read" },
      },
      {
        // Straight after the chart, because a channel's whole purpose is the
        // account it points at — you cannot map one before the accounts exist.
        label: "Kas & Bank",
        href: "/dashboard/keuangan/kas-bank",
        icon: Landmark,
        permission: { feature: "paymentChannels", action: "read" },
      },
      {
        label: "Jurnal Umum",
        href: "/dashboard/keuangan/journal-entries",
        icon: JournalIcon,
        permission: { feature: "journalEntries", action: "read" },
      },
      // The two reports sit between the ledger and the setup rows, because that
      // is the order they are used in: the ledger is what is recorded, these are
      // what it is read as, and Lini Bisnis is configuration visited twice a
      // year. Both are gated on `journalEntries` — a report is the ledger folded,
      // so there is no narrower grant that would make sense.
      {
        label: "Laba Rugi",
        href: "/dashboard/keuangan/laba-rugi",
        icon: FinanceIcon,
        permission: { feature: "journalEntries", action: "read" },
      },
      {
        label: "Arus Kas",
        href: "/dashboard/keuangan/arus-kas",
        icon: FinanceIcon,
        permission: { feature: "journalEntries", action: "read" },
      },
      {
        // Last of the four: the chart and the ledger are opened daily, while the
        // lines of business are set up once and revisited when the shop adds a
        // service.
        label: "Lini Bisnis",
        href: "/dashboard/keuangan/business-lines",
        icon: FinanceIcon,
        permission: { feature: "businessLines", action: "read" },
      },
    ],
  },
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
        // Directly under Customer, because that is the relationship: every pet
        // belongs to one, and the register is unreadable without knowing whose
        // animals you are looking at.
        label: "Hewan",
        href: "/dashboard/master/pets",
        icon: PawPrint,
        permission: { feature: "pets", action: "read" },
      },
      {
        // Beside Hewan rather than under Inventory → Produk, because the split is
        // about who edits: the groomer who prices a bath is not the person
        // pricing sacks of feed, and the RBAC catalogue makes the same split.
        label: "Layanan",
        href: "/dashboard/master/layanan",
        icon: Scissors,
        permission: { feature: "services", action: "read" },
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
 * itself dropped when no GATED child survives. Items with no `permission`
 * always pass. Pure — the Sidebar memoizes it against the current `can`.
 *
 * A group's survival is decided by its gated children alone. An ungated child
 * (the Inventory hub) rides along with whatever else the role may see, but
 * cannot on its own keep a group open: a role with no inventory grant at all
 * would then get an Inventory menu whose one destination is a landing page
 * telling it, seven times over, that it may not read any of this.
 */
export function filterNavItems(items: NavItem[], can: CanFn): NavItem[] {
  const allowed = (req?: PermissionRequirement) =>
    !req || can(req.feature, req.action);

  return items.reduce<NavItem[]>((visible, item) => {
    if (item.children) {
      const children = item.children.filter((child) =>
        allowed(child.permission),
      );
      if (children.some((child) => child.permission)) {
        visible.push({ ...item, children });
      }
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
    return item.children.some((child) =>
      isActiveHref(child.href, pathname, child.exact),
    );
  }
  return item.href ? isActiveHref(item.href, pathname, item.exact) : false;
}
