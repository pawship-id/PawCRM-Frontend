import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomersTable } from "@/features/customers/components/CustomersTable";
import type { Customer } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => push(...args) }),
}));

const customer: Customer = {
  _id: "5a7f1f77bcf86cd799439022",
  tenantId: "507f1f77bcf86cd799439011",
  name: "Rina Wijaya",
  email: "rina@email.com",
  phone: "0812-1111-2222",
  address: null,
  vipTier: "gold",
  deletedAt: null,
  createdAt: "2025-01-12T00:00:00.000Z",
  updatedAt: "2025-01-12T00:00:00.000Z",
};

/**
 * The Pelanggan list, in the shape the mockup draws.
 *
 * THE ROW IS THE WAY INTO A PROFILE, and this suite is here because that is the
 * one thing on the screen with no visible affordance of its own — the callout
 * under the table promises it, and nothing else would notice if it broke.
 *
 * It also pins the two columns the database cannot fill. Dropping them is the
 * tempting tidy-up; the badge in the header is what keeps an empty cell from
 * reading as a failed load.
 */
describe("customers table", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function renderTable(overrides: Partial<Customer> = {}) {
    return renderWithAuth(
      <CustomersTable
        customers={[{ ...customer, ...overrides }]}
        loading={false}
        onChanged={jest.fn()}
      />,
    );
  }

  it("opens the profile when the row is clicked", async () => {
    renderTable();

    await userEvent.click(screen.getByText("Rina Wijaya").closest("tr")!);

    expect(push).toHaveBeenCalledWith(
      "/dashboard/master/customers/5a7f1f77bcf86cd799439022",
    );
  });

  it("does not navigate when a control inside the row is pressed", async () => {
    renderTable();

    // The chat link is a control with its own job; the row must keep its hands off.
    await userEvent.click(screen.getByRole("link", { name: /^Chat WhatsApp/ }));

    expect(push).not.toHaveBeenCalled();
  });

  it("keeps the name reachable as a link, not only as a row click", async () => {
    renderTable();

    // A keyboard and a screen reader both need a destination, which a click
    // handler on a <tr> is not.
    expect(screen.getByRole("link", { name: "Rina Wijaya" })).toHaveAttribute(
      "href",
      "/dashboard/master/customers/5a7f1f77bcf86cd799439022",
    );
  });

  it("sends Ubah to the form, one route under the profile", () => {
    renderTable();

    expect(screen.getByRole("link", { name: /^Ubah/ })).toHaveAttribute(
      "href",
      "/dashboard/master/customers/5a7f1f77bcf86cd799439022/edit",
    );
  });

  it("draws the columns the database cannot fill, badged rather than dropped", () => {
    renderTable();

    expect(
      screen.getByRole("columnheader", { name: /Kode Segera/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: /Kategori Segera/ }),
    ).toBeVisible();
  });

  it("shows when the customer joined, and their tier beside their name", () => {
    renderTable();

    expect(screen.getByText("12 Jan 2025")).toBeVisible();
    expect(screen.getByText("Gold")).toBeVisible();
  });

  it("offers no chat button for a number nobody can dial", () => {
    renderTable({ phone: null });

    expect(
      screen.queryByRole("link", { name: /Chat WhatsApp/ }),
    ).not.toBeInTheDocument();
  });

  it("offers Pulihkan instead of the edit shortcuts on a deleted row", () => {
    renderTable({ deletedAt: "2026-09-20T00:00:00.000Z" });

    expect(screen.getByRole("button", { name: /Pulihkan/ })).toBeVisible();
    expect(screen.getByText("Terhapus")).toBeVisible();
    expect(screen.queryByRole("link", { name: /^Ubah/ })).not.toBeInTheDocument();
  });
});
