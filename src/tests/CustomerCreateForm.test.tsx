import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CustomerCreateForm } from "@/features/customers";
import { customerService } from "@/services/customer.service";
import { customerTypeService } from "@/services/customerType.service";
import { ApiError } from "@/services/api-error";

/*
  THE FORM READS THE TENANT'S CATEGORY LIST (Pengaturan › Tipe pelanggan) for its
  Kategori field, so the service is mocked here — unmocked it reaches a real
  `fetch` that jsdom refuses, and the field renders its "could not load" state on
  every case in this file.
*/
jest.mock("@/services/customerType.service", () => ({
  customerTypeService: { list: jest.fn() },
}));

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

/** Picks an option out of a Radix select — the shape every form here uses. */
async function choose(name: RegExp, option: RegExp | string) {
  await userEvent.click(screen.getByRole("combobox", { name }));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("CustomerCreateForm", () => {
  beforeEach(() => {
    push.mockClear();
    (customerTypeService.list as jest.Mock).mockResolvedValue({
      items: [{ _id: "type-1", name: "B2B", note: null }],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(customerService, "create");
    render(<CustomerCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/customer name is required/i)).toBeInTheDocument();
  });

  it("flags an invalid email before submitting", async () => {
    const create = jest.spyOn(customerService, "create");
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
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

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.type(screen.getByLabelText(/whatsapp/i), "0812-3456-7890");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Budi",
        phone: "0812-3456-7890",
        email: null,
        address: null,
        // No pin typed — sent as "no pin", not as a pair of zeros.
        location: null,
        vipTier: null,
        // The form's own fields, at their defaults: a private customer with no
        // category, who gets service messages but no marketing.
        kind: "individual",
        customerTypeId: null,
        taxId: null,
        picName: null,
        notes: null,
        notifications: {
          bookingReminder: true,
          membershipRenewal: true,
          promo: false,
        },
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/master/customers");
  });

  it("sends the address's pin, pasted as one pair — what a Zona price is quoted from", async () => {
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.click(screen.getByLabelText(/latitude/i));
    await userEvent.paste("-7.2575, 112.7521");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ location: { lat: -7.2575, lng: 112.7521 } }),
    );
  });

  it("refuses half a pin before calling create", async () => {
    const create = jest.spyOn(customerService, "create");
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.type(screen.getByLabelText(/latitude/i), "-7.25");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(create).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate-email conflict as an alert", async () => {
    jest
      .spyOn(customerService, "create")
      .mockRejectedValue(new ApiError("Email 'budi@x.com' already exists", 409));
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(
      await screen.findByText(/already exists/i),
    ).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("asks for NPWP and PIC only once the customer is a company", async () => {
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    // A person has neither, so the form does not ask.
    expect(screen.queryByLabelText(/npwp/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Mitra Jaya");
    await choose(/jenis pelanggan/i, "Perusahaan");
    await userEvent.type(screen.getByLabelText(/npwp/i), "02.345.678.9-012.000");
    await userEvent.type(screen.getByLabelText(/pic/i), "Pak Hendra");
    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "company",
        taxId: "02.345.678.9-012.000",
        picName: "Pak Hendra",
      }),
    );
  });

  it("files the customer under one of the tenant's own categories", async () => {
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Mitra Jaya");
    await userEvent.click(
      screen.getByRole("button", { name: /kategori pelanggan/i }),
    );
    await userEvent.click(screen.getByRole("option", { name: "B2B" }));
    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    // The ID is what is stored — a renamed category must not strand anybody.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ customerTypeId: "type-1" }),
    );
  });

  it("does not send company details on a customer corrected to a person", async () => {
    // A hidden field that keeps its value is the worst kind: nothing on screen
    // says the record still carries a tax number.
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await choose(/jenis pelanggan/i, "Perusahaan");
    await userEvent.type(screen.getByLabelText(/npwp/i), "01.234.567.8-901.000");
    await choose(/jenis pelanggan/i, "Perorangan");
    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "individual", taxId: null, picName: null }),
    );
  });

  it("records the consents the form was left with", async () => {
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.click(screen.getByRole("checkbox", { name: /kirim promo/i }));
    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        notifications: {
          bookingReminder: true,
          membershipRenewal: true,
          promo: true,
        },
      }),
    );
  });
});
