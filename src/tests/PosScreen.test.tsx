import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosScreen } from "@/features/pos";
import { posService } from "@/services/pos.service";
import { productService } from "@/services/product.service";
import { warehouseService } from "@/services/warehouse.service";
import { categoryService } from "@/services/category.service";
import { userService } from "@/services/user.service";
import { branchService } from "@/services/branch.service";
import { ApiError } from "@/services/api-error";
import type { PosShift, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");
jest.mock("@/services/product.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/category.service");
jest.mock("@/services/user.service");
jest.mock("@/services/branch.service");

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedCategories = categoryService as jest.Mocked<typeof categoryService>;
const mockedWarehouses = warehouseService as jest.Mocked<typeof warehouseService>;
const mockedUsers = userService as jest.Mocked<typeof userService>;
const mockedProducts = productService as jest.Mocked<typeof productService>;
const mockedBranches = branchService as jest.Mocked<typeof branchService>;

const SHIFT_ID = "5a7f1f77bcf86cd7994390d1";
const CART_ID = "5a7f1f77bcf86cd7994390e1";
const PRODUCT_ID = "5a7f1f77bcf86cd7994390f1";
const PARENT_ID = "5a7f1f77bcf86cd799439102";
const VARIANT_ID = "5a7f1f77bcf86cd799439103";
const APPROVER_ID = "507f191e810c19729de860bb";

const shift: PosShift = {
  _id: SHIFT_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftNumber: "SHF-2026-0001",
  cashierUserId: "auth-user",
  openedAt: "2026-08-24T02:00:00.000Z",
  openingCash: "500000.0000",
  closedAt: null,
  countedCash: null,
  expectedCash: null,
  difference: null,
  closingNotes: null,
  status: "open",
  createdAt: "2026-08-24T02:00:00.000Z",
  updatedAt: "2026-08-24T02:00:00.000Z",
};

const emptyCart: PosTransaction = {
  _id: CART_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftId: SHIFT_ID,
  transactionNumber: null,
  customerId: null,
  items: [],
  cartDiscount: null,
  otherCharges: [],
  note: null,
  payments: [],
  totals: null,
  runningTotals: {
    subtotal: "0.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    net: "0.0000",
  },
  status: "held",
  heldLabel: null,
  bookingIds: [],
  paidAt: null,
  createdAt: "2026-08-24T02:00:00.000Z",
  updatedAt: "2026-08-24T02:00:00.000Z",
};

const cartWithItem: PosTransaction = {
  ...emptyCart,
  items: [
    {
      kind: "product",
      refId: PRODUCT_ID,
      name: "Royal Canin Adult 2kg",
      sku: "RC-ADULT-2KG",
      qty: "1.0000",
      unitPrice: "100000.0000",
      lineTotal: "100000.0000",
      discount: null,
      hppAtTime: null,
      bookingId: null,
      petId: null,
      petName: null,
      groomerName: null,
    },
  ],
  runningTotals: {
    subtotal: "100000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    net: "100000.0000",
  },
};

const catalogPage = {
  items: [
    {
      kind: "product" as const,
      _id: PRODUCT_ID,
      name: "Royal Canin Adult 2kg",
      code: "RC-ADULT-2KG",
      price: "100000.0000",
      categoryId: "c1",
      unit: "pcs",
      variantCount: null,
      stock: { qty: "12.0000", state: "ok" as const },
    },
    {
      kind: "product" as const,
      _id: PARENT_ID,
      name: "Kalung Anjing",
      code: null,
      price: null,
      categoryId: "c1",
      unit: "pcs",
      variantCount: 3,
      stock: null,
    },
  ],
  pagination: { page: 1, limit: 8, total: 2, totalPages: 1 },
};

beforeEach(() => {
  mockedPos.currentShift.mockResolvedValue(shift);
  mockedPos.heldCarts.mockResolvedValue([]);
  mockedPos.catalog.mockResolvedValue(catalogPage);
  mockedPos.createCart.mockResolvedValue(emptyCart);
  mockedPos.updateCart.mockResolvedValue(cartWithItem);
  mockedCategories.list.mockResolvedValue({
    items: [{ _id: "c1", name: "Makanan" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedWarehouses.list.mockResolvedValue({
    items: [{ _id: "w1", name: "Gudang Utama" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedBranches.list.mockResolvedValue({
    items: [{ _id: "b1", name: "Toko Pusat" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedUsers.list.mockResolvedValue({
    items: [{ _id: APPROVER_ID, fullName: "Bu Rina" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

/**
 * The gate (FR-9).
 *
 * These are the tests that matter most on this screen: everything else assumes a
 * shift, and the failure they guard is a cashier building a basket that cannot
 * be paid for and finding out with a customer waiting.
 */
describe("PosScreen — the shift gate", () => {
  it("shows Buka Kasir instead of the till when no shift is open", async () => {
    mockedPos.currentShift.mockResolvedValue(null);

    renderWithAuth(<PosScreen />);

    expect(
      await screen.findByRole("heading", { name: /buka kasir/i }),
    ).toBeInTheDocument();
    // Not merely a warning above a working catalogue.
    expect(mockedPos.catalog).not.toHaveBeenCalled();
  });

  it("treats a null shift as the ordinary state, not an error", async () => {
    mockedPos.currentShift.mockResolvedValue(null);

    renderWithAuth(<PosScreen />);

    await screen.findByRole("heading", { name: /buka kasir/i });
    expect(screen.queryByText(/tidak bisa dibaca/i)).not.toBeInTheDocument();
  });

  it("shows the till, and the shift it belongs to, once one is open", async () => {
    renderWithAuth(<PosScreen />);

    expect(await screen.findByText(/SHF-2026-0001/)).toBeInTheDocument();
    expect(screen.getByText(/Rp\s?500.000/)).toBeInTheDocument();
  });
});

describe("PosScreen — the catalogue (FR-1)", () => {
  it("adds a tile to the basket", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah royal canin/i }),
    );

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        items: [{ kind: "product", refId: PRODUCT_ID, qty: "1" }],
      }),
    );
  });

  it("opens a variant picker for a parent rather than adding it", async () => {
    const user = userEvent.setup();
    mockedProducts.listVariants.mockResolvedValue({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parent: { _id: PARENT_ID } as any,
      items: [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { _id: VARIANT_ID, name: "Kalung Anjing — M", sku: "KA-M", sellPrice: "45000.0000", categoryId: "c1", unit: "pcs" } as any,
      ],
    });

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /pilih varian kalung anjing/i }),
    );

    expect(await screen.findByText("Kalung Anjing — M")).toBeInTheDocument();
    // A parent is not sellable — nothing was rung up by opening the picker.
    expect(mockedPos.updateCart).not.toHaveBeenCalled();
  });

  it("shows a parent's variant count where a price would be", async () => {
    renderWithAuth(<PosScreen />);

    expect(await screen.findByText("3 varian")).toBeInTheDocument();
  });
});

describe("PosScreen — the basket", () => {
  it("shows the server's running total, not one it computed", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah royal canin/i }),
    );

    // Asserted on the TOTAL row rather than on the figure anywhere on screen:
    // the tile, the unit price and the line all read 100.000 here too, and a
    // test that matched any of them would pass with the total missing.
    const totalRow = (await screen.findByText("Total")).parentElement;
    // From runningTotals.net — the figure the receipt will carry.
    expect(totalRow).toHaveTextContent(/Rp\s?100.000/);
  });

  it("says plainly that PPN is settled at payment", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah royal canin/i }),
    );

    expect(
      await screen.findByText(/ppn dihitung saat pembayaran/i),
    ).toBeInTheDocument();
  });
});

/**
 * FR-4's over-limit path.
 *
 * A 409 here is a REQUEST FOR APPROVAL, not a failure, and the thing that must
 * not drift is which patch gets retried: the one that was refused, with an
 * approver attached, and not one rebuilt from the current state.
 */
describe("PosScreen — a discount above the cashier's limit (FR-4)", () => {
  async function refuseThenApprove() {
    const user = userEvent.setup();

    mockedPos.updateCart
      .mockResolvedValueOnce(cartWithItem)
      .mockRejectedValueOnce(
        new ApiError("Conflict", 409, {
          reason: "A discount above 10% needs an approver",
        }),
      )
      .mockResolvedValue(cartWithItem);

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah royal canin/i }),
    );
    const basket = within(await screen.findByRole("complementary"));
    await basket.findByText("Royal Canin Adult 2kg");

    await user.click(
      screen.getByRole("button", { name: /^diskon keranjang$/i }),
    );
    await user.type(screen.getByLabelText(/diskon persen/i), "20");
    await user.click(screen.getByRole("button", { name: /terapkan/i }));

    return user;
  }

  it("asks for an approver instead of reporting a failure", async () => {
    await refuseThenApprove();

    expect(
      await screen.findByText(/diskon perlu persetujuan/i),
    ).toBeInTheDocument();
    // Not surfaced as a red error the cashier has to interpret.
    expect(screen.queryByText(/terjadi kesalahan/i)).not.toBeInTheDocument();
  });

  it("retries the SAME discount with the approver attached", async () => {
    const user = await refuseThenApprove();

    await screen.findByText(/diskon perlu persetujuan/i);
    await user.click(screen.getByRole("combobox", { name: /disetujui oleh/i }));
    await user.click(await screen.findByRole("option", { name: "Bu Rina" }));
    await user.click(screen.getByRole("button", { name: /setujui diskon/i }));

    await waitFor(() => {
      const last = mockedPos.updateCart.mock.calls.at(-1);
      expect(last?.[1]).toEqual({
        cartDiscount: {
          mode: "percent",
          value: "20",
          approvedBy: APPROVER_ID,
        },
      });
    });
  });
});

