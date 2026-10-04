import { screen, within } from "@testing-library/react";
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
  code: "CUST-0001",
  name: "Rina Wijaya",
  email: "rina@email.com",
  phone: "0812-1111-2222",
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
/**
 * The row's actions live behind one kebab since 28 September 2026, so every
 * assertion about them opens it first. Named after the customer, because that
 * is what the trigger's accessible name says.
 */
async function openRowMenu(name: string) {
  await userEvent.click(
    screen.getByRole("button", { name: `Aksi untuk ${name}` }),
  );
  return screen.getByRole("menu");
}

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

    /*
      Opening the kebab is that button's job; the row must keep its hands off,
      or the menu would close onto the profile before anything could be picked.
      It was the chat link that proved this before chat moved to the profile.
    */
    await userEvent.click(
      screen.getByRole("button", { name: "Aksi untuk Rina Wijaya" }),
    );

    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("menu")).toBeVisible();
  });

  /*
    CHAT LEFT THIS TABLE ON 28 SEPTEMBER 2026, on request: it lives on the
    profile alone. It was the one action here that left the app entirely, and a
    menu row beside Hapus is a worse home for it than its own icon was.
  */
  it("offers no WhatsApp shortcut — that belongs to the profile now", async () => {
    renderTable();

    expect(
      screen.queryByRole("link", { name: /Chat WhatsApp/ }),
    ).not.toBeInTheDocument();

    const menu = await openRowMenu("Rina Wijaya");
    expect(
      within(menu).queryByRole("menuitem", { name: /chat/i }),
    ).not.toBeInTheDocument();
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

  it("holds Detail, Ubah and Hapus behind one kebab", async () => {
    renderTable();

    const menu = await openRowMenu("Rina Wijaya");

    expect(within(menu).getByRole("menuitem", { name: /detail/i })).toHaveAttribute(
      "href",
      "/dashboard/master/customers/5a7f1f77bcf86cd799439022",
    );
    expect(within(menu).getByRole("menuitem", { name: /ubah/i })).toHaveAttribute(
      "href",
      "/dashboard/master/customers/5a7f1f77bcf86cd799439022/edit",
    );
    expect(
      within(menu).getByRole("menuitem", { name: /hapus/i }),
    ).toBeInTheDocument();
  });

  it("draws every column the mockup asks for, none of them badged", () => {
    renderTable();

    // Both were "Segera" until the fields existed. Nothing on this table is now.
    expect(screen.getByRole("columnheader", { name: /^Kode$/ })).toBeVisible();
    expect(
      screen.getByRole("columnheader", { name: /^Kategori$/ }),
    ).toBeVisible();
    expect(screen.queryByText("Segera")).not.toBeInTheDocument();
  });

  it("shows the code the server allocated", () => {
    renderTable();
    expect(screen.getByText("CUST-0001")).toBeVisible();
  });

  it("leaves a customer registered before the series with a dash, not a made-up number", () => {
    // A dash is a fact; an invented code looks exactly like one the shop printed
    // on a card years ago.
    renderTable({ code: null });
    expect(screen.queryByText(/CUST-/)).not.toBeInTheDocument();
  });

  it("prints the category's word, not the id the form edits", () => {
    renderTable({ customerTypeId: "type-1", customerTypeName: "B2B" });

    expect(screen.getByText("B2B")).toBeVisible();
    expect(screen.queryByText("type-1")).not.toBeInTheDocument();
  });

  it("says beside the name when a customer is a company", () => {
    // Plenty of companies are registered under a person's name; individuals get
    // no badge, because a label on 95% of the rows is noise.
    renderTable({ kind: "company" });
    expect(screen.getByText("Perusahaan")).toBeVisible();
  });

  it("leaves an uncategorised customer's cell empty rather than guessing", () => {
    renderTable();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
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

  it("offers Pulihkan alone on a deleted row", async () => {
    renderTable({ deletedAt: "2026-09-20T00:00:00.000Z" });

    expect(screen.getByText("Terhapus")).toBeVisible();

    /*
      A DELETED CUSTOMER HAS NO PROFILE to open and nothing to edit, so
      restoring is the whole menu — not one option among three.
    */
    const menu = await openRowMenu("Rina Wijaya");
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(
      within(menu).getByRole("menuitem", { name: /pulihkan/i }),
    ).toBeInTheDocument();
  });
});
