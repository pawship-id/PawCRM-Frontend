import type { ComponentType, SVGProps } from "react";
/*
  lucide-react only, per ui-rules §11 — the hand-rolled @/components/icons set
  is on the migration list and already collides with lucide on ChevronDownIcon.
  This file used to import 32 icons from there; the rail rebuild is the moment
  to stop, since every row here is being rewritten anyway.

  PawPrint despite §12's "no paw prints as bullets": that rule is about paw
  prints used as decoration, and this is the functional icon identifying the
  services module. A species-specific alternative (Dog, Cat) would pick a side
  the register deliberately does not.
*/
import {
  ArrowRightLeft,
  Bed,
  BookText,
  Boxes,
  Building2,
  Calculator,
  CalendarDays,
  Car,
  ChartColumn,
  ChartLine,
  ClipboardList,
  FileClock,
  FileText,
  House,
  Landmark,
  Layers,
  Network,
  Package,
  PackageCheck,
  PackagePlus,
  PawPrint,
  Receipt,
  RefreshCw,
  Rocket,
  Scissors,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Split,
  Store,
  Tag,
  TrendingUp,
  Truck,
  Undo2,
  UserCog,
  Users,
  Warehouse,
  Wallet,
  Wrench,
} from "lucide-react";
import type {
  Action,
  Feature,
  PermissionRequirement,
} from "@/features/permissions";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * The admin navigation — the single source of truth for both the Sidebar rows
 * and the active-route logic. Add a section here and it appears everywhere;
 * nothing else enumerates these routes.
 *
 * Three levels, not two: SECTIONS ("Utama", "Operasional"…) group the ITEMS,
 * and an item is either a LEAF (has `href`) or a GROUP (has `children`, an
 * expandable submenu such as Inventori). The section labels are printed in the
 * rail as small grey headings with a rule above them — they carry no route and
 * are not clickable.
 *
 * The five sections follow the mockup (buloo-navbar-v3.html) and read as the
 * shape of the business rather than of the codebase: what you open all day, the
 * animals, the money moving in and out, the books, and the things you set once.
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
   * "always visible" — sections without a catalog feature yet (Kasir…) carry no
   * requirement.
   */
  permission?: PermissionRequirement;
  /**
   * Count shown as a pill on the row. NOTHING SETS THIS YET, on purpose: the
   * mockup draws badges on six rows, and there is no endpoint behind any of
   * them. The rail already knows how to render one, so wiring a real count is a
   * one-line change here — a made-up number in the menu would be worse than no
   * number.
   */
  badge?: number;
}

export interface NavItem {
  label: string;
  icon: Icon;
  /** Present on a leaf item — the route it links to. */
  href?: string;
  /** Present on a group — the submenu children. */
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
  /** See NavChild.badge — unset for the same reason. */
  badge?: number;
}

export interface NavSection {
  /** The grey heading above the rows. Not a route, not clickable. */
  label: string;
  items: NavItem[];
}