describe("PosScreen — held carts (FR-6)", () => {
  it("lists the shift's parked baskets and resumes one", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      { ...cartWithItem, heldLabel: "Kak Rina" },
    ]);

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Kak Rina")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: /lanjutkan/i }));

    const basket = within(await screen.findByRole("complementary"));
    expect(
      await basket.findByText("Royal Canin Adult 2kg"),
    ).toBeInTheDocument();
  });

  it("counts the parked baskets on the shift bar", async () => {
    mockedPos.heldCarts.mockResolvedValue([cartWithItem, emptyCart]);

    renderWithAuth(<PosScreen />);

    expect(
      await screen.findByRole("button", { name: /keranjang tersimpan \(2\)/i }),
    ).toBeInTheDocument();
  });
});

/**
 * Tutup Kasir (FR-9).
 *
 * The ordering is the control being tested: a cashier who is shown the expected
 * figure before counting has a number to make the drawer agree with, and the
 * count stops being independent evidence of anything.
 */
describe("PosScreen — closing the till (FR-9)", () => {
  beforeEach(() => {
    mockedPos.xReport.mockResolvedValue({
      shift,
      transactionCount: 4,
      breakdown: [],
      totals: {
        takings: "300000.0000",
        cashTakings: "200000.0000",
        expectedCash: "700000.0000",
      },
    });
  });

  it("hides the expected cash until a count has been typed", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(await screen.findByRole("button", { name: /tutup kasir/i }));
    await screen.findByLabelText(/uang di laci/i);

    expect(screen.queryByText(/kas seharusnya/i)).not.toBeInTheDocument();
  });

  it("shows the variance once a count exists", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(await screen.findByRole("button", { name: /tutup kasir/i }));
    await user.type(await screen.findByLabelText(/uang di laci/i), "650000");

    expect(await screen.findByText(/kas seharusnya/i)).toBeInTheDocument();
    expect(screen.getByText(/kurang/i)).toBeInTheDocument();
  });

  it("closes the till even when the drawer is well short", async () => {
    const user = userEvent.setup();
    mockedPos.closeShift.mockResolvedValue({ ...shift, status: "closed" });

    renderWithAuth(<PosScreen />);

    await user.click(await screen.findByRole("button", { name: /tutup kasir/i }));
    await user.type(await screen.findByLabelText(/uang di laci/i), "100000");
    await user.click(
      screen.getByRole("button", { name: /^tutup kasir$/i, hidden: false }),
    );

    // FR-9: a shop cannot stop trading tomorrow because money went missing today.
    await waitFor(() =>
      expect(mockedPos.closeShift).toHaveBeenCalledWith(SHIFT_ID, {
        countedCash: "100000",
        closingNotes: undefined,
      }),
    );
  });

  it("refuses a count typed with thousands separators", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(await screen.findByRole("button", { name: /tutup kasir/i }));
    // "500.000" is five hundred thousand to a person and 500 to Number().
    await user.type(await screen.findByLabelText(/uang di laci/i), "500.000");

    expect(await screen.findByText(/tanpa titik/i)).toBeInTheDocument();
  });
});

