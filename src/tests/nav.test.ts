import {
  NAV_ITEMS,
  filterNavItems,
  isActiveHref,
  type CanFn,
} from "@/features/dashboard/nav";

/**
 * The nav filter is the pure core of the sidebar gating: given a `can`
 * predicate it decides which sections survive. Testing it directly (rather than
 * through the Sidebar) keeps the permission logic honest without rendering.
 */
describe("filterNavItems", () => {
  const denyAll: CanFn = () => false;
  const allowAll: CanFn = () => true;

  it("keeps items with no permission requirement (Dashboard, Booking…)", () => {
    const labels = filterNavItems(NAV_ITEMS, denyAll).map((i) => i.label);
    // Every ungated leaf survives; only the gated group is dropped.
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Booking");
    expect(labels).not.toContain("Master Data");
  });

  it("hides the Master Data group when no child is permitted", () => {
    const master = filterNavItems(NAV_ITEMS, denyAll).find(
      (i) => i.label === "Master Data",
    );
    expect(master).toBeUndefined();
  });

  it("shows Master Data with only the permitted children", () => {
    const onlyUsers: CanFn = (feature, action) =>
      feature === "users" && action === "read";
    const master = filterNavItems(NAV_ITEMS, onlyUsers).find(
      (i) => i.label === "Master Data",
    );
    expect(master?.children?.map((c) => c.label)).toEqual(["User"]);
  });

  it("shows every Master Data child when all are permitted", () => {
    const master = filterNavItems(NAV_ITEMS, allowAll).find(
      (i) => i.label === "Master Data",
    );
    expect(master?.children?.map((c) => c.label)).toEqual([
      "User",
      "Branch",
      "Warehouse",
      "Customer",
      "Roles",
      "Audit Log",
    ]);
  });

  it("lists every Inventory screen, in the order the data flows", () => {
    const inventory = filterNavItems(NAV_ITEMS, allowAll).find(
      (i) => i.label === "Inventory",
    );

    // Define a product, watch its card, manage its lots, count it, move it,
    // correct it. Penyesuaian is LAST on purpose: a real discrepancy is found by
    // an opname and goods that moved are moved by a transfer, so offering the
    // by-hand correction above either would offer the shortcut before the
    // procedure.
    expect(inventory?.children?.map((c) => c.label)).toEqual([
      "Ringkasan",
      "Produk & Varian",
      "Kategori",
      "Kartu Stok",
      "Batch & Expired",
      "Stok Opname",
      "Transfer Stok",
      "Penyesuaian Stok",
    ]);
  });

  it("hides the three write screens from a read-only stock role", () => {
    // What the seeded Staff role holds: read on the ledger, never create. A
    // manual adjustment with no document behind it is the easiest way to hide a
    // shortage, so the menu must not offer one.
    const readOnlyStock: CanFn = (feature, action) =>
      feature === "stockMovements" && action === "read";

    const inventory = filterNavItems(NAV_ITEMS, readOnlyStock).find(
      (i) => i.label === "Inventory",
    );

    expect(inventory?.children?.map((c) => c.label)).toEqual([
      "Ringkasan",
      "Kartu Stok",
    ]);
  });

  it("drops the Inventory group entirely for a role with no stock grant", () => {
    // The hub link is ungated, so it survives the child filter — but it must not
    // be enough to keep the group open by itself, or a role that may read
    // nothing here gets a menu leading to a page that says exactly that.
    const inventory = filterNavItems(NAV_ITEMS, denyAll).find(
      (i) => i.label === "Inventory",
    );
    expect(inventory).toBeUndefined();
  });

  it("marks the Inventory hub active only on its own route", () => {
    // Its href is the prefix of all seven siblings, so prefix matching would
    // light this row up on every screen in the module.
    const hub = NAV_ITEMS.find((i) => i.label === "Inventory")?.children?.[0];
    expect(hub?.href).toBe("/dashboard/inventory");
    expect(isActiveHref(hub!.href, "/dashboard/inventory", hub!.exact)).toBe(
      true,
    );
    expect(
      isActiveHref(hub!.href, "/dashboard/inventory/products", hub!.exact),
    ).toBe(false);
  });

  it("does not mutate the source NAV_ITEMS", () => {
    const before = NAV_ITEMS.find((i) => i.label === "Master Data")?.children
      ?.length;
    filterNavItems(NAV_ITEMS, () => false);
    const after = NAV_ITEMS.find((i) => i.label === "Master Data")?.children
      ?.length;
    expect(after).toBe(before);
  });
});
