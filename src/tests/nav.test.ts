import {
  NAV_SECTIONS,
  filterNavItems,
  filterNavSections,
  isActive,
  isActiveChild,
  isActiveHref,
  type CanFn,
  type NavItem,
} from "@/features/dashboard/nav";

/**
 * The nav filter is the pure core of the sidebar gating: given a `can` predicate
 * it decides which rows survive. Testing it directly (rather than through the
 * Sidebar) keeps the permission logic honest without rendering.
 */
const denyAll: CanFn = () => false;
const allowAll: CanFn = () => true;

/** Every item across every section, which is what the old flat NAV_ITEMS was. */
function itemsOf(can: CanFn): NavItem[] {
  return filterNavSections(NAV_SECTIONS, can).flatMap(
    (section) => section.items,
  );
}

function groupChildren(can: CanFn, label: string): string[] | undefined {
  return itemsOf(can)
    .find((item) => item.label === label)
    ?.children?.map((child) => child.label);
}

describe("filterNavItems", () => {
  it("keeps items with no permission requirement (Beranda…)", () => {
    const labels = itemsOf(denyAll).map((i) => i.label);
    // Every ungated leaf survives; the gated ones are dropped.
    expect(labels).toContain("Beranda");
    expect(labels).not.toContain("Pengaturan");
  });

  /*
    GATED ONCE THE SCREEN BECAME REAL. While Booking was a placeholder the link
    cost nothing to show; the list behind it is gated `bookings:read` on every
    route, so an ungated menu would send a user who cannot read bookings to a
    screen that reports a load failure rather than a permission.
  */
  it("hides the booking list from somebody who cannot read bookings", () => {
    expect(groupChildren(denyAll, "Layanan")).toBeUndefined();
  });

  it("shows it to somebody who can, with its placeholder siblings", () => {
    const onlyBookings: CanFn = (feature, action) =>
      feature === "bookings" && action === "read";
    // The three placeholder screens are ungated, so they ride along with the
    // one grant that keeps the group open.
    expect(groupChildren(onlyBookings, "Layanan")).toEqual([
      "Hari Ini",
      "Grooming",
      "Hotel",
      "Antar-Jemput",
    ]);
  });

  it("hides the Pengaturan group when no child is permitted", () => {
    expect(itemsOf(denyAll).find((i) => i.label === "Pengaturan")).toBeUndefined();
  });

  it("shows Pengaturan with only the permitted children", () => {
    const onlyUsers: CanFn = (feature, action) =>
      feature === "users" && action === "read";
    // Umum and Data Awal are ungated placeholders and come along; everything
    // else in the group needs its own grant.
    expect(groupChildren(onlyUsers, "Pengaturan")).toEqual([
      "Umum",
      "Pengguna",
      "Data Awal",
    ]);
  });

  /*
    THE CATALOGUE IS ONE ROW. Kategori was a row of its own directly beneath
    Produk & Varian; it is a tab on that screen now, so the rail carries one row
    and `match` keeps it lit on the sibling route the tab points at.
  */
  it("carries the catalogue as one row, with Kategori folded into it", () => {
    const children = groupChildren(allowAll, "Inventori");
    expect(children).toContain("Produk & Varian");
    expect(children).not.toContain("Kategori");
  });

  it("keeps Produk & Varian lit on the Kategori tab and its detail routes", () => {
    const catalogue = groupOf("Inventori")?.children?.find(
      (child) => child.label === "Produk & Varian",
    );
    if (!catalogue) throw new Error("Produk & Varian is missing from the rail");
    expect(isActiveChild(catalogue, "/dashboard/inventory/products")).toBe(
      true,
    );
    expect(isActiveChild(catalogue, "/dashboard/inventory/categories")).toBe(
      true,
    );
    expect(
      isActiveChild(catalogue, "/dashboard/inventory/categories/507f1f"),
    ).toBe(true);
    // A sibling under the same /inventory prefix must not borrow the row.
    expect(isActiveChild(catalogue, "/dashboard/inventory/batches")).toBe(
      false,
    );
  });

  it("hides the catalogue row from a role that cannot read products", () => {
    // The row is the product list's, so it goes with that grant — and with it
    // goes the menu route to the category list, which every seeded role holding
    // categories:read also holds products:read for.
    const onlyCategories: CanFn = (feature, action) =>
      feature === "categories" && action === "read";
    expect(groupChildren(onlyCategories, "Inventori")).toBeUndefined();
  });

  it("lists every Inventori screen, in the order the data flows", () => {
    // Define a product, watch its card, manage its lots, count it, move it.
    //
    // Stok Awal is LAST and alone, which the mockup's shape cost us: it used to
    // sit directly above Penyesuaian Stok, and the adjacency was the point —
    // those two are the pair somebody chooses between, and the wrong choice is
    // invisible until a P&L is read (opening stock credits 3101 Modal / Saldo
    // Awal; an adjustment credits 5201 Kerugian Persediaan, which turns a shop's
    // starting inventory into a negative expense). The adjustment is a tab of
    // Koreksi Stok now. The mockup does not list Stok Awal here at all — it is a
    // step of Pengaturan › Data Awal there — so this row is on its way out.
    expect(groupChildren(allowAll, "Inventori")).toEqual([
      "Ringkasan",
      // Neither Kategori nor Penyesuaian Stok is missing — each is a TAB of the
      // row that absorbed it.
      "Produk & Varian",
      // Kartu Stok and Batch & Expired, folded into one row with two tabs.
      "Stok",
      "Koreksi Stok",
      "Transfer Stok",
      "Stok Awal",
    ]);
  });

  /*
    STOK IS ONE ROW. Kartu Stok reads a product's history, Batch & Expired reads
    what is on the shelf and how long it has got — two readings of the same
    stock, so two tabs of one screen.
  */
  it("keeps Stok lit on the Batch & Expired tab and on one product's card", () => {
    const stock = groupOf("Inventori")?.children?.find(
      (child) => child.label === "Stok",
    );
    if (!stock) throw new Error("Stok is missing from the rail");

    expect(isActiveChild(stock, "/dashboard/inventory/stock-card")).toBe(true);
    // One product's card is what the index exists to open — same tab.
    expect(isActiveChild(stock, "/dashboard/inventory/stock-card/507f1f")).toBe(
      true,
    );
    expect(isActiveChild(stock, "/dashboard/inventory/batches")).toBe(true);
    expect(isActiveChild(stock, "/dashboard/inventory/transfers")).toBe(false);
  });

  /*
    KOREKSI STOK IS ONE ROW. An opname and a hand-typed adjustment end as the
    same correction in the ledger — one arrives by walking the shelves, the other
    by somebody typing what broke — so they are two tabs of one screen, and
    `match` keeps the row lit on the sibling route the second tab points at.
  */
  it("keeps Koreksi Stok lit on the Penyesuaian tab and its detail routes", () => {
    const corrections = groupOf("Inventori")?.children?.find(
      (child) => child.label === "Koreksi Stok",
    );
    if (!corrections) throw new Error("Koreksi Stok is missing from the rail");

    expect(isActiveChild(corrections, "/dashboard/inventory/opname")).toBe(true);
    expect(isActiveChild(corrections, "/dashboard/inventory/adjustments")).toBe(
      true,
    );
    expect(
      isActiveChild(corrections, "/dashboard/inventory/adjustments/new"),
    ).toBe(true);
    // Stok Awal is the OTHER screen StockEntriesScreen serves, and it keeps its
    // own row — it must not borrow this one.
    expect(
      isActiveChild(corrections, "/dashboard/inventory/opening-stock"),
    ).toBe(false);
  });

  it("hides the three write screens from a read-only stock role", () => {
    // What the seeded Staff role holds: read on the ledger, never create. A
    // manual adjustment with no document behind it is the easiest way to hide a
    // shortage, so the menu must not offer one.
    const readOnlyStock: CanFn = (feature, action) =>
      feature === "stockMovements" && action === "read";

    expect(groupChildren(readOnlyStock, "Inventori")).toEqual([
      "Ringkasan",
      "Stok",
    ]);
  });

  it("drops the Inventori group entirely for a role with no stock grant", () => {
    // The hub link is ungated, so it survives the child filter — but it must not
    // be enough to keep the group open by itself, or a role that may read
    // nothing here gets a menu leading to a page that says exactly that.
    expect(itemsOf(denyAll).find((i) => i.label === "Inventori")).toBeUndefined();
  });

  it("marks the Inventori hub active only on its own route", () => {
    // Its href is the prefix of all eight siblings, so prefix matching would
    // light this row up on every screen in the module.
    const hub = groupOf("Inventori")?.children?.[0];
    expect(hub?.href).toBe("/dashboard/inventory");
    expect(isActiveHref(hub!.href, "/dashboard/inventory", hub!.exact)).toBe(
      true,
    );
    expect(
      isActiveHref(hub!.href, "/dashboard/inventory/products", hub!.exact),
    ).toBe(false);
  });

  /*
    PELANGGAN IS A LEAF AGAIN. It was a two-child group only while the tabbed
    screen the mockup draws did not exist; that screen exists now, so the rail is
    back to the single row — and `match` is what keeps it lit while the reader is
    on the tab that lives outside its own href.
  */
  it("carries Pelanggan as one row, not a group", () => {
    const pelanggan = groupOf("Pelanggan");
    expect(pelanggan?.children).toBeUndefined();
    expect(pelanggan?.href).toBe("/dashboard/master/customers");
  });

  it("keeps the Pelanggan row lit on the Hewan tab and its detail routes", () => {
    const pelanggan = groupOf("Pelanggan")!;
    expect(isActive(pelanggan, "/dashboard/master/customers")).toBe(true);
    expect(isActive(pelanggan, "/dashboard/master/pets")).toBe(true);
    expect(isActive(pelanggan, "/dashboard/master/pets/507f1f")).toBe(true);
    // A sibling under the same /master prefix must not borrow the row.
    expect(isActive(pelanggan, "/dashboard/master/users")).toBe(false);
  });

  it("hides Pelanggan from a role that cannot read customers", () => {
    // The row is the customer list's, so it goes with that grant — and with it
    // goes the menu route to the animal register, which every seeded role that
    // holds pets:read also holds customers:read for.
    const onlyPets: CanFn = (feature, action) =>
      feature === "pets" && action === "read";
    expect(itemsOf(onlyPets).find((i) => i.label === "Pelanggan")).toBeUndefined();
  });

  /*
    PENJUALAN IS ONE ROW, and the only one whose tabs reach outside its own
    prefix: E-commerce predates this module and keeps its route.
  */
  it("carries Penjualan as one row, lit on its E-commerce tab too", () => {
    const sales = itemsOf(allowAll).find((i) => i.label === "Penjualan");
    expect(sales?.children).toBeUndefined();
    expect(sales?.href).toBe("/dashboard/sales");

    expect(isActive(sales!, "/dashboard/sales")).toBe(true);
    // Its own placeholder tabs and detail routes ride on the href's prefix.
    expect(isActive(sales!, "/dashboard/sales/piutang")).toBe(true);
    expect(isActive(sales!, "/dashboard/ecommerce-sync")).toBe(true);
  });

  /*
    PEMBELIAN IS ONE ROW. All six of its screens are tabs of it now, so what the
    rail owes is no longer an order of children — it is a row that survives for
    anyone with ANY purchasing grant, and dies for somebody with none.
  */
  it("carries Pembelian as one row pointing at its hub", () => {
    const purchasing = itemsOf(allowAll).find((i) => i.label === "Pembelian");
    expect(purchasing?.children).toBeUndefined();
    expect(purchasing?.href).toBe("/dashboard/purchasing");
    // No `match` and no `exact`: every tab lives under this href's own prefix,
    // so it lights up on all six and on their detail routes.
    expect(purchasing?.exact).toBeUndefined();
    expect(purchasing?.match).toBeUndefined();
  });

  it("shows Pembelian to a role holding ANY ONE of its grants", () => {
    // The row's href is the ungated hub, which gates each of its own cards — so
    // whoever it is shown to lands somewhere they may read. That is the whole
    // condition `permissionAny` is legal under.
    const onlyReturns: CanFn = (feature, action) =>
      feature === "purchaseReturns" && action === "read";
    const onlySuppliers: CanFn = (feature, action) =>
      feature === "suppliers" && action === "read";

    expect(itemsOf(onlyReturns).find((i) => i.label === "Pembelian")).toBeDefined();
    expect(
      itemsOf(onlySuppliers).find((i) => i.label === "Pembelian"),
    ).toBeDefined();
  });

  it("drops Pembelian for a role with no purchasing grant at all", () => {
    // The hub is ungated, and must not be enough to keep the row on its own: a
    // role that may read nothing here would get a menu leading to a landing page
    // that says exactly that, five times over.
    expect(itemsOf(denyAll).find((i) => i.label === "Pembelian")).toBeUndefined();
  });

  it("orders Keuangan as the accounts the ledger needs, then the ledger", () => {
    // A journal line has nowhere to land without an account, so the COA comes
    // first — the menu teaches the dependency.
    expect(groupChildren(allowAll, "Keuangan")).toEqual([
      "Ringkasan",
      "Daftar Akun",
      // Straight after the chart, because a channel's whole purpose is the
      // account it points at.
      "Kas & Bank",
      "Jurnal Umum",
      // The two reports read the ledger above them, so they follow it rather
      // than lead — the menu is in the order the work happens.
      "Laba Rugi",
      "Arus Kas",
      // Last: set up once and revisited when the shop adds a service, where the
      // rows above it are opened daily.
      "Lini Bisnis",
    ]);
  });

  it("shows Keuangan with only the ledger for a journal-only role", () => {
    // The hub rides along ungated; the COA link does not, because reading the
    // ledger says nothing about being allowed to read the chart of accounts.
    //
    // The two reports DO come along, and that is the grant working as intended
    // rather than a leak: a laba rugi is the ledger folded, so anybody who may
    // page the entries could add them up themselves.
    const onlyJournal: CanFn = (feature, action) =>
      feature === "journalEntries" && action === "read";

    expect(groupChildren(onlyJournal, "Keuangan")).toEqual([
      "Ringkasan",
      "Jurnal Umum",
      "Laba Rugi",
      "Arus Kas",
    ]);
  });

  it("does not mutate the source NAV_SECTIONS", () => {
    const before = groupOf("Pengaturan")?.children?.length;
    filterNavSections(NAV_SECTIONS, denyAll);
    const after = groupOf("Pengaturan")?.children?.length;
    expect(after).toBe(before);
  });
});

