import { NAV_ITEMS, filterNavItems, type CanFn } from "@/features/dashboard/nav";

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
      "Roles",
    ]);
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