/**
 * The branch gate — the one BEFORE the shift.
 *
 * The bug these were written for: an owner reaches every branch, so their
 * session starts pointed at none, and `GET /pos/shifts/current` answers 400
 * "switch to a branch first". The screen turned that into "coba muat ulang
 * halaman", which was both wrong advice and hid the one instruction that would
 * have worked.
 */
describe("PosScreen — the branch gate", () => {
  it("asks which branch before anything else when the session has none", async () => {
    renderWithAuth(<PosScreen />, { session: { currentBranchId: null } });

    expect(
      await screen.findByRole("heading", { name: /pilih cabang/i }),
    ).toBeInTheDocument();
  });

  it("does not ask the shift endpoint at all without a branch", async () => {
    renderWithAuth(<PosScreen />, { session: { currentBranchId: null } });

    await screen.findByRole("heading", { name: /pilih cabang/i });
    // The 400 is an instruction the screen already has — asking for it and then
    // translating the refusal back would be a round trip that answers nothing.
    expect(mockedPos.currentShift).not.toHaveBeenCalled();
  });

  it("switches the SESSION, not just the screen", async () => {
    const user = userEvent.setup();
    const switchBranch = jest.fn().mockResolvedValue(undefined);

    renderWithAuth(<PosScreen />, {
      session: { currentBranchId: null },
      switchBranch,
    });

    await user.click(await screen.findByRole("button", { name: /cabang/i }));
    await user.click(await screen.findByRole("option", { name: "Toko Pusat" }));
    await user.click(screen.getByRole("button", { name: /lanjut/i }));

    // Session-wide, because the branch decides where the sale, the shift and
    // its journal entry are booked.
    await waitFor(() => expect(switchBranch).toHaveBeenCalledWith("b1"));
  });

  it("goes straight to the till when the session already names a branch", async () => {
    renderWithAuth(<PosScreen />);

    expect(await screen.findByText(/SHF-2026-0001/)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /pilih cabang/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * What the screen SAYS when the read fails.
 *
 * The failure these guard is advice, not a crash: a message that sends somebody
 * to reload for a problem reloading cannot fix wastes the one moment they were
 * willing to act.
 */
describe("PosScreen — when the shift status cannot be read", () => {
  it("names a permission problem as one, instead of suggesting a reload", async () => {
    mockedPos.currentShift.mockRejectedValue(
      new ApiError("Forbidden", 403, { reason: "Missing permission" }),
    );

    renderWithAuth(<PosScreen />);

    expect(await screen.findByText(/belum punya akses kasir/i)).toBeInTheDocument();
    expect(screen.queryByText(/muat ulang/i)).not.toBeInTheDocument();
  });

  it("still offers a reload for a server-side failure, where it may help", async () => {
    mockedPos.currentShift.mockRejectedValue(
      new ApiError("Server error", 500),
    );

    renderWithAuth(<PosScreen />);

    expect(await screen.findByText(/muat ulang halaman/i)).toBeInTheDocument();
  });
});

/**
 * Which shelves the shift may be opened on.
 *
 * The picker mirrors a server rule rather than inventing one: a warehouse that
 * names a DIFFERENT branch is refused, while one naming none is a central
 * warehouse serving every branch and is fine. The server is the authority; this
 * only keeps the picker from offering a choice that will be refused.
 */
describe("PosShiftGate — the warehouse picker", () => {
  beforeEach(() => {
    mockedPos.currentShift.mockResolvedValue(null);
    mockedWarehouses.list.mockResolvedValue({
      items: [
        { _id: "w1", name: "Gudang Toko Pusat", defaultBranchId: "b1" },
        { _id: "w2", name: "Gudang Cabang Bazar", defaultBranchId: "b2" },
        { _id: "w3", name: "Gudang Pusat", defaultBranchId: null },
      ],
      pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it("does not offer another branch's warehouse", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(await screen.findByRole("button", { name: /gudang/i }));

    // Booking revenue to Toko Pusat while deducting stock from Bazar is a
    // shortage nobody can trace.
    expect(
      screen.queryByRole("option", { name: "Gudang Cabang Bazar" }),
    ).not.toBeInTheDocument();
  });

  it("offers a central warehouse, which belongs to no branch", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(await screen.findByRole("button", { name: /gudang/i }));

    expect(
      await screen.findByRole("option", { name: "Gudang Pusat" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Gudang Toko Pusat" }),
    ).toBeInTheDocument();
  });
});
