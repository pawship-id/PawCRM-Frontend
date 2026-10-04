import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomersTable } from "@/features/customers/components/CustomersTable";
import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type { Customer } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
/*
  The row navigates to the customer's profile when clicked, so the table reaches
  for `useRouter` — which throws outside an app-router tree. The repo's
  convention for this is a per-file stub; see WarehousesTable.test.tsx.
*/
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const mockedCustomerService = customerService as jest.Mocked<
  typeof customerService
>;

const customer: Customer = {
  _id: "5a7f1f77bcf86cd799439022",
  tenantId: "507f1f77bcf86cd799439011",
  code: "CUST-0001",
  name: "Ibu Rina",
  email: null,
  phone: "0812-3456-7890",
  address: null,
  // The Pelanggan form's fields (27 September 2026). An ordinary private
  // customer with no category — what the register is mostly made of.
  kind: "individual" as const,
  customerTypeId: null,
  customerTypeName: null,
  taxId: null,
  picName: null,
  notes: null,
  notifications: {
    bookingReminder: true,
    membershipRenewal: true,
    promo: false,
  },
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
/**
 * Open the row's kebab, press Hapus, then confirm in the dialog.
 *
 * THE ROW ACTIONS MOVED INTO A MENU on 28 September 2026, so this is three
 * steps rather than two. The trigger is still found BY ITS ACCESSIBLE NAME —
 * icon-only controls are why `aria-label` exists — and it now names the
 * customer ("Aksi untuk Ibu Rina") rather than the action. If this helper stops
 * finding it, the label is missing, and that is a real accessibility
 * regression rather than a test detail.
 */
async function openDeleteDialogAndConfirm() {
  await userEvent.click(
    screen.getByRole("button", { name: "Aksi untuk Ibu Rina" }),
  );
  await userEvent.click(
    within(screen.getByRole("menu")).getByRole("menuitem", { name: /^hapus$/i }),
  );
  await userEvent.click(screen.getByRole("button", { name: /^hapus$/i }));
}

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

    await openDeleteDialogAndConfirm();

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

    await openDeleteDialogAndConfirm();

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

    await openDeleteDialogAndConfirm();

    expect(await screen.findByText(/customer not found/i)).toBeVisible();
  });
});
