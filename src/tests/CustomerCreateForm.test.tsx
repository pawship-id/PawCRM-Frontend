import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomerCreateForm } from "@/features/customers";
import { customerService } from "@/services/customer.service";
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

describe("CustomerCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(customerService, "create");
    render(<CustomerCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /create customer/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/customer name is required/i)).toBeInTheDocument();
  });

  it("flags an invalid email before submitting", async () => {
    const create = jest.spyOn(customerService, "create");
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/customer name/i), "Budi");
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(
      screen.getByRole("button", { name: /create customer/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(
      screen.getByText(/enter a valid email address/i),
    ).toBeInTheDocument();
  });

  it("creates the customer and redirects on success", async () => {
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/customer name/i), "Budi");
    await userEvent.type(screen.getByLabelText(/phone/i), "0812-3456-7890");
    await userEvent.click(
      screen.getByRole("button", { name: /create customer/i }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Budi",
        phone: "0812-3456-7890",
        email: null,
        address: null,
        vipTier: null,
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/customers");
  });

  it("surfaces a duplicate-email conflict as an alert", async () => {
    jest
      .spyOn(customerService, "create")
      .mockRejectedValue(new ApiError("Email 'budi@x.com' already exists", 409));
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/customer name/i), "Budi");
    await userEvent.click(
      screen.getByRole("button", { name: /create customer/i }),
    );

    expect(
      await screen.findByText(/already exists/i),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
