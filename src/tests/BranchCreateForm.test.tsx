import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BranchCreateForm } from "@/features/branches";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";

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

describe("BranchCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(branchService, "create");
    render(<BranchCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/branch name is required/i)).toBeInTheDocument();
  });

  it("creates the branch and redirects on success", async () => {
    const create = jest
      .spyOn(branchService, "create")
      .mockResolvedValue({} as never);
    render(<BranchCreateForm />);

    await userEvent.type(screen.getByLabelText(/branch name/i), "Bandung");
    await userEvent.type(screen.getByLabelText(/phone/i), "022-555-9000");
    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Bandung",
        phone: "022-555-9000",
        address: null,
        isActive: true,
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/branches");
  });

  it("surfaces a duplicate-name conflict as an alert", async () => {
    jest
      .spyOn(branchService, "create")
      .mockRejectedValue(new ApiError("Branch name already in use", 409));
    render(<BranchCreateForm />);

    await userEvent.type(screen.getByLabelText(/branch name/i), "Bandung");
    await userEvent.click(
      screen.getByRole("button", { name: /create branch/i }),
    );

    expect(
      await screen.findByText(/branch name already in use/i),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
