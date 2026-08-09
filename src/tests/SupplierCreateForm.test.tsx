import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SupplierCreateForm } from "@/features/purchasing";
import { supplierService } from "@/services/supplier.service";
import { ApiError } from "@/services/api-error";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

describe("SupplierCreateForm", () => {
  beforeEach(() => push.mockClear());
  afterEach(() => jest.restoreAllMocks());

  it("validates before calling create", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/Nama supplier wajib diisi/)).toBeInTheDocument();
  });

  it("flags a malformed NPWP before submitting", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Sumber");
    await userEvent.type(screen.getByLabelText(/NPWP/), "12345");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/15 atau 16 digit/)).toBeInTheDocument();
  });

  /**
   * The service strips whitespace out of an NPWP before storing it, so a number
   * typed with stray spaces around the separators is the SAME number. Flagging
   * it here would refuse something the server would have accepted.
   */
  it("accepts an NPWP typed with stray spaces", async () => {
    const create = jest
      .spyOn(supplierService, "create")
      .mockResolvedValue({ name: "PT Sumber" } as never);
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Sumber");
    await userEvent.type(
      screen.getByLabelText(/NPWP/),
      "01.234.567.8 - 901.000",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ npwp: "01.234.567.8-901.000" }),
    );
  });

  it("rejects a payment term beyond a year — that is a mistyped date", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Sumber");
    const term = screen.getByLabelText(/Termin pembayaran/);
    await userEvent.clear(term);
    await userEvent.type(term, "20260801");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/maksimal 365 hari/)).toBeInTheDocument();
  });

  it("keeps a term of 0 rather than treating it as missing", async () => {
    const create = jest
      .spyOn(supplierService, "create")
      .mockResolvedValue({ name: "PT Tunai" } as never);
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Tunai");
    const term = screen.getByLabelText(/Termin pembayaran/);
    await userEvent.clear(term);
    await userEvent.type(term, "0");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    // 0 is cash on delivery — a real, deliberate term.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ paymentTermDays: 0 }),
    );
  });

  it("sends null rather than empty strings for the untouched optional fields", async () => {
    const create = jest
      .spyOn(supplierService, "create")
      .mockResolvedValue({ name: "PT Sumber" } as never);
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Sumber");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).toHaveBeenCalledWith({
      name: "PT Sumber",
      type: "beli_putus",
      pic: null,
      phone: null,
      email: null,
      address: null,
      npwp: null,
      notes: null,
      paymentTermDays: 30,
    });
  });

  it("creates and returns to the list", async () => {
    jest
      .spyOn(supplierService, "create")
      .mockResolvedValue({ name: "CV Baru Jaya" } as never);
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "CV Baru Jaya");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(push).toHaveBeenCalledWith("/dashboard/purchasing/suppliers");
  });

  /**
   * The duplicate-name check cannot run on the client — only the server knows
   * what the tenant already has — so a 409 has to land on the field rather than
   * in a banner the user has to map back to an input themselves.
   */
  it("puts a duplicate-name conflict on the name field", async () => {
    jest.spyOn(supplierService, "create").mockRejectedValue(
      new ApiError("Supplier 'PT Sumber' already exists", 409, {
        details: [{ field: "name", message: "already exists" }],
      }),
    );
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Sumber");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(await screen.findByText("already exists")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("explains what the payment term drives", () => {
    render(<SupplierCreateForm />);

    expect(
      screen.getByText(/Hari sampai jatuh tempo\. 0 = bayar saat terima\./),
    ).toBeInTheDocument();
  });

  it("explains what the cooperation model means for the ledger", () => {
    render(<SupplierCreateForm />);

    expect(
      screen.getByText(/penerimaan membuat faktur utang/i),
    ).toBeInTheDocument();
  });
});