/**
 * WHY SOME MOCKUP LEAVES ARE GROUPS HERE.
 *
 * buloo-navbar-v3 draws Pelanggan, Penjualan, Pembelian and Inventori as single
 * rows whose screens carry tabs (Pelanggan / Hewan / Membership / Riwayat…).
 * Those tabbed screens do not exist yet, and collapsing the menu to match would
 * leave the routes that DO exist — /master/pets, /purchasing/receipts, seven
 * inventory screens — reachable only by typing a URL. So each is a group over
 * its real routes today, and shrinks to a leaf when its tabbed screen is built.
 *
 * Pengaturan is the same bargain: the mockup gives it five hub pages of cards,
 * which is page work rather than chrome. Until those exist it carries the old
 * Master Data children, relabelled into Indonesian per §12.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Utama",
    items: [
      { label: "Beranda", href: "/dashboard", icon: House, exact: true },
      {
        /**
         * Gated on READING transactions rather than opening a shift: somebody
         * who may look at the day's sales but not ring one up should still
         * reach the screen, where the Buka Kasir form is what they will not be
         * offered.
         */
        label: "Kasir",
        href: "/dashboard/pos",
        icon: Calculator,
        permission: { feature: "posTransactions", action: "read" },
      },
    ],
  },
  {
    label: "Operasional",
    items: [
      {
        label: "Layanan",
        icon: PawPrint,
        children: [
          {
            /**
             * The booking list, which is today the only real screen in this
             * group. Prefix-matched (no `exact`) so /kalender, /new and /[id]
             * keep the row lit.
             *
             * Gated `bookings:read`, the same grant every booking route
             * enforces — without it a user who cannot read bookings would see
             * the menu, click it, and be told the list "tidak bisa dimuat",
             * which reads as a fault rather than a permission they do not have.
             */
            label: "Hari Ini",
            href: "/dashboard/booking",
            icon: CalendarDays,
            permission: { feature: "bookings", action: "read" },
          },
          {
            label: "Grooming",
            href: "/dashboard/layanan/grooming",
            icon: Scissors,
          },
          { label: "Hotel", href: "/dashboard/hotel", icon: Bed },
          {
            label: "Antar-Jemput",
            href: "/dashboard/layanan/antar-jemput",
            icon: Car,
          },
        ],
      },
      {
        label: "Pelanggan",
        icon: Users,
        children: [
          {
            label: "Pelanggan",
            href: "/dashboard/master/customers",
            icon: Users,
            permission: { feature: "customers", action: "read" },
          },
          {
            // Directly under Pelanggan, because that is the relationship: every
            // pet belongs to one, and the register is unreadable without
            // knowing whose animals you are looking at.
            label: "Hewan",
            href: "/dashboard/master/pets",
            icon: PawPrint,
            permission: { feature: "pets", action: "read" },
          },
        ],
      },
    ],
  },
  {
    label: "Transaksi",
    items: [
      {
        label: "Penjualan",
        icon: ShoppingCart,
        children: [
          {
            /**
             * GATED, which the old Sales & Invoice leaf was not until the
             * screen existed: who owes a shop money is not something every role
             * should see.
             */
            label: "Faktur",
            href: "/dashboard/sales",
            icon: FileText,
            permission: { feature: "customerInvoices", action: "read" },
          },
          {
            // A placeholder screen, and ungated — so it rides along with the
            // invoice grant rather than keeping this group open by itself.
            label: "E-commerce",
            href: "/dashboard/ecommerce-sync",
            icon: RefreshCw,
          },
        ],
      },
      /**
       * Purchasing — the supply side, ordered the way a purchase actually
       * unfolds: you set up a supplier, receive their goods, owe them money, and
       * sometimes send some of it back.
       *
       * Kept separate from Inventori rather than folded into it, because the two
       * answer different questions and are usually done by different people.
       * Stock screens ask "what do we have"; these ask "who did we buy it from
       * and what do we still owe".
       */
      {
        label: "Pembelian",
        icon: Truck,
        children: [
          {
            /**
             * The hub, `exact` because its href is the prefix of every
             * sibling's — prefix matching would light this row up on all four
             * screens below it. Ungated: the page gates each section itself, and
             * the group still disappears entirely when no gated child survives.
             */
            label: "Ringkasan",
            href: "/dashboard/purchasing",
            icon: Truck,
            exact: true,
          },
          {
            label: "Supplier",
            href: "/dashboard/purchasing/suppliers",
            icon: Store,
            permission: { feature: "suppliers", action: "read" },
          },
          {
            // Directly under Supplier, because it is that list's setup screen —
            // the same neighbouring Kategori gets under Produk. Gated on its own
            // feature: a role that may read the vendor list does not
            // automatically get its taxonomy.
            label: "Kategori Supplier",
            href: "/dashboard/purchasing/supplier-categories",
            icon: Tag,
            permission: { feature: "supplierCategories", action: "read" },
          },
          {
            label: "Penerimaan Barang",
            href: "/dashboard/purchasing/receipts",
            icon: PackageCheck,
            permission: { feature: "goodsReceipts", action: "read" },
          },
          {
            label: "Faktur Pembelian",
            href: "/dashboard/purchasing/payables",
            icon: Receipt,
            permission: { feature: "purchaseInvoices", action: "read" },
          },
          {
            label: "Retur ke Supplier",
            href: "/dashboard/purchasing/returns",
            icon: Undo2,
            permission: { feature: "purchaseReturns", action: "read" },
          },
        ],
      },
      /**
       * Ordered by how the data flows rather than alphabetically — you define a
       * product, then watch its card, then manage its lots, then count it, then
       * move it, and only then correct it by hand. A reader learning the module
       * top-down learns it in the right order.
       */
      {
        label: "Inventori",
        icon: Package,
        children: [
          {
            /**
             * The hub, first — the one screen in the module the menu used to
             * have no way of reaching at all, so the alert lists it exists for
             * (perlu restock, mendekati kedaluwarsa) could only be found by
             * typing the URL.
             *
             * Ungated, unlike its siblings, because it has no single feature
             * behind it: every card and both lists gate themselves, so the page
             * is already exactly as much as the role may read. filterNavItems
             * ignores it when deciding whether the group survives — see there.
             *
             * `exact`, because its href is the prefix of every sibling's.
             */
            label: "Ringkasan",
            href: "/dashboard/inventory",
            icon: Package,
            exact: true,
          },
          {
            label: "Produk & Varian",
            href: "/dashboard/inventory/products",
            icon: Boxes,
            permission: { feature: "products", action: "read" },
          },
          {
            // Directly under products, and above the stock screens, because it
            // is the other half of the catalogue rather than an activity: you
            // cannot file a product without one.
            label: "Kategori",
            href: "/dashboard/inventory/categories",
            icon: Tag,
            permission: { feature: "categories", action: "read" },
          },
          {
            label: "Kartu Stok",
            href: "/dashboard/inventory/stock-card",
            icon: ScrollText,
            permission: { feature: "stockMovements", action: "read" },
          },
          {
            label: "Batch & Expired",
            href: "/dashboard/inventory/batches",
            icon: Layers,
            permission: { feature: "productBatches", action: "read" },
          },
          {
            /**
             * Gated on `stockOpnames:read`, NOT on the ledger's `create`.
             *
             * Counting the shelves is Staff work — it is most of the labour an
             * opname costs — and the seeded Staff role deliberately holds
             * create/read/update here while holding only `read` on the ledger.
             * Gating this on `stockMovements:create` would have hidden the whole
             * feature from exactly the people who do it, while showing it to
             * anyone who can post a manual adjustment.
             */
            label: "Stok Opname",
            href: "/dashboard/inventory/opname",
            icon: ClipboardList,
            permission: { feature: "stockOpnames", action: "read" },
          },
          {
            /**
             * GATED ON `create` THOUGH THE PAGE ONLY NEEDS `read` — the same
             * call Penyesuaian Stok makes below, and for the same reason. This
             * route opens on a list, which anybody who may page the stock card
             * may read, but a menu row is an invitation and the screen's one
             * action is a write. Reading it by URL still works.
             */
            label: "Transfer Stok",
            href: "/dashboard/inventory/transfers",
            icon: ArrowRightLeft,
            permission: { feature: "stockMovements", action: "create" },
          },
          {
            /**
             * Day one, and it sits directly above the adjustment for that
             * reason: these two are the pair somebody chooses between, and the
             * wrong choice is invisible until a P&L is read. Opening stock posts
             * `opening_balance` and credits 3101 Modal / Saldo Awal; an
             * adjustment credits 5201 Kerugian Persediaan, which is right for
             * goods that vanished and absurd for a shop's starting inventory.
             *
             * Gated on `products:create` rather than `stockMovements:create` —
             * the SAME grant that already posts an opening balance inside a
             * product create. It is the continuation of registering a catalogue,
             * not a correction to the ledger.
             */
            label: "Stok Awal",
            href: "/dashboard/inventory/opening-stock",
            icon: PackagePlus,
            permission: { feature: "products", action: "create" },
          },
          {
            /**
             * Last, and that is the ordering doing its job rather than an
             * afterthought. An adjustment is the correction of last resort: a
             * real discrepancy is found by an opname, and goods that moved are
             * moved by a transfer. Putting it above either would offer the
             * shortcut before the procedure. Gated on `create` for the same
             * reason Transfer Stok is.
             */
            label: "Penyesuaian Stok",
            href: "/dashboard/inventory/adjustments",
            icon: SlidersHorizontal,
            permission: { feature: "stockMovements", action: "create" },
          },
        ],
      },
    ],
  },
  {
    label: "Keuangan",
    items: [
      /**
       * Ordered the way double-entry bookkeeping is learned and the way the data
       * depends: the chart of accounts first, because a journal line has nowhere
       * to land without it, then the ledger those accounts are posted to, then
       * the reports that read it.
       */
      {
        label: "Keuangan",
        icon: Wallet,
        children: [
          {
            // The hub, `exact` for the same reason the Inventori and Pembelian
            // ones are. Ungated — the page gates each card itself.
            label: "Ringkasan",
            href: "/dashboard/keuangan",
            icon: Wallet,
            exact: true,
          },
          {
            label: "Daftar Akun",
            href: "/dashboard/keuangan/chart-of-accounts",
            icon: Network,
            permission: { feature: "chartOfAccounts", action: "read" },
          },
          {
            // Straight after the chart, because a channel's whole purpose is the
            // account it points at — you cannot map one before the accounts
            // exist.
            label: "Kas & Bank",
            href: "/dashboard/keuangan/kas-bank",
            icon: Landmark,
            permission: { feature: "paymentChannels", action: "read" },
          },
          {
            label: "Jurnal Umum",
            href: "/dashboard/keuangan/journal-entries",
            icon: BookText,
            permission: { feature: "journalEntries", action: "read" },
          },
          // The two reports sit between the ledger and the setup row, because
          // that is the order they are used in. Both gated on `journalEntries` —
          // a report is the ledger folded, so there is no narrower grant that
          // would make sense.
          {
            label: "Laba Rugi",
            href: "/dashboard/keuangan/laba-rugi",
            icon: TrendingUp,
            permission: { feature: "journalEntries", action: "read" },
          },
          {
            label: "Arus Kas",
            href: "/dashboard/keuangan/arus-kas",
            icon: ChartLine,
            permission: { feature: "journalEntries", action: "read" },
          },
          {
            // Last of the group: the chart and the ledger are opened daily,
            // while the lines of business are set up once and revisited when the
            // shop adds a service.
            label: "Lini Bisnis",
            href: "/dashboard/keuangan/business-lines",
            icon: Split,
            permission: { feature: "businessLines", action: "read" },
          },
        ],
      },
      {
        /**
         * A LEAF, not a group, unlike its four neighbours — and deliberately so.
         * The sub-reports are reached from ReportsHub, which gates each card on
         * the grant its own destination enforces; listing them here would
         * duplicate that gating in a second place and get it wrong.
         */
        label: "Laporan",
        href: "/dashboard/reports",
        icon: ChartColumn,
      },
    ],
  },
  {
    label: "Sistem",
    items: [
      {
        label: "Pengaturan",
        icon: Settings,
        children: [
          { label: "Umum", href: "/dashboard/pengaturan/umum", icon: Wrench },
          {
            // Beside the customer register rather than under Inventori → Produk,
            // because the split is about who edits: the groomer who prices a
            // bath is not the person pricing sacks of feed, and the RBAC
            // catalogue makes the same split.
            label: "Layanan",
            href: "/dashboard/master/layanan",
            icon: Scissors,
            permission: { feature: "services", action: "read" },
          },
          {
            label: "Pengguna",
            href: "/dashboard/master/users",
            icon: UserCog,
            permission: { feature: "users", action: "read" },
          },
          {
            label: "Peran",
            href: "/dashboard/master/roles",
            icon: Shield,
            permission: { feature: "roles", action: "read" },
          },
          {
            label: "Cabang",
            href: "/dashboard/master/branches",
            icon: Building2,
            permission: { feature: "branches", action: "read" },
          },
          {
            // Directly under Cabang: a warehouse is its sibling, not its child —
            // stock location vs. bookkeeping unit — and the pair is read
            // together.
            label: "Gudang",
            href: "/dashboard/master/warehouses",
            icon: Warehouse,
            permission: { feature: "warehouses", action: "read" },
          },
          {
            label: "Riwayat Perubahan",
            href: "/dashboard/master/audit-logs",
            icon: FileClock,
            permission: { feature: "auditLogs", action: "read" },
          },
          {
            label: "Data Awal",
            href: "/dashboard/pengaturan/data-awal",
            icon: Rocket,
          },
        ],
      },
    ],
  },
];

/** Predicate matching usePermissions().can — lets the filter stay pure/testable. */
export type CanFn = (feature: Feature, action: Action) => boolean;

/**
 * Narrows one section's items to what `can` permits: a leaf is dropped when its
 * `permission` is not granted; a group keeps only its permitted children and is
 * itself dropped when no GATED child survives. Items with no `permission` always
 * pass. Pure — the Sidebar memoizes it against the current `can`.
 *
 * A group's survival is decided by its gated children alone. An ungated child
 * (the Inventori hub, the Grooming placeholder) rides along with whatever else
 * the role may see, but cannot on its own keep a group open: a role with no
 * inventory grant at all would then get an Inventori menu whose one destination
 * is a landing page telling it, seven times over, that it may not read any of
 * this.
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

/**
 * The same filter over the whole rail, dropping any section left with no items.
 * A section label is a heading with a rule above it; one printed over nothing
 * reads as a menu that failed to load.
 */
export function filterNavSections(
  sections: NavSection[],
  can: CanFn,
): NavSection[] {
  return sections.reduce<NavSection[]>((visible, section) => {
    const items = filterNavItems(section.items, can);
    if (items.length) visible.push({ ...section, items });
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
