import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UserCreateForm } from "@/features/users";
import { userService } from "@/services/user.service";
import { roleService } from "@/services/role.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { PageResult, Role, Branch } from "@/types/api";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// The success popup is a SweetAlert2 modal; mock the library so it resolves
// immediately and the redirect-after-success assertion does not wait on a real
// dialog.
jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

function page<T>(items: T[]): PageResult<T> {
  return { items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } };
}

const ROLES: Role[] = [{ _id: "r1", name: "Manager" }];
const BRANCHES: Branch[] = [{ _id: "b1", name: "Jakarta", isActive: true }];

async function renderForm() {
  jest.spyOn(roleService, "list").mockResolvedValue(page(ROLES));
  jest.spyOn(branchService, "list").mockResolvedValue(page(BRANCHES));
  render(<UserCreateForm />);
  // Wait for the lookups spinner to disappear (form is ready).
  await waitForElementToBeRemoved(() =>
    screen.queryByText(/loading form create user/i),
  );
}

describe("UserCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(userService, "create");
    await renderForm();

    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
  });

  it("creates the user and redirects on success", async () => {
    const create = jest
      .spyOn(userService, "create")
      .mockResolvedValue({} as never);
    await renderForm();

    await userEvent.type(screen.getByLabelText(/full name/i), "Ana Diaz");
    await userEvent.type(screen.getByLabelText(/email/i), "ana@paw.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "secret123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "secret123");
    await userEvent.click(screen.getByLabelText(/all branches/i));
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ana@paw.com",
        fullName: "Ana Diaz",
        allBranches: true,
        branchAccess: [],
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/users");
  });

  it("surfaces a duplicate-email conflict as an alert", async () => {
    jest
      .spyOn(userService, "create")
      .mockRejectedValue(new ApiError("Email already in use", 409));
    await renderForm();

    await userEvent.type(screen.getByLabelText(/full name/i), "Ana Diaz");
    await userEvent.type(screen.getByLabelText(/email/i), "ana@paw.com");
    await userEvent.type(screen.getByLabelText(/^password/i), "secret123");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "secret123");
    await userEvent.click(screen.getByLabelText(/all branches/i));
    await userEvent.click(screen.getByRole("button", { name: /create user/i }));

    expect(
      await screen.findByText(/email already in use/i),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
