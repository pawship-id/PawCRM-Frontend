import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PermissionsField } from "@/features/roles/components/PermissionsField";
import type { PermissionGrant } from "@/types/api";
import type { PermissionSelection } from "@/features/roles/permissions";

const CATALOG: PermissionGrant[] = [
  { feature: "tenants", actions: ["read", "update", "delete"] },
];

/**
 * `read` is a prerequisite for every other action on a feature. These tests pin
 * the two rules the matrix enforces: choosing another action pulls in `read`,
 * and clearing `read` clears the whole feature.
 */
function setup(selection: PermissionSelection = {}) {
  const onChange = jest.fn<void, [PermissionSelection]>();
  render(
    <PermissionsField
      catalog={CATALOG}
      selection={selection}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("PermissionsField — read is mandatory", () => {
  it("auto-selects read when another action is checked from empty", async () => {
    const { onChange } = setup();

    await userEvent.click(screen.getByLabelText("Update"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0];
    expect(next.tenants).toEqual(expect.arrayContaining(["read", "update"]));
    expect(next.tenants).toHaveLength(2);
  });

  it("keeps read when adding a further action to an existing grant", async () => {
    const { onChange } = setup({ tenants: ["read", "update"] });

    await userEvent.click(screen.getByLabelText("Delete"));

    const next = onChange.mock.calls[0][0];
    expect(next.tenants).toEqual(
      expect.arrayContaining(["read", "update", "delete"]),
    );
    expect(next.tenants).toHaveLength(3);
  });

  it("clears the whole feature when read is unchecked", async () => {
    const { onChange } = setup({ tenants: ["read", "update", "delete"] });

    await userEvent.click(screen.getByLabelText("Read"));

    // Dropping read drops access entirely — the feature key is removed.
    expect(onChange).toHaveBeenCalledWith({});
  });

  it("only removes the single action when a non-read action is unchecked", async () => {
    const { onChange } = setup({ tenants: ["read", "update", "delete"] });

    await userEvent.click(screen.getByLabelText("Delete"));

    const next = onChange.mock.calls[0][0];
    expect(next.tenants).toEqual(["read", "update"]);
  });
});
