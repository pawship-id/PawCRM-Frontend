import {
  grantsToSelection,
  selectionToGrants,
  countGrantedActions,
} from "@/features/roles/permissions";

describe("role permission conversions", () => {
  it("grantsToSelection maps grants to a feature -> actions map", () => {
    const selection = grantsToSelection([
      { feature: "users", actions: ["read", "create"] },
      { feature: "roles", actions: ["read"] },
    ]);
    expect(selection).toEqual({
      users: ["read", "create"],
      roles: ["read"],
    });
  });

  it("grantsToSelection drops grants with no actions", () => {
    const selection = grantsToSelection([
      { feature: "users", actions: [] },
      { feature: "roles", actions: ["read"] },
    ]);
    expect(selection).toEqual({ roles: ["read"] });
  });

  it("selectionToGrants drops features with no actions selected", () => {
    const grants = selectionToGrants({ users: ["read"], roles: [] });
    expect(grants).toEqual([{ feature: "users", actions: ["read"] }]);
  });

  it("round-trips a non-empty selection", () => {
    const grants = [
      { feature: "branches", actions: ["read", "update"] },
      { feature: "users", actions: ["read"] },
    ];
    expect(selectionToGrants(grantsToSelection(grants))).toEqual(grants);
  });

  it("countGrantedActions sums actions across features", () => {
    expect(
      countGrantedActions([
        { feature: "users", actions: ["read", "create", "update"] },
        { feature: "roles", actions: ["read"] },
      ]),
    ).toBe(4);
    expect(countGrantedActions([])).toBe(0);
  });
});
