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
  House,
  Landmark,
  Network,
  Package,
  PackagePlus,
  PawPrint,
  Rocket,
  Scissors,
  ScrollText,
  Settings,
  Shield,
  ShoppingCart,
  Split,
  TrendingUp,
  Truck,
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
   * Extra route prefixes that light this row up as well as `href` does.
   *
   * For a row whose screen carries TABS THAT ARE ROUTES and one of those tabs
   * lives outside its own prefix — Produk & Varian's Kategori tab is
   * /dashboard/inventory/categories, a sibling of /products rather than a child.
   * Without this the rail shows nothing selected on a screen it opened itself.
   */
  match?: string[];
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
   * Extra route prefixes that light this row up as well as `href` does — see
   * NavChild.match, which is the same field for a submenu row.
   *
   * The leaf case is Pelanggan: its Hewan tab lives at /dashboard/master/pets,
   * which no amount of prefix-matching on /dashboard/master/customers covers.
   *
   * Prefix-matched like `href`, so a tab's own detail routes (…/pets/[id]) keep
   * the row lit too.
   */
  match?: string[];
  /**
   * The permission a leaf must hold to appear. Omitted means always visible. A
   * GROUP needs no requirement of its own: it shows when it has a visible child.
   */
  permission?: PermissionRequirement;
  /**
   * ANY ONE of these grants shows the row — for a leaf whose TABS are gated
   * separately, where no single permission describes the module.
   *
   * ONLY LEGAL WHEN `href` IS REACHABLE BY EVERYONE THE ROW IS SHOWN TO, which
   * in practice means an ungated hub. Pembelian qualifies: its href is the
   * landing page, which gates each of its own cards and refuses nothing. A row
   * whose href is itself gated must keep a single `permission` matching that
   * href — Pelanggan, Produk & Varian, Koreksi Stok and Stok all do — because
   * "any grant" would otherwise hand somebody a menu row that opens on a
   * refusal, which is worse than no row at all.
   *
   * Mutually exclusive with `permission` in practice; if both are set, both must
   * pass.
   */
  permissionAny?: PermissionRequirement[];
  /** See NavChild.badge — unset for the same reason. */
  badge?: number;
}

export interface NavSection {
  /** The grey heading above the rows. Not a route, not clickable. */
  label: string;
  items: NavItem[];
}

