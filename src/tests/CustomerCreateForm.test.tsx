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
    // The Tag field's suggestions — unmocked, a real fetch jsdom refuses.
    jest.spyOn(customerService, "tags").mockResolvedValue([]);
  });
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(customerService, "create");
    render(<CustomerCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: /simpan pelanggan/i }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/nama pelanggan wajib diisi/i)).toBeInTheDocument();
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
      screen.getByText(/alamat email tidak valid/i),
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
        // The form's own fields, at their defaults: a private customer with no
        // category, who gets service messages but no marketing.
        kind: "individual",
        customerTypeId: null,
        taxId: null,
        picName: null,
        notes: null,
        tags: [],
        notifications: {
          bookingReminder: true,
          membershipRenewal: true,
          promo: false,
        },
      }),
    );
    expect(push).toHaveBeenCalledWith("/dashboard/customers");
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

  it("offers the map picker for the address's pin, falling back to typing without a Maps key", () => {
    render(<CustomerCreateForm />);

    // No Maps key in tests, so the button is there but disabled, with the
    // manual fields named as the way in.
    expect(
      screen.getByRole("button", { name: /pilih dari peta/i }),
    ).toBeDisabled();
    expect(screen.getByText(/peta belum diaktifkan/i)).toBeInTheDocument();
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

  /* ── Tag (26 October 2026) — a label only, free text with suggestions ── */

  it("adds a typed tag on Enter, normalised the way the server stores it, without submitting", async () => {
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.type(
      screen.getByLabelText(/tambah tag/i),
      "  #Pelanggan Lama{Enter}",
    );

    // Enter added the chip; it did not save the form.
    expect(
      screen.getByRole("button", { name: "Hapus tag pelanggan-lama" }),
    ).toBeVisible();
    expect(create).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/tambah tag/i)).toHaveValue("");

    // The same tag twice is one tag.
    await userEvent.type(screen.getByLabelText(/tambah tag/i), "pelanggan-lama");
    await userEvent.click(screen.getByRole("button", { name: /^tambah$/i }));
    expect(
      screen.getAllByRole("button", { name: /^Hapus tag/ }),
    ).toHaveLength(1);

    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["pelanggan-lama"] }),
    );
  });

  it("offers the tenant's tags in use, and a picked one leaves the suggestions", async () => {
    (customerService.tags as jest.Mock).mockResolvedValue(["reseller", "vip-lama"]);
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    expect(await screen.findByText(/sudah dipakai di toko/i)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "#reseller" }));

    expect(screen.getByRole("button", { name: "Hapus tag reseller" })).toBeVisible();
    // Picked, so no longer offered.
    expect(screen.queryByRole("button", { name: "#reseller" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "#vip-lama" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["reseller"] }),
    );
  });

  it("removes a tag when its chip is pressed", async () => {
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.type(screen.getByLabelText(/tambah tag/i), "reseller{Enter}");
    await userEvent.type(screen.getByLabelText(/tambah tag/i), "grosir{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Hapus tag reseller" }));

    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["grosir"] }),
    );
  });

  it("still saves when the suggestions cannot be loaded", async () => {
    (customerService.tags as jest.Mock).mockRejectedValue(new Error("offline"));
    const create = jest
      .spyOn(customerService, "create")
      .mockResolvedValue({} as never);
    render(<CustomerCreateForm />);

    await userEvent.type(screen.getByLabelText(/nama pelanggan/i), "Budi");
    await userEvent.type(screen.getByLabelText(/tambah tag/i), "reseller{Enter}");
    expect(screen.queryByText(/sudah dipakai di toko/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /simpan pelanggan/i }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["reseller"] }),
    );
  });
});
