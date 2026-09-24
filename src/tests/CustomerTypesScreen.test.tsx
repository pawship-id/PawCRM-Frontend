import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { CustomerTypesScreen } from "@/features/settings";
import { customerTypeService } from "@/services/customerType.service";
import type { CustomerType } from "@/services/customerType.service";
import { ApiError } from "@/services/api-error";
import type { PageResult } from "@/types/api";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/pengaturan/tipe-pelanggan",
}));

jest.mock("@/lib/swal", () => ({
  ...jest.requireActual("@/lib/swal"),
  swalToast: jest.fn(),
}));

/**
 * Pengaturan › Tipe pelanggan (24 September 2026, on request) — a tenant's own
 * labels for the kind of customer it deals with. Built as "working, not used
 * yet": the fields are just a name and a note, and the callout at the foot
 * says plainly that nothing reads either yet.
 */
const RESELLER: CustomerType = {
  _id: "ct-reseller",
  name: "Reseller",
  note: "Nanti bisa pakai daftar harga sendiri",
};

const REGULER: CustomerType = { _id: "ct-reguler", name: "Reguler", note: null };

function page(items: CustomerType[]): PageResult<CustomerType> {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
  };
}

describe("CustomerTypesScreen", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lists each type with its note, or a dash when there is none", async () => {
    jest
      .spyOn(customerTypeService, "list")
      .mockResolvedValue(page([RESELLER, REGULER]));

    renderWithAuth(<CustomerTypesScreen />);

    expect(await screen.findByText("Reseller")).toBeInTheDocument();
    expect(
      screen.getByText("Nanti bisa pakai daftar harga sendiri"),
    ).toBeInTheDocument();
    expect(screen.getByText("Reguler")).toBeInTheDocument();
    // "Belum diisi" would claim a fact nobody typed — a plain dash is honest.
    expect(screen.getAllByText("—")).toHaveLength(1);
  });

  /* Working, not used yet — the screen has to say so, not just imply it. */
  it("says the type is not wired to a price list yet", async () => {
    jest.spyOn(customerTypeService, "list").mockResolvedValue(page([]));

    renderWithAuth(<CustomerTypesScreen />);

    expect(
      await screen.findByText("Baru kategori, belum daftar harga"),
    ).toBeInTheDocument();
  });

  it("offers to add the first type when the list is empty", async () => {
    jest.spyOn(customerTypeService, "list").mockResolvedValue(page([]));

    renderWithAuth(<CustomerTypesScreen />);

    expect(
      await screen.findByText("Belum ada tipe pelanggan."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Tambah yang pertama/ }),
    ).toBeInTheDocument();
  });

  it("adds a type and refreshes the list", async () => {
    jest
      .spyOn(customerTypeService, "list")
      .mockResolvedValueOnce(page([]))
      .mockResolvedValueOnce(page([RESELLER]));
    const create = jest
      .spyOn(customerTypeService, "create")
      .mockResolvedValue(RESELLER);

    renderWithAuth(<CustomerTypesScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Tipe baru" }),
    );
    await userEvent.type(
      await screen.findByLabelText(/Nama tipe/),
      "Reseller",
    );
    await userEvent.type(
      screen.getByLabelText("Catatan"),
      "Nanti bisa pakai daftar harga sendiri",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Tambah tipe" }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        name: "Reseller",
        note: "Nanti bisa pakai daftar harga sendiri",
      }),
    );
    expect(await screen.findByText("Reseller")).toBeInTheDocument();
  });

  it("opens the edit dialog pre-filled, and sends the change", async () => {
    jest.spyOn(customerTypeService, "list").mockResolvedValue(page([RESELLER]));
    const update = jest
      .spyOn(customerTypeService, "update")
      .mockResolvedValue(RESELLER);

    renderWithAuth(<CustomerTypesScreen />);

    await userEvent.click(await screen.findByRole("button", { name: "Ubah Reseller" }));

    const nameField = await screen.findByLabelText(/Nama tipe/);
    expect(nameField).toHaveValue("Reseller");
    await userEvent.clear(nameField);
    await userEvent.type(nameField, "Grosir Besar");
    await userEvent.click(screen.getByRole("button", { name: "Simpan tipe" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith("ct-reseller", {
        name: "Grosir Besar",
        note: "Nanti bisa pakai daftar harga sendiri",
      }),
    );
  });

  it("refuses an empty name before calling the service", async () => {
    jest.spyOn(customerTypeService, "list").mockResolvedValue(page([]));
    const create = jest.spyOn(customerTypeService, "create");

    renderWithAuth(<CustomerTypesScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Tipe baru" }),
    );
    await screen.findByLabelText(/Nama tipe/);
    await userEvent.click(screen.getByRole("button", { name: "Tambah tipe" }));

    expect(
      screen.getByText("Nama tipe wajib diisi."),
    ).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("puts a name clash on the field it is about", async () => {
    jest.spyOn(customerTypeService, "list").mockResolvedValue(page([]));
    jest
      .spyOn(customerTypeService, "create")
      .mockRejectedValue(new ApiError("Customer type 'Reguler' already exists", 409));

    renderWithAuth(<CustomerTypesScreen />);

    await userEvent.click(
      await screen.findByRole("button", { name: "Tipe baru" }),
    );
    await userEvent.type(
      await screen.findByLabelText(/Nama tipe/),
      "Reguler",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tambah tipe" }));

    expect(
      await screen.findByText('Tipe "Reguler" sudah ada. Pakai nama lain.'),
    ).toBeInTheDocument();
  });

  it("hides Tipe baru and Ubah from a role that may only read", async () => {
    jest.spyOn(customerTypeService, "list").mockResolvedValue(page([RESELLER]));

    renderWithAuth(<CustomerTypesScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "customerTypes", actions: ["read"] }],
    });

    await screen.findByText("Reseller");
    expect(
      screen.queryByRole("button", { name: "Tipe baru" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Ubah/ }),
    ).not.toBeInTheDocument();
  });
});
