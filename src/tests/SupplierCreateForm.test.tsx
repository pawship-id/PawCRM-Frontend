import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SupplierCreateForm } from "@/features/purchasing";
import { supplierService } from "@/services/supplier.service";
import { supplierCategoryService } from "@/services/supplierCategory.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { branchService } from "@/services/branch.service";
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
  beforeEach(() => {
    push.mockClear();
    // The category picker fetches on mount. Stubbed for EVERY test rather than
    // only the ones that assert on it: left real, the request escapes into an
    // unmocked apiClient and its late setState lands outside act(), which turns
    // every case in this file into a warning and an occasional flake.
    jest.spyOn(supplierCategoryService, "list").mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    } as never);
    // The Akun Pembelian card and the branch scope both fetch on mount, for the
    // same reason the category picker does. Stubbed for EVERY test rather than
    // only the ones that assert on them: left real, the requests escape into an
    // unmocked apiClient and their late setStates land outside act().
    jest.spyOn(chartOfAccountsService, "list").mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    } as never);
    jest.spyOn(branchService, "list").mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  /** Fills the two required fields the form cannot be submitted without. */
  async function fillRequired(code = "SUP-001") {
    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Sumber");
    await userEvent.type(screen.getByLabelText(/ID Pemasok/), code);
  }

  it("validates before calling create", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/Nama supplier wajib diisi/)).toBeInTheDocument();
  });

  /**
   * `code` JOINED `name` AS REQUIRED, which is a real friction worth pinning:
   * it also means a supplier stored before the field existed cannot be saved
   * from the edit form until somebody gives it an ID. That is the intended
   * reading of "required" — the alternative leaves it true only of the
   * suppliers nobody has edited since.
   */
  it("refuses to submit without an ID Pemasok", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    // Name only — the ID is deliberately left blank.
    await userEvent.type(screen.getByLabelText(/Nama supplier/), "PT Sumber");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByText(/ID Pemasok wajib diisi/)).toBeInTheDocument();
  });

  it("flags a malformed NPWP before submitting", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await fillRequired();
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

    await fillRequired();
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

    await fillRequired();
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
    await userEvent.type(screen.getByLabelText(/ID Pemasok/), "SUP-003");
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

    await fillRequired();
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    // EVERY optional field, listed exhaustively rather than with
    // objectContaining: this is the test that catches a new field being added to
    // the form and quietly not being sent, which is the failure mode that has
    // already bitten the list query twice (see supplier.service.test.ts).
    expect(create).toHaveBeenCalledWith({
      name: "PT Sumber",
      type: "beli_putus",
      // Required, so a plain string and a number rather than nullable ones.
      code: "SUP-001",
      paymentTermDays: 30,
      categoryId: null,
      entityType: null,
      payableAccountId: null,
      advanceAccountId: null,
      // A boolean and its paired list, never null: a supplier is either
      // available everywhere or in a named set.
      allBranches: true,
      branchIds: [],
      bankAccounts: [],
      /**
       * THE SUBDOCUMENTS GO UP AS OBJECTS OF NULLS, not as null. Both reach the
       * same stored state, but sending the shape the API RETURNS keeps the
       * create and the read symmetric — and it is what makes a partial PIC
       * expressible at all, which `null` for the whole object is not.
       */
      pic: { name: null, email: null, address: null, phone: null },
      address: {
        street: null,
        city: null,
        postalCode: null,
        province: null,
        country: null,
      },
      phone: null,
      whatsapp: null,
      fax: null,
      website: null,
      email: null,
      npwp: null,
      notes: null,
    });
  });

  it("creates and returns to the list", async () => {
    jest
      .spyOn(supplierService, "create")
      .mockResolvedValue({ name: "CV Baru Jaya" } as never);
    render(<SupplierCreateForm />);

    await userEvent.type(screen.getByLabelText(/Nama supplier/), "CV Baru Jaya");
    await userEvent.type(screen.getByLabelText(/ID Pemasok/), "SUP-002");
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

    await fillRequired();
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(await screen.findByText("already exists")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  /**
   * `findBy`, not `getBy`, in the two copy assertions below. The category picker
   * resolves after mount, so a synchronous assertion returns before that state
   * update lands and React reports it as an update outside act() — the
   * assertion still passes, and the file fills with warnings that hide a real
   * one. Awaiting anything is enough to let the fetch settle first.
   */
  it("explains what the payment term drives", async () => {
    render(<SupplierCreateForm />);

    expect(
      await screen.findByText(
        /Hari sampai jatuh tempo\. 0 = bayar saat terima\./,
      ),
    ).toBeInTheDocument();
  });

  it("explains what the cooperation model means for the ledger", async () => {
    render(<SupplierCreateForm />);

    expect(
      await screen.findByText(/penerimaan membuat faktur utang/i),
    ).toBeInTheDocument();
  });

  /**
   * THE KATEGORI PICKER offers only what /api/supplier-categories returns, and
   * that resource is `kind: "supplier"` by definition — there is no parameter to
   * get wrong and no product category to filter out client-side. This asserts
   * the picker asks the right service for the right slice: active labels only,
   * so a retired one cannot be chosen for a new vendor.
   */
  it("offers only active supplier categories", async () => {
    const list = jest
      .spyOn(supplierCategoryService, "list")
      .mockResolvedValue({
        items: [
          { _id: "cat-1", name: "Distributor", isActive: true },
          { _id: "cat-2", name: "Pabrikan", isActive: true },
        ],
        pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
      } as never);

    render(<SupplierCreateForm />);

    await userEvent.click(await screen.findByLabelText("Kategori"));

    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: true }),
    );
    expect(
      await screen.findByRole("option", { name: "Distributor" }),
    ).toBeInTheDocument();
    // The escape hatch: grouping is optional, so "no category" has to be a
    // choosable option rather than an empty trigger.
    expect(
      screen.getByRole("option", { name: "Tanpa kategori" }),
    ).toBeInTheDocument();
  });

  it("sends the new identity, contact and PIC fields", async () => {
    const create = jest
      .spyOn(supplierService, "create")
      .mockResolvedValue({ name: "PT Sumber" } as never);
    render(<SupplierCreateForm />);

    await fillRequired();
    await userEvent.type(screen.getByLabelText(/No telp bisnis/), "031-8877-221");
    await userEvent.type(
      screen.getByLabelText(/No WhatsApp bisnis/),
      "0812-3456-7890",
    );
    await userEvent.type(screen.getByLabelText(/Faximili/), "031-8877-222");
    await userEvent.type(screen.getByLabelText(/Website/), "sumberpangan.co.id");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "SUP-001",
        // AS TYPED. The server normalizes to E.164; formatting here would be a
        // second implementation of that rule, free to disagree with it.
        phone: "031-8877-221",
        whatsapp: "0812-3456-7890",
        fax: "031-8877-222",
        // Scheme-less too — the server prepends https://.
        website: "sumberpangan.co.id",
      }),
    );
  });

  it("flags a WhatsApp number too short to dial before submitting", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await fillRequired();
    await userEvent.type(screen.getByLabelText(/No WhatsApp bisnis/), "0812");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    // Names the field it is about: four numbers share one rule, and "nomor
    // telepon" on the WhatsApp row sends the user to the wrong input.
    expect(
      await screen.findByText(/Nomor WhatsApp tidak lengkap/),
    ).toBeInTheDocument();
  });

  it("flags a malformed website before submitting", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await fillRequired();
    await userEvent.type(screen.getByLabelText(/Website/), "lihat di IG");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/Alamat website tidak valid/),
    ).toBeInTheDocument();
  });

  it("flags an ID supplier containing a space", async () => {
    const create = jest.spyOn(supplierService, "create");
    render(<SupplierCreateForm />);

    await fillRequired();
    await userEvent.type(screen.getByLabelText(/ID Pemasok/), "SUP 001");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(create).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/tidak boleh mengandung spasi/),
    ).toBeInTheDocument();
  });

  /**
   * A duplicate code, like a duplicate name, is only knowable to the server.
   * Its 409 names `code` in `details`, so it has to land on that input rather
   * than in a banner the user must map back themselves.
   */
  it("puts a duplicate-code conflict on the ID supplier field", async () => {
    jest.spyOn(supplierService, "create").mockRejectedValue(
      new ApiError("Supplier code 'SUP-001' already exists", 409, {
        details: [{ field: "code", message: "already exists" }],
      }),
    );
    render(<SupplierCreateForm />);

    await fillRequired();
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(await screen.findByText("already exists")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  /**
   * The one refusal no client rule can anticipate: a `categoryId` the server has
   * since deleted or retired comes back as a 400 naming the field. It must land
   * on the select, not in a banner.
   */
  it("puts an unknown-category 400 on the category field", async () => {
    jest.spyOn(supplierService, "create").mockRejectedValue(
      new ApiError("Unknown supplier category", 400, {
        details: [
          { field: "categoryId", message: "Kategori supplier tidak ditemukan" },
        ],
      }),
    );
    render(<SupplierCreateForm />);

    await fillRequired();
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan supplier" }),
    );

    expect(
      await screen.findByText("Kategori supplier tidak ditemukan"),
    ).toBeInTheDocument();
  });
});