/**
 * The section layer, which is what the rail draws its headings from. A heading
 * printed over nothing reads as a menu that failed to load, so an emptied
 * section has to disappear along with its items.
 */
describe("filterNavSections", () => {
  it("names the five sections in the order the rail draws them", () => {
    expect(filterNavSections(NAV_SECTIONS, allowAll).map((s) => s.label)).toEqual(
      ["Utama", "Operasional", "Transaksi", "Keuangan", "Sistem"],
    );
  });

  it("drops a section once every item in it is filtered away", () => {
    // Deny-all leaves Utama (Beranda is ungated) and Keuangan (Laporan is), and
    // nothing else: the other three sections are groups whose survival needs a
    // gated child.
    expect(filterNavSections(NAV_SECTIONS, denyAll).map((s) => s.label)).toEqual([
      "Utama",
      "Keuangan",
    ]);
  });

  it("filters the items inside a surviving section", () => {
    const utama = filterNavSections(NAV_SECTIONS, denyAll).find(
      (s) => s.label === "Utama",
    );
    // Kasir is gated on posTransactions:read; Beranda is not gated at all.
    expect(utama?.items.map((i) => i.label)).toEqual(["Beranda"]);
  });

  it("is filterNavItems applied per section", () => {
    // The two must not drift: the section filter exists only to drop empties.
    const perSection = filterNavSections(NAV_SECTIONS, allowAll).flatMap(
      (s) => s.items.map((i) => i.label),
    );
    const flat = NAV_SECTIONS.flatMap((s) =>
      filterNavItems(s.items, allowAll).map((i) => i.label),
    );
    expect(perSection).toEqual(flat);
  });
});

function groupOf(label: string) {
  return NAV_SECTIONS.flatMap((section) => section.items).find(
    (item) => item.label === label,
  );
}