/**
 * WHY SOME MOCKUP LEAVES ARE STILL GROUPS HERE.
 *
 * buloo-navbar-v3 draws Pelanggan, Penjualan, Pembelian and Inventori as single
 * rows whose screens carry tabs (Faktur / Piutang / E-commerce / Retur…). Those
 * tabbed screens do not exist yet, and collapsing the menu to match would leave
 * the routes that DO exist — /purchasing/receipts, seven inventory screens —
 * reachable only by typing a URL. So each is a group over its real routes today,
 * and shrinks to a leaf when its tabbed screen is built.
 *
 * PELANGGAN ALREADY MADE THAT TRIP: its screen carries the mockup's tab bar, so
 * the group collapsed back into the single row the mockup asks for. It is the
 * worked example the other three follow.
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
        /**
         * A LEAF, the way the mockup draws it — the two-child group it used to
         * be is gone.
         *
         * Pelanggan and Hewan are two TABS on one screen now (see
         * CustomerModuleHeader), so the rail is back to one row and the tab bar
         * carries the split. `match` is what keeps that row lit while the Hewan
         * tab is open: the tab is a real route under a different prefix, and
         * without it the menu would go dark on half of its own module.
         *
         * Gated on `customers:read` — the grant its own href enforces. Every
         * seeded role holding `pets:read` holds it too (Owner, Manager, Staff),
         * so no role loses its way to the animal register; a hand-made role
         * granted pets alone would reach /dashboard/master/pets by URL only.
         */
        label: "Pelanggan",
        href: "/dashboard/master/customers",
        icon: Users,
        permission: { feature: "customers", action: "read" },
        match: ["/dashboard/master/pets"],
      },
    ],
  },
  {
    label: "Transaksi",
    items: [
      {
        /**
         * A LEAF, as the mockup draws it, with its four tabs on the screen (see
         * SalesModuleHeader): Faktur, Piutang, E-commerce, Retur.
         *
         * `match` reaches OUT OF ITS OWN PREFIX for exactly one of them.
         * E-commerce lives at /dashboard/ecommerce-sync — it predates this
         * module and is not a sales document — so no prefix of this href covers
         * it, and without the entry the rail would go dark on a tab it opened.
         *
         * Gated on `customerInvoices:read`, the grant its href enforces. Who
         * owes a shop money is among the most commercially sensitive material
         * here, so the row goes with that grant rather than with the two
         * ungated placeholder tabs riding along inside it.
         */
        label: "Penjualan",
        href: "/dashboard/sales",
        icon: ShoppingCart,
        permission: { feature: "customerInvoices", action: "read" },
        match: ["/dashboard/ecommerce-sync"],
      },
      /**
       * Pembelian — the supply side, and ONE ROW rather than the six-child group
       * it used to be. Every screen in the module is a tab of it now (see
       * PurchasingModuleHeader), in the order a purchase actually unfolds: the
       * landing page, then the vendor and how they are filed, then their goods
       * arriving, then what is owed for them, then what goes back.
       *
       * Kept separate from Inventori rather than folded into it, because the two
       * answer different questions and are usually done by different people.
       * Stock screens ask "what do we have"; these ask "who did we buy it from
       * and what do we still owe".
       *
       * NO `match` IS NEEDED, unlike the other tabbed rows: every tab lives
       * under /dashboard/purchasing, so this href's own prefix already covers
       * them. And no `exact` either, for the same reason — the row should light
       * up on all six.
       *
       * `permissionAny` RATHER THAN ONE `permission`, and this row is the reason
       * that field exists: five of its six tabs are gated on five different
       * features, so no single grant describes the module. It is legal here
       * because the href is the ungated hub — every card on it gates itself, so
       * whoever the row is shown to lands somewhere they may read. The six
       * grants below are exactly the five the hub's cards carry.
       */
      {
        label: "Pembelian",
        href: "/dashboard/purchasing",
        icon: Truck,
        permissionAny: [
          { feature: "suppliers", action: "read" },
          { feature: "supplierCategories", action: "read" },
          { feature: "goodsReceipts", action: "read" },
          { feature: "purchaseInvoices", action: "read" },
          { feature: "purchaseReturns", action: "read" },
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
            /**
             * ONE ROW FOR THE WHOLE CATALOGUE, as the mockup draws it. Kategori
             * used to be a row of its own directly beneath this one; it is a TAB
             * on this screen now (see CatalogModuleHeader), which is the shape
             * the two always had — you cannot file a product without one, and
             * neither list is read for long without the other.
             *
             * `match` keeps the row lit on that tab: /inventory/categories is a
             * SIBLING of /inventory/products, not a child, so no prefix of this
             * href will ever cover it.
             *
             * Gated on `products:read`, the grant its href enforces. A role
             * holding `categories:read` alone now reaches the category list by
             * URL only — the seeded roles grant the two together (Owner,
             * Manager, and Staff read both).
             */
            label: "Produk & Varian",
            href: "/dashboard/inventory/products",
            icon: Boxes,
            permission: { feature: "products", action: "read" },
            match: ["/dashboard/inventory/categories"],
          },
          {
            /**
             * ONE ROW FOR BOTH READINGS OF THE SAME STOCK, as the mockup draws
             * it. Kartu Stok answers "what happened to this product" and Batch &
             * Expired answers "what is on the shelf and how long has it got" —
             * a shop checking one almost always checks the other, and the rail
             * listed them as two subjects. They are tabs of one screen now (see
             * StockModuleHeader).
             *
             * `match` keeps the row lit on that second tab: /inventory/batches is
             * a SIBLING of /inventory/stock-card, so no prefix of this href
             * covers it.
             *
             * Gated on `stockMovements:read`, the grant its href enforces. The
             * seeded roles that hold it also hold `productBatches:read`, so no
             * role loses its way to the lot report; a hand-made role granted
             * batches alone reaches /inventory/batches by URL only.
             */
            label: "Stok",
            href: "/dashboard/inventory/stock-card",
            icon: ScrollText,
            permission: { feature: "stockMovements", action: "read" },
            match: ["/dashboard/inventory/batches"],
          },
          {
            /**
             * ONE ROW FOR BOTH WAYS A CORRECTION IS MADE, as the mockup draws it
             * — and as the mockup explains it: "Opname menghasilkan koreksi.
             * Keduanya dokumen yang sama, cuma cara membuatnya beda." Penyesuaian
             * Stok used to be a row of its own at the bottom of this group; it is
             * a TAB on this screen now (see StockCorrectionModuleHeader).
             *
             * `match` keeps the row lit on that tab: /inventory/adjustments is a
             * SIBLING of /inventory/opname, so no prefix of this href covers it.
             *
             * Gated on `stockOpnames:read`, NOT on the ledger's `create`.
             * Counting the shelves is Staff work — it is most of the labour an
             * opname costs — and the seeded Staff role deliberately holds
             * create/read/update here while holding only `read` on the ledger.
             * Gating this on `stockMovements:create` would have hidden the whole
             * feature from exactly the people who do it, while showing it to
             * anyone who can post a manual adjustment.
             *
             * WHAT THAT COSTS, stated plainly: the old Penyesuaian Stok row was
             * gated on `stockMovements:create` on purpose — a menu row is an
             * invitation and that screen's one action is a write. Its tab is
             * gated on `read` now, so a role holding the ledger's read but no
             * count grant loses this row entirely and reaches the adjustment list
             * by URL, while Staff (who holds both) is newly offered a list it was
             * always allowed to read. The create button inside is still gated on
             * create.
             */
            label: "Koreksi Stok",
            href: "/dashboard/inventory/opname",
            icon: ClipboardList,
            permission: { feature: "stockOpnames", action: "read" },
            match: ["/dashboard/inventory/adjustments"],
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
             * Day one — and it stands alone at the end of the group now, which
             * is a LOSS worth recording rather than a tidy-up. It used to sit
             * directly above Penyesuaian Stok because those two are the pair
             * somebody chooses between and the wrong choice is invisible until a
             * P&L is read: opening stock posts `opening_balance` and credits
             * 3101 Modal / Saldo Awal, while an adjustment credits 5201 Kerugian
             * Persediaan — right for goods that vanished, absurd for a shop's
             * starting inventory. The adjustment moved into Koreksi Stok, so the
             * adjacency that made the pair legible is gone and the two forms are
             * on their own to tell them apart.
             *
             * The mockup does not list this screen at all: stock awal is a step
             * of Pengaturan › Data Awal there. When that hub is built, this row
             * leaves Inventori and the loss above stops mattering.
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

  /**
   * A leaf survives when its own `permission` passes AND, if it names a set,
   * when at least one of `permissionAny` does. An empty set would be read as
   * "nobody" rather than as "no requirement", which is why the length check is
   * here rather than a bare `.some()`.
   */
  const leafAllowed = (item: NavItem) =>
    allowed(item.permission) &&
    (!item.permissionAny?.length || item.permissionAny.some(allowed));

  return items.reduce<NavItem[]>((visible, item) => {
    if (item.children) {
      const children = item.children.filter((child) =>
        allowed(child.permission),
      );
      if (children.some((child) => child.permission)) {
        visible.push({ ...item, children });
      }
    } else if (leafAllowed(item)) {
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

/**
 * Whether a submenu row is the active one — its own href, or any of the extra
 * prefixes its tabbed screen reaches (NavChild.match).
 *
 * The `match` prefixes are never `exact`: a tab's own detail routes belong to
 * the same row as the tab.
 */
export function isActiveChild(child: NavChild, pathname: string): boolean {
  return (
    isActiveHref(child.href, pathname, child.exact) ||
    (child.match ?? []).some((href) => isActiveHref(href, pathname))
  );
}

/** Whether a nav item (leaf or group) is active for the given pathname. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.children) {
    return item.children.some((child) => isActiveChild(child, pathname));
  }
  if (item.href && isActiveHref(item.href, pathname, item.exact)) return true;
  return (item.match ?? []).some((href) => isActiveHref(href, pathname));
}
