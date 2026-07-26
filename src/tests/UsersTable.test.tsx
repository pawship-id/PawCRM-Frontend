import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { UsersTable } from "@/features/users/components/UsersTable";
import { userService } from "@/services/user.service";
import type { User } from "@/types/api";

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

// Row actions fire a SweetAlert2 toast on success; mock the library so no real
// dialog is created during the test.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    _id: "u1",
    tenantId: "t1",
    email: "ana@paw.com",
    fullName: "Ana Diaz",
    phone: null,
    roleId: "r1",
    allBranches: true,
    branchAccess: [],
    status: "active",
    emailVerifiedAt: null,
    lastLoginAt: null,
    lockedUntil: null,
    deletedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const ROLE_NAMES = { r1: "Manager" };

describe("UsersTable", () => {
  afterEach(() => jest.restoreAllMocks());

  it("renders a row with the resolved role name and status", () => {
    renderWithAuth(
      <UsersTable
        users={[makeUser()]}
        roleNames={ROLE_NAMES}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(screen.getByText("Ana Diaz")).toBeInTheDocument();
    expect(screen.getByText("Manager")).toBeInTheDocument();
    expect(screen.getByText("All branches")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows the empty state when there are no users", () => {
    renderWithAuth(
      <UsersTable
        users={[]}
        roleNames={{}}
        loading={false}
        onChanged={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/no users match the current filters/i),
    ).toBeInTheDocument();
  });

  it("highlights the search term in the name cell", () => {
    renderWithAuth(
      <UsersTable
        users={[makeUser()]}
        roleNames={ROLE_NAMES}
        loading={false}
        onChanged={jest.fn()}
        search="ana"
      />,
    );

    // "Ana" within "Ana Diaz" is wrapped in a <mark>.
    const mark = screen.getByText("Ana");
    expect(mark.tagName).toBe("MARK");
  });

  it("confirms and deletes a user, then refetches", async () => {
    const remove = jest
      .spyOn(userService, "remove")
      .mockResolvedValue({ deleted: true });
    const onChanged = jest.fn();

    renderWithAuth(
      <UsersTable
        users={[makeUser()]}
        roleNames={ROLE_NAMES}
        loading={false}
        onChanged={onChanged}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));

    const dialog = screen.getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^delete$/i }),
    );

    expect(remove).toHaveBeenCalledWith("u1");
    expect(onChanged).toHaveBeenCalled();
  });

  it("offers restore for a deleted user", () => {
    renderWithAuth(
      <UsersTable
        users={[makeUser({ deletedAt: "2026-02-01T00:00:00.000Z" })]}
        roleNames={ROLE_NAMES}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /restore/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Deleted")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^delete$/i }),
    ).not.toBeInTheDocument();
  });
});
