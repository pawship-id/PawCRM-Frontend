import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SupplierEditForm } from "@/features/purchasing";
import { supplierService } from "@/services/supplier.service";
import { supplierCategoryService } from "@/services/supplierCategory.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { branchService } from "@/services/branch.service";
import type { Supplier } from "@/types/api";

const push = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

jest.mock("sweetalert2", () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

const SUPPLIER_ID = "5a7f1f77bcf86cd799439033";
const CATEGORY_ID = "6a7f1f77bcf86cd799439044";
const ACCOUNT_ID = "8a7f1f77bcf86cd799439066";
const BRANCH_ID = "7a7f1f77bcf86cd799439055";

/**
 * A supplier registered BEFORE any of the expanded fields existed — no `code`,
 * no `whatsapp`, no `entityType`, and a phone in the national form nobody
 * normalized.
 *
 * The API returns exactly this: `.lean()` reads carry only what is stored, and
 * a Mongoose path default applies on write, not on read. It is therefore the
 * shape the edit screen has to survive, and the reason the assertions below are
 * about what is NOT sent as much as what is.
 */
const LEGACY_SUPPLIER = {
  _id: SUPPLIER_ID,
  tenantId: "507f1f77bcf86cd799439011",
  name: "PT Lama",
  // Four nulls, which is what the API returns for a vendor nobody has filled
  // in — NOT a missing key and NOT a bare string, which is what this field was
  // before it became a subdocument.
  pic: { name: "Bu Rina", email: null, address: null, phone: null },
  phone: "031-8877-221",
  email: "purchasing@lama.co.id",
  address: {
    street: "Jl. Industri 12",
    city: null,
    postalCode: null,
    province: null,
    country: null,
  },
  npwp: null,
  notes: null,
  type: "beli_putus",
  paymentTermDays: 30,
  isActive: true,
  createdBy: null,
  deletedAt: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
} as unknown as Supplier;

/** The same vendor after somebody filled the new fields in. */
const FULL_SUPPLIER = {
  ...LEGACY_SUPPLIER,
  name: "PT Sumber Pangan",
  code: "SUP-001",
  categoryId: CATEGORY_ID,
  category: { _id: CATEGORY_ID, name: "Distributor" },
  entityType: "perusahaan",
  phone: "+62318877221",
  whatsapp: "+6281234567890",
  fax: "+62318877222",
  website: "https://sumberpangan.co.id",
  payableAccountId: ACCOUNT_ID,
  advanceAccountId: null,
  allBranches: false,
  branchIds: [BRANCH_ID],
  bankAccounts: [
    {
      _id: "bank-1",
      accountNumber: "123-456-7890",
      accountHolder: "PT Sumber Pangan",
      bankName: "BCA",
    },
  ],
  pic: {
    name: "Bu Rina",
    email: "rina@sumberpangan.co.id",
    address: "Jl. Rungkut Industri 21",
    phone: "+6281234567891",
  },
  address: {
    street: "Jl. Rungkut Industri 21",
    city: "Surabaya",
    postalCode: "60293",
    province: "Jawa Timur",
    country: "Indonesia",
  },
} as unknown as Supplier;

function mockLoad(supplier: Supplier) {
  jest.spyOn(supplierService, "getById").mockResolvedValue(supplier);
}

beforeEach(() => {
  push.mockClear();
  jest.spyOn(supplierCategoryService, "list").mockResolvedValue({
    items: [{ _id: CATEGORY_ID, name: "Distributor", isActive: true }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  // The Akun Pembelian card asks twice — liabilities then assets — and the
  // branch scope once. Stubbed for every test so their late setStates never
  // land outside act().
  jest.spyOn(chartOfAccountsService, "list").mockResolvedValue({
    items: [
      { _id: ACCOUNT_ID, code: "2102", name: "Utang Distributor" },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
  jest.spyOn(branchService, "list").mockResolvedValue({
    items: [{ _id: BRANCH_ID, name: "Cabang Surabaya" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
});
afterEach(() => jest.restoreAllMocks());

describe("SupplierEditForm", () => {
  /**
   * THE REGRESSION THAT WOULD HURT MOST, and the reason this file exists.
   *
   * Every supplier a tenant already has looks like LEGACY_SUPPLIER. If the form
   * treated an ABSENT key as a change, saving one edited field would also PATCH
   * ten fields to null — silently blanking nothing today and, the day a default
   * changes, blanking something real.
   *
   * The `code` in the payload is not an exception to that: it is the ONE field
   * the user genuinely has to supply, because it became required, and the test
   * below pins that friction on its own.
   */
  it("sends only what the user touched for a supplier carrying none of the new fields", async () => {
    mockLoad(LEGACY_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(LEGACY_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.type(await screen.findByLabelText(/ID Pemasok/), "SUP-009");
    const term = screen.getByLabelText(/Termin pembayaran/);
    await userEvent.clear(term);
    await userEvent.type(term, "45");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    // Two fields, not twelve: the absent `whatsapp`, `website`, `bankAccounts`,
    // branch scope and account overrides are all left alone.
    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, {
      code: "SUP-009",
      paymentTermDays: 45,
    });
  });

  /**
   * ⚠️ THE COST OF MAKING `code` REQUIRED, pinned so nobody discovers it as a
   * bug report. A supplier stored before the field existed cannot be saved from
   * this form until somebody gives it an ID — even when the edit was about
   * something else entirely.
   *
   * That is the intended reading of "required": the alternative leaves it true
   * only of the suppliers nobody has edited since. The form marks the field
   * required and says the ID must be unique, so the demand is visible before the
   * user presses save rather than after.
   */
  it("makes a legacy supplier unsaveable until it is given an ID", async () => {
    mockLoad(LEGACY_SUPPLIER);
    const update = jest.spyOn(supplierService, "update");

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    const term = await screen.findByLabelText(/Termin pembayaran/);
    await userEvent.clear(term);
    await userEvent.type(term, "45");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).not.toHaveBeenCalled();
    expect(await screen.findByText(/ID Pemasok wajib diisi/)).toBeInTheDocument();
  });

  it("opens a legacy supplier without crashing on its missing fields", async () => {
    mockLoad(LEGACY_SUPPLIER);
    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    // Absent, not null — the inputs must still be controlled and empty rather
    // than rendering "undefined" or falling back to uncontrolled.
    expect(await screen.findByLabelText(/ID Pemasok/)).toHaveValue("");
    expect(screen.getByLabelText(/No WhatsApp bisnis/)).toHaveValue("");
    expect(screen.getByLabelText(/Website/)).toHaveValue("");
    // The bank table has no rows, and says so rather than showing a blank row.
    expect(screen.getByText("Belum ada data")).toBeInTheDocument();
    // A supplier written before the branch scope existed is available
    // everywhere — the only reading that does not make it vanish.
    expect(screen.getByLabelText("Semua cabang")).toBeChecked();
  });

  it("seeds every expanded field from the stored supplier", async () => {
    mockLoad(FULL_SUPPLIER);
    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    expect(await screen.findByLabelText(/ID Pemasok/)).toHaveValue("SUP-001");
    expect(screen.getByLabelText(/No telp bisnis/)).toHaveValue("+62318877221");
    expect(screen.getByLabelText(/No WhatsApp bisnis/)).toHaveValue(
      "+6281234567890",
    );
    expect(screen.getByLabelText(/Faximili/)).toHaveValue("+62318877222");
    expect(screen.getByLabelText(/Website/)).toHaveValue(
      "https://sumberpangan.co.id",
    );
    expect(screen.getByLabelText("Kategori")).toHaveTextContent("Distributor");
    expect(screen.getByLabelText("Tipe pemasok")).toHaveTextContent(
      "Perusahaan",
    );
  });

  it("seeds the address parts, the PIC and the bank table", async () => {
    mockLoad(FULL_SUPPLIER);
    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    expect(await screen.findByLabelText("Jalan")).toHaveValue(
      "Jl. Rungkut Industri 21",
    );
    expect(screen.getByLabelText("Kota")).toHaveValue("Surabaya");
    expect(screen.getByLabelText("Kode pos")).toHaveValue("60293");
    expect(screen.getByLabelText("Provinsi")).toHaveValue("Jawa Timur");
    expect(screen.getByLabelText("Negara")).toHaveValue("Indonesia");

    expect(screen.getByLabelText("Nama")).toHaveValue("Bu Rina");
    expect(screen.getByLabelText("No HP")).toHaveValue("+6281234567891");

    expect(screen.getByLabelText(/No rekening baris 1/)).toHaveValue(
      "123-456-7890",
    );
    expect(screen.getByLabelText(/Nama bank baris 1/)).toHaveValue("BCA");
  });

  /**
   * THE BRANCH SCOPE IS TWO HALVES OF ONE SETTING, and both must be sent
   * together. Sending `allBranches: false` alone would make the server validate
   * against the STORED list rather than the one the user just picked.
   */
  it("sends both halves of the branch scope when either changes", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.click(await screen.findByLabelText("Semua cabang"));
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, {
      allBranches: true,
      // Cleared, not left behind: a stale list is a trap the day the box is
      // unticked again.
      branchIds: [],
    });
  });

  it("sends the whole bank list when one row changes", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    const bank = await screen.findByLabelText(/Nama bank baris 1/);
    await userEvent.clear(bank);
    await userEvent.type(bank, "Mandiri");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    // Replace-the-array is the API's contract, so there is no partial form to
    // send — the row's `_id` is not echoed back either.
    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, {
      bankAccounts: [
        {
          accountNumber: "123-456-7890",
          accountHolder: "PT Sumber Pangan",
          bankName: "Mandiri",
        },
      ],
    });
  });

  it("removes a bank row and sends the shortened list", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.click(
      await screen.findByLabelText(/Hapus rekening baris 1/),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, { bankAccounts: [] });
  });

  it("refuses to save a bank row missing its bank name", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest.spyOn(supplierService, "update");

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.clear(await screen.findByLabelText(/Nama bank baris 1/));
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    // A row is a payment instruction; one missing its bank is one nobody can
    // pay against.
    expect(update).not.toHaveBeenCalled();
    expect(
      await screen.findByText("Nama bank wajib diisi"),
    ).toBeInTheDocument();
  });

  /**
   * A PARTIAL PIC PATCH MERGES SERVER-SIDE, but the client still sends the whole
   * object — see supplierPayload.ts for why diffing part by part would save
   * nothing and add five more comparisons to get wrong.
   */
  it("sends the whole PIC object when one part changes", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    const picName = await screen.findByLabelText("Nama");
    await userEvent.clear(picName);
    await userEvent.type(picName, "Pak Hendra");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, {
      pic: {
        name: "Pak Hendra",
        email: "rina@sumberpangan.co.id",
        address: "Jl. Rungkut Industri 21",
        // AS STORED, not re-normalized — the client never formats a number.
        phone: "+6281234567891",
      },
    });
  });

  /**
   * THE NORMALIZATION ROUND TRIP. The server stores "+6281234567890" and the
   * form shows it; a user who retypes the same number in the national form has
   * changed NOTHING, and a literal string compare would disagree — sending a
   * PATCH that makes the server re-check a value nobody touched.
   */
  it("does not treat a re-typed phone number as a change", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest.spyOn(supplierService, "update");

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    const whatsapp = await screen.findByLabelText(/No WhatsApp bisnis/);
    await userEvent.clear(whatsapp);
    await userEvent.type(whatsapp, "0812-3456-7890");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    // Nothing differs, so the form short-circuits rather than sending a body the
    // backend would answer with a 400.
    expect(update).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(
      `/dashboard/purchasing/suppliers/${SUPPLIER_ID}`,
    );
  });

  it("sends a genuinely different number as typed, not pre-formatted", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    const whatsapp = await screen.findByLabelText(/No WhatsApp bisnis/);
    await userEvent.clear(whatsapp);
    await userEvent.type(whatsapp, "0813-0000-1111");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, {
      whatsapp: "0813-0000-1111",
    });
  });

  it("clears a field the user emptied", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.clear(await screen.findByLabelText(/Faximili/));
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    // null, not "" — an emptied input means "no value", and "" would be stored
    // as neither absent nor present.
    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, { fax: null });
  });

  /**
   * `code` IS THE ONE FIELD THAT CANNOT BE EMPTIED. It is required on create,
   * and a field that cannot be omitted on the way in must not be clearable on
   * the way back — otherwise "required" would hold only for suppliers nobody has
   * edited since. The client refuses it before the server has to.
   */
  it("refuses to save with the ID Pemasok cleared", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest.spyOn(supplierService, "update");

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.clear(await screen.findByLabelText(/ID Pemasok/));
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).not.toHaveBeenCalled();
    expect(await screen.findByText(/ID Pemasok wajib diisi/)).toBeInTheDocument();
  });

  it("ungroups a supplier when the category is set back to none", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.click(await screen.findByLabelText("Kategori"));
    await userEvent.click(
      await screen.findByRole("option", { name: "Tanpa kategori" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, { categoryId: null });
  });

  it("sends a chosen payable account", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    // FULL_SUPPLIER already points at ACCOUNT_ID, so clear it to the default
    // first — proving the picker can also UNSET an override, which is the case
    // an accountant reaches for when a special account is retired.
    await userEvent.click(await screen.findByLabelText("Akun Utang"));
    await userEvent.click(
      await screen.findByRole("option", { name: /2101/ }),
    );
    await userEvent.click(screen.getByLabelText("Akun Utang"));
    await userEvent.click(
      await screen.findByRole("option", { name: /Utang Distributor/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    // Back where it started, so the form has nothing to send.
    expect(update).not.toHaveBeenCalled();
  });

  it("clears a payable override back to the default account", async () => {
    mockLoad(FULL_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(FULL_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.click(await screen.findByLabelText("Akun Utang"));
    await userEvent.click(await screen.findByRole("option", { name: /2101/ }));
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    // null, not "" — the API reads null as "fall back to the seeded account".
    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, {
      payableAccountId: null,
    });
  });

  it("sets a payable override on a supplier that had none", async () => {
    mockLoad(LEGACY_SUPPLIER);
    const update = jest
      .spyOn(supplierService, "update")
      .mockResolvedValue(LEGACY_SUPPLIER);

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    await userEvent.type(await screen.findByLabelText(/ID Pemasok/), "SUP-009");
    await userEvent.click(screen.getByLabelText("Akun Utang"));
    await userEvent.click(
      await screen.findByRole("option", { name: /Utang Distributor/ }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(update).toHaveBeenCalledWith(SUPPLIER_ID, {
      code: "SUP-009",
      payableAccountId: ACCOUNT_ID,
    });
  });

  it("puts a server refusal on the field it names", async () => {
    mockLoad(FULL_SUPPLIER);
    const { ApiError } = await import("@/services/api-error");
    jest.spyOn(supplierService, "update").mockRejectedValue(
      new ApiError("Supplier code 'SUP-002' already exists", 409, {
        details: [{ field: "code", message: "already exists" }],
      }),
    );

    render(<SupplierEditForm supplierId={SUPPLIER_ID} />);

    const code = await screen.findByLabelText(/ID Pemasok/);
    await userEvent.clear(code);
    await userEvent.type(code, "SUP-002");
    await userEvent.click(
      screen.getByRole("button", { name: "Simpan perubahan" }),
    );

    expect(await screen.findByText("already exists")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
