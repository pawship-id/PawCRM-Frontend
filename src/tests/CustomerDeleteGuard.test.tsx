import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomersTable } from "@/features/customers/components/CustomersTable";
import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type { Customer } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockedCustomerService = customerService as jest.Mocked<
  typeof customerService
>;

const customer: Customer = {
  _id: "5a7f1f77bcf86cd799439022",
  tenantId: "507f1f77bcf86cd799439011",
  name: "Ibu Rina",
  email: null,
  phone: "0812-3456-7890",
  address: null,
  vipTier: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

/**
 * The customer delete guard, from the UI side.
 *
 * The backend refuses to delete a customer while live pets still point at it —
 * `pets.customerId` is required, so a deleted owner leaves its animals pointing
 * at a person no screen can render. The refusal is a `409` whose `message` is
 * only the headline; the half that says what to do is in `reason`.
 *
 * This suite exists because showing `message` alone is the easy mistake, and it
 * leaves somebody staring at a button that will not work with nothing on screen
 * explaining why.
 */
describe("deleting a customer that still has pets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows the reason, not just the headline", async () => {
    mockedCustomerService.remove.mockRejectedValue(
      new ApiError("Cannot delete customer", 409, {
        reason:
          "3 pet(s) still belong to this customer; delete or reassign them first",
      }),
    );

    renderWithAuth(
      <CustomersTable
        customers={[customer]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /^delete$/i, hidden: false }),
    );

    expect(await screen.findByText(/3 pet\(s\) still belong/i)).toBeVisible();
  });

  it("does not tell the caller the customer was removed", async () => {
    const onChanged = jest.fn();
    mockedCustomerService.remove.mockRejectedValue(
      new ApiError("Cannot delete customer", 409, {
        reason: "1 pet(s) still belong to this customer",
      }),
    );

    renderWithAuth(
      <CustomersTable
        customers={[customer]}
        loading={false}
        onChanged={onChanged}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /^delete$/i, hidden: false }),
    );

    await waitFor(() => expect(mockedCustomerService.remove).toHaveBeenCalled());
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("falls back to the message when a refusal carries no reason", async () => {
    mockedCustomerService.remove.mockRejectedValue(
      new ApiError("Customer not found", 404),
    );

    renderWithAuth(
      <CustomersTable
        customers={[customer]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /^delete$/i, hidden: false }),
    );

    expect(await screen.findByText(/customer not found/i)).toBeVisible();
  });
});
