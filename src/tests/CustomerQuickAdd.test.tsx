import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CustomerQuickAddDialog,
  CustomerSearchDialog,
} from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { ApiError } from "@/services/api-error";
import type { Customer } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customer.service");

const mocked = customerService as jest.Mocked<typeof customerService>;

const customer = (overrides: Partial<Customer> = {}): Customer => ({
  _id: "5a7f1f77bcf86cd799439022",
  tenantId: "507f1f77bcf86cd799439011",
  name: "Ibu Rina Wijaya",
  email: null,
  phone: "0812-3456-7890",
  address: null,
  vipTier: null,
  deletedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("CustomerQuickAddDialog", () => {
  it("requires both fields — a till debtor with no number cannot be chased", async () => {
    // Phone is optional in the API on purpose (a clinic recording a walk-in),
    // and required HERE, because the reason to quick-add from the till is almost
    // always a piutang.
    const onCreated = jest.fn();
    renderWithAuth(
      <CustomerQuickAddDialog
        open
        onOpenChange={jest.fn()}
        onCreated={onCreated}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(await screen.findByText(/nama pelanggan wajib diisi/i)).toBeVisible();
    expect(screen.getByText(/no\. hp wajib diisi/i)).toBeVisible();
    expect(mocked.createWithWarnings).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("sends only the two fields it collected", async () => {
    mocked.createWithWarnings.mockResolvedValue({
      success: true,
      data: customer(),
    });
    renderWithAuth(
      <CustomerQuickAddDialog
        open
        onOpenChange={jest.fn()}
        onCreated={jest.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Ibu Rina");
    await userEvent.type(screen.getByLabelText(/no\. hp/i), "0812-3456-7890");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    await waitFor(() =>
      expect(mocked.createWithWarnings).toHaveBeenCalledWith({
        name: "Ibu Rina",
        phone: "0812-3456-7890",
      }),
    );
  });

  it("uses the envelope call, so a warning is not thrown away", async () => {
    // `create` unwraps to the customer and drops `warnings`; the duplicate-phone
    // message would never reach the caller.
    mocked.createWithWarnings.mockResolvedValue({
      success: true,
      data: customer(),
    });
    renderWithAuth(
      <CustomerQuickAddDialog
        open
        onOpenChange={jest.fn()}
        onCreated={jest.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Ibu Rina");
    await userEvent.type(screen.getByLabelText(/no\. hp/i), "0812");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    await waitFor(() => expect(mocked.createWithWarnings).toHaveBeenCalled());
    expect(mocked.create).not.toHaveBeenCalled();
  });

  it("hands the warning to the caller alongside the created customer", async () => {
    // FR-2: the customer IS saved. The cashier is told who else holds the number
    // so they can check whether this is the same person walking in twice.
    const created = customer({ name: "Pak Budi" });
    mocked.createWithWarnings.mockResolvedValue({
      success: true,
      data: created,
      warnings: [
        {
          code: "phone-duplicate",
          field: "phone",
          message: "No. HP ini sudah terdaftar atas nama Ibu Rina",
        },
      ],
    });
    const onCreated = jest.fn();
    renderWithAuth(
      <CustomerQuickAddDialog
        open
        onOpenChange={jest.fn()}
        onCreated={onCreated}
      />,
    );

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Pak Budi");
    await userEvent.type(screen.getByLabelText(/no\. hp/i), "0812-3456-7890");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(created, [
        expect.objectContaining({ code: "phone-duplicate" }),
      ]),
    );
  });

  it("hands an empty array when there is nothing to warn about", async () => {
    // So a caller renders zero, one or many with one code path.
    mocked.createWithWarnings.mockResolvedValue({
      success: true,
      data: customer(),
    });
    const onCreated = jest.fn();
    renderWithAuth(
      <CustomerQuickAddDialog
        open
        onOpenChange={jest.fn()}
        onCreated={onCreated}
      />,
    );

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Ibu Rina");
    await userEvent.type(screen.getByLabelText(/no\. hp/i), "0812");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith(expect.any(Object), []),
    );
  });

  it("shows a real failure as an error, not as a warning", async () => {
    mocked.createWithWarnings.mockRejectedValue(
      new ApiError("Email already exists", 409),
    );
    renderWithAuth(
      <CustomerQuickAddDialog
        open
        onOpenChange={jest.fn()}
        onCreated={jest.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Ibu Rina");
    await userEvent.type(screen.getByLabelText(/no\. hp/i), "0812");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(await screen.findByText(/email already exists/i)).toBeVisible();
  });
});

describe("CustomerSearchDialog", () => {
  function listReturns(items: Customer[]) {
    mocked.list.mockResolvedValue({
      items,
      pagination: { page: 1, limit: 8, total: items.length, totalPages: 1 },
    });
  }

  it("searches on the SERVER, so a shop past one page can still be searched", async () => {
    // The difference from every other picker here: PetOwnerField loads a page
    // and filters inside it, which silently cannot find anyone past the cap. A
    // till cannot work that way.
    listReturns([]);
    renderWithAuth(
      <CustomerSearchDialog open onOpenChange={jest.fn()} onSelect={jest.fn()} />,
    );

    await userEvent.type(screen.getByLabelText(/cari pelanggan/i), "rina");

    await waitFor(() =>
      expect(mocked.list).toHaveBeenCalledWith(
        expect.objectContaining({ search: "rina" }),
      ),
    );
  });

  it("returns the chosen customer to the caller", async () => {
    const target = customer();
    listReturns([target]);
    const onSelect = jest.fn();
    renderWithAuth(
      <CustomerSearchDialog open onOpenChange={jest.fn()} onSelect={onSelect} />,
    );

    await userEvent.click(await screen.findByText("Ibu Rina Wijaya"));

    expect(onSelect).toHaveBeenCalledWith(target, undefined);
  });

  it("offers quick-add from the empty state — that is when it is needed", async () => {
    listReturns([]);
    renderWithAuth(
      <CustomerSearchDialog open onOpenChange={jest.fn()} onSelect={jest.fn()} />,
    );

    await userEvent.type(screen.getByLabelText(/cari pelanggan/i), "budi");

    expect(
      await screen.findByRole("button", { name: /daftarkan pelanggan baru/i }),
    ).toBeVisible();
  });

  it("carries a typed phone number into the quick-add form", async () => {
    // Somebody who typed a number has already entered that field once.
    listReturns([]);
    renderWithAuth(
      <CustomerSearchDialog open onOpenChange={jest.fn()} onSelect={jest.fn()} />,
    );

    await userEvent.type(screen.getByLabelText(/cari pelanggan/i), "08123456");
    await userEvent.click(
      await screen.findByRole("button", { name: /daftarkan pelanggan baru/i }),
    );

    expect(await screen.findByDisplayValue("08123456")).toBeVisible();
  });

  it("does not carry a typed NAME into the phone box", async () => {
    listReturns([]);
    renderWithAuth(
      <CustomerSearchDialog open onOpenChange={jest.fn()} onSelect={jest.fn()} />,
    );

    await userEvent.type(screen.getByLabelText(/cari pelanggan/i), "rina");
    await userEvent.click(
      await screen.findByRole("button", { name: /daftarkan pelanggan baru/i }),
    );

    expect(screen.getByLabelText(/no\. hp/i)).toHaveValue("");
  });
});
