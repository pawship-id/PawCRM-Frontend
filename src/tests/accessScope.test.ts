import {
  accessibleBranches,
  accessibleWarehouses,
  canAccessWarehouse,
} from "@/utils/accessScope";
import type { User } from "@/types/api";

/**
 * The client-side mirror of the server's stock isolation.
 *
 * Worth its own suite because it is a COPY of a rule that lives elsewhere: the
 * cases below are the same ones asserted in the backend's
 * `warehouseScope.test.js`, so a change on one side that is not made on the
 * other shows up as a disagreement here rather than as a picker that offers a
 * choice the API then refuses.
 */
const BRANCH_A = "b1";
const BRANCH_B = "b2";

const shelfA1 = { _id: "w-a1", defaultBranchId: BRANCH_A };
const shelfA2 = { _id: "w-a2", defaultBranchId: BRANCH_A };
const shelfB1 = { _id: "w-b1", defaultBranchId: BRANCH_B };
const central = { _id: "w-central", defaultBranchId: null };

function user(overrides: Partial<User>): User {
  return { allBranches: false, branchAccess: [], ...overrides } as User;
}

describe("accessScope", () => {
  describe("allBranches", () => {
    it("reaches every warehouse without consulting a list", () => {
      const owner = user({ allBranches: true });

      expect(canAccessWarehouse(owner, shelfA1)).toBe(true);
      expect(canAccessWarehouse(owner, shelfB1)).toBe(true);
      expect(canAccessWarehouse(owner, central)).toBe(true);
    });

    it("keeps the whole branch list rather than enumerating it", () => {
      // A branch opened after they signed in must still appear.
      const branches = [{ _id: BRANCH_A }, { _id: BRANCH_B }];

      expect(accessibleBranches(user({ allBranches: true }), branches)).toBe(
        branches,
      );
    });
  });

  describe("shared warehouses", () => {
    it("come with any branch access at all", () => {
      const narrow = user({
        branchAccess: [BRANCH_A],
        warehouseAccess: [
          { branchId: BRANCH_A, allWarehouses: false, warehouseIds: ["w-a1"] },
        ],
      });

      expect(canAccessWarehouse(narrow, central)).toBe(true);
    });

    it("are out of reach for a user scoped to no branch", () => {
      expect(canAccessWarehouse(user({ branchAccess: [] }), central)).toBe(
        false,
      );
    });
  });

  describe("specific branches", () => {
    const storekeeper = user({
      branchAccess: [BRANCH_A, BRANCH_B],
      warehouseAccess: [
        { branchId: BRANCH_A, allWarehouses: false, warehouseIds: ["w-a1"] },
        { branchId: BRANCH_B, allWarehouses: true, warehouseIds: [] },
      ],
    });

    it("reaches a warehouse its branch's row names", () => {
      expect(canAccessWarehouse(storekeeper, shelfA1)).toBe(true);
    });

    it("refuses a warehouse of a granted branch that the row leaves out", () => {
      expect(canAccessWarehouse(storekeeper, shelfA2)).toBe(false);
    });

    it("reaches every warehouse of a branch marked allWarehouses", () => {
      expect(canAccessWarehouse(storekeeper, shelfB1)).toBe(true);
    });

    it("offers only the branches the user holds", () => {
      expect(
        accessibleBranches(user({ branchAccess: [BRANCH_A] }), [
          { _id: BRANCH_A },
          { _id: BRANCH_B },
        ]),
      ).toEqual([{ _id: BRANCH_A }]);
    });
  });

  describe("the migration window", () => {
    it("gives a user stored before the field existed their branches' warehouses", () => {
      const legacy = user({ branchAccess: [BRANCH_A], warehouseAccess: [] });

      expect(canAccessWarehouse(legacy, shelfA1)).toBe(true);
      expect(canAccessWarehouse(legacy, shelfA2)).toBe(true);
      expect(canAccessWarehouse(legacy, shelfB1)).toBe(false);
    });
  });

  describe("guards", () => {
    it("reaches nothing while the account is still loading", () => {
      // `user` is null between mount and the /me answer; an empty picker for
      // that moment is right, and failing open would not be.
      expect(canAccessWarehouse(null, central)).toBe(false);
      expect(accessibleBranches(null, [{ _id: BRANCH_A }])).toEqual([]);
    });
  });

  describe("accessibleWarehouses", () => {
    it("returns only what the user may act at", () => {
      const scoped = user({
        branchAccess: [BRANCH_A],
        warehouseAccess: [
          { branchId: BRANCH_A, allWarehouses: false, warehouseIds: ["w-a1"] },
        ],
      });

      expect(
        accessibleWarehouses(scoped, [shelfA1, shelfA2, shelfB1, central]),
      ).toEqual([shelfA1, central]);
    });
  });
});
