import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosScreen } from "@/features/pos";
import { posService } from "@/services/pos.service";
import { warehouseService } from "@/services/warehouse.service";
import { categoryService } from "@/services/category.service";
import { userService } from "@/services/user.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import type { PosShift, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/category.service");
jest.mock("@/services/user.service");
// SweetAlert reaches for window.matchMedia, which jsdom does not provide — the
// same mock every other suite here uses.
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("@/services/branch.service");
jest.mock("@/services/customer.service");

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedCategories = categoryService as jest.Mocked<typeof categoryService>;
const mockedWarehouses = warehouseService as jest.Mocked<
  typeof warehouseService
>;
const mockedUsers = userService as jest.Mocked<typeof userService>;
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
  customer: null,
  items: [],
  cartDiscount: null,
  otherCharges: [],
  note: null,
  payments: [],
  totals: null,
  customerInvoiceId: null,
  runningTotals: {
    subtotal: "0.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    net: "0.0000",
  },
  // A basket the till is building — NOT parked. Parking is a decision now.
  status: "active",
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
      bookingStatus: null,
      bookingOwned: false,
      bookingNumber: null,
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

/** One variant, as the catalogue returns it — with the shift's own stock. */
const variantTile = (
  id: string,
  name: string,
  code: string,
  stock: { qty: string; state: "ok" | "low" | "out" },
) => ({
  kind: "product" as const,
  _id: id,
  name,
  code,
  barcode: null,
  price: "45000.0000",
  categoryId: "c1",
  unit: "pcs",
  image: null,
  variantCount: null,
  stock,
});

const catalogPage = {
  items: [
    {
      kind: "product" as const,
      _id: PRODUCT_ID,
      name: "Royal Canin Adult 2kg",
      code: "RC-ADULT-2KG",
      barcode: "8991234567890",
      price: "100000.0000",
      categoryId: "c1",
      unit: "pcs",
      variantCount: null,
      image: {
        url: "rc.jpg",
        thumbUrl: "rc-320.jpg",
        mediumUrl: null,
        mediaType: "image",
      },
      stock: { qty: "12.0000", state: "ok" as const },
    },
    {
      kind: "product" as const,
      _id: PARENT_ID,
      name: "Kalung Anjing",
      code: null,
      barcode: null,
      price: null,
      categoryId: "c1",
      unit: "pcs",
      variantCount: 3,
      // Never photographed — the tile draws a placeholder.
      image: null,
      stock: null,
    },
  ],
  pagination: { page: 1, limit: 8, total: 2, totalPages: 1 },
};

beforeEach(() => {
  const mockedCustomers = customerService as jest.Mocked<
    typeof customerService
  >;
  mockedCustomers.list.mockResolvedValue({
    items: [{ _id: "cust-1", name: "Ibu Rina", phone: "0812-3456-7890" }],
    pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedPos.currentShift.mockResolvedValue(shift);
  mockedPos.heldCarts.mockResolvedValue([]);
  // The basket recovered on load — null is the ordinary answer.
  mockedPos.activeCart.mockResolvedValue(null);
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
    mockedPos.catalog.mockImplementation(async (query) =>
      query?.parentId
        ? {
            items: [
              variantTile(VARIANT_ID, "Kalung Anjing — M", "KA-M", {
                qty: "4.0000",
                state: "ok",
              }),
            ],
            pagination: { page: 1, limit: 48, total: 1, totalPages: 1 },
          }
        : catalogPage,
    );

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", {
        name: /pilih varian kalung anjing/i,
      }),
    );

    /*
      "M", not "Kalung Anjing — M". Every variant's stored name repeats its
      parent's, and the modal's subtitle already says it — repeating it on every
      row pushed the part that actually distinguishes the sizes off the end of
      the line.
    */
    expect(await screen.findByText("M")).toBeInTheDocument();
    expect(screen.queryByText("Kalung Anjing — M")).not.toBeInTheDocument();

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

    await user.click(
      within(dialog).getByRole("button", { name: /lanjutkan/i }),
    );

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
 * Pengaturan Kasir (FR-8) — reachable from the till, because that is the device.
 */
describe("PosScreen — the till's own settings", () => {
  it("opens them from the shift bar", async () => {
    const user = userEvent.setup();

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: "Pengaturan Kasir" }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/ukuran kertas struk/i),
    ).toBeInTheDocument();
    // The scope, stated where somebody about to change it will read it.
    expect(
      within(dialog).getByText(/berlaku di perangkat ini saja/i),
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
      refunds: { count: 0, cashRefunds: "0.0000" },
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

    await user.click(
      await screen.findByRole("button", { name: /tutup kasir/i }),
    );
    await screen.findByLabelText(/uang di laci/i);

    expect(screen.queryByText(/kas seharusnya/i)).not.toBeInTheDocument();
  });

  it("shows the variance once a count exists", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tutup kasir/i }),
    );
    await user.type(await screen.findByLabelText(/uang di laci/i), "650000");

    expect(await screen.findByText(/kas seharusnya/i)).toBeInTheDocument();
    expect(screen.getByText(/kurang/i)).toBeInTheDocument();
  });

  it("closes the till even when the drawer is well short", async () => {
    const user = userEvent.setup();
    mockedPos.closeShift.mockResolvedValue({ ...shift, status: "closed" });

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tutup kasir/i }),
    );
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

    await user.click(
      await screen.findByRole("button", { name: /tutup kasir/i }),
    );
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

    expect(
      await screen.findByText(/belum punya akses kasir/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/muat ulang/i)).not.toBeInTheDocument();
  });

  it("still offers a reload for a server-side failure, where it may help", async () => {
    mockedPos.currentShift.mockRejectedValue(new ApiError("Server error", 500));

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

/**
 * FR-1's thumbnail.
 *
 * The grid was a wall of names before this — every tile text only. What these
 * guard is the FALLBACK, not the happy path: a shop's catalogue is always part
 * photographed, and a tile that broke on the unphotographed half would be worse
 * than no photos at all.
 */
describe("PosProductCard — the photo", () => {
  /*
    QUERIED BY TAG, NOT BY ROLE, and that is not a shortcut. `alt=""` gives an
    image the `presentation` role on purpose — the product's name is directly
    below it, and a screen reader announcing it twice is noise rather than
    access. `getByRole("img")` would therefore find nothing, which is the
    behaviour these tests want, not a reason to give the image a redundant label.
  */
  const images = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("img"));

  it("draws the 320px derivative, not the full-size original", async () => {
    const { container } = renderWithAuth(<PosScreen />);

    await screen.findByText("Royal Canin Adult 2kg");

    // A grid of eight products should not download eight originals over a
    // shop's wifi.
    expect(images(container)[0]).toHaveAttribute("src", "rc-320.jpg");
  });

  it("leaves the photo unlabelled — the name is right below it", async () => {
    const { container } = renderWithAuth(<PosScreen />);

    await screen.findByText("Royal Canin Adult 2kg");

    expect(images(container)[0]).toHaveAttribute("alt", "");
  });

  it("loads photos lazily — a grid is mostly below the fold", async () => {
    const { container } = renderWithAuth(<PosScreen />);

    await screen.findByText("Royal Canin Adult 2kg");

    expect(images(container)[0]).toHaveAttribute("loading", "lazy");
  });

  it("draws a placeholder, not a broken image, when there is no photo", async () => {
    const { container } = renderWithAuth(<PosScreen />);

    // The parent tile in the fixture has `image: null`. Exactly one <img> on the
    // page means the other tile fell back rather than rendering src="undefined".
    await screen.findByText("Kalung Anjing");

    expect(images(container)).toHaveLength(1);
  });

  it("falls through to the full-size photo when no derivative exists", async () => {
    mockedPos.catalog.mockResolvedValue({
      ...catalogPage,
      items: [
        {
          ...catalogPage.items[0],
          // Media stored before the derivatives existed carries neither.
          image: {
            url: "original.jpg",
            thumbUrl: null,
            mediumUrl: null,
            mediaType: "image",
          },
        },
      ],
    });

    const { container } = renderWithAuth(<PosScreen />);

    await screen.findByText("Royal Canin Adult 2kg");

    expect(images(container)[0]).toHaveAttribute("src", "original.jpg");
  });
});

/**
 * The search highlight.
 *
 * Now that a search looks at four fields — name, SKU, barcode and variant
 * attributes — a tile can appear for a reason nothing on it explains. The
 * highlight is what makes the visible half legible; the invisible half is a
 * known limit, recorded below.
 */
describe("PosCatalog — highlighting what matched", () => {
  const marks = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("mark")).map((el) => el.textContent);

  it("marks the matched characters in a product's name", async () => {
    const user = userEvent.setup();
    const { container } = renderWithAuth(<PosScreen />);

    await user.type(await screen.findByLabelText(/cari produk/i), "royal");

    await waitFor(() => expect(marks(container)).toContain("Royal"));
  });

  it("marks a matched SKU too — a cashier searches by either", async () => {
    const user = userEvent.setup();
    const { container } = renderWithAuth(<PosScreen />);

    await user.type(await screen.findByLabelText(/cari produk/i), "RC-ADULT");

    await waitFor(() => expect(marks(container)).toContain("RC-ADULT"));
  });

  it("marks nothing when nobody is searching", async () => {
    const { container } = renderWithAuth(<PosScreen />);

    await screen.findByText("Royal Canin Adult 2kg");

    // A grid full of yellow on an empty search would be noise.
    expect(marks(container)).toEqual([]);
  });

  it("highlights with the term the RESULTS came from, not the one being typed", async () => {
    const user = userEvent.setup();
    const { container } = renderWithAuth(<PosScreen />);

    const box = await screen.findByLabelText(/cari produk/i);
    await user.type(box, "royal");
    await waitFor(() => expect(marks(container)).toContain("Royal"));

    /*
      Typing more BEFORE the debounce settles must not re-mark the results
      already on screen: they were never matched on the longer term. Highlighting
      with the typed value would make a cashier watch highlights blink off and
      land somewhere else a moment later.
    */
    await user.type(box, "xyz");

    expect(marks(container)).toContain("Royal");
  });
});

/**
 * The barcode row.
 *
 * A search looks at four fields while a tile shows two, so a scan used to return
 * a result with nothing on it marking the match. These pin BOTH halves of the
 * rule — that it appears when it explains something, and that it stays away when
 * it does not.
 */
describe("PosProductCard — the barcode row", () => {
  const typeSearch = async (
    user: ReturnType<typeof userEvent.setup>,
    term: string,
  ) => user.type(await screen.findByLabelText(/cari produk/i), term);

  it("appears, highlighted, when the search matched the barcode", async () => {
    const user = userEvent.setup();
    const { container } = renderWithAuth(<PosScreen />);

    await typeSearch(user, "899123");

    expect(await screen.findByText(/Barcode/)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        Array.from(container.querySelectorAll("mark")).map(
          (el) => el.textContent,
        ),
      ).toContain("899123"),
    );
  });

  it("stays away when nobody is searching", async () => {
    renderWithAuth(<PosScreen />);

    await screen.findByText("Royal Canin Adult 2kg");

    // Thirteen digits of small grey text on all eight tiles, permanently, for
    // something nobody reads unless they scanned.
    expect(screen.queryByText(/Barcode/)).not.toBeInTheDocument();
  });

  it("stays away when the term is already visible in the name", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await typeSearch(user, "royal");

    // The highlight on the name has already explained the tile; a second row
    // would be noise.
    await screen.findByText("Royal Canin Adult 2kg");
    expect(screen.queryByText(/Barcode/)).not.toBeInTheDocument();
  });

  it("stays away on a tile that has no barcode at all", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await typeSearch(user, "899123");

    // The parent tile in the fixture carries none — it must not render
    // "Barcode" followed by nothing.
    await screen.findByText(/Barcode/);
    expect(screen.getAllByText(/Barcode/)).toHaveLength(1);
  });
});

/**
 * FR-1: the variant picker stays open.
 *
 * It used to close on every pick, which made the ordinary case — a customer
 * buying two DIFFERENT sizes of the same thing — four taps longer than it needed
 * to be. Left open, the picker has to answer two new questions it never had to
 * before: what did my last tap do, and how do I get out.
 */
describe("PosVariantDialog — adding more than one size", () => {
  const VARIANT_M = "5a7f1f77bcf86cd799439103";
  const VARIANT_L = "5a7f1f77bcf86cd799439104";

  beforeEach(() => {
    // The picker asks the CATALOGUE now, so its variants carry the shift's own
    // stock — see PosVariantDialog.
    mockedPos.catalog.mockImplementation(async (query) =>
      query?.parentId
        ? {
            items: [
              variantTile(VARIANT_M, "Kalung — M", "KA-M", {
                qty: "4.0000",
                state: "ok",
              }),
              variantTile(VARIANT_L, "Kalung — L", "KA-L", {
                qty: "0.0000",
                state: "out",
              }),
            ],
            pagination: { page: 1, limit: 48, total: 2, totalPages: 1 },
          }
        : catalogPage,
    );
  });

  const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      await screen.findByRole("button", {
        name: /pilih varian kalung anjing/i,
      }),
    );
    await screen.findByText("Kalung — M");
  };

  it("stays open after a variant is added", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);
    await user.click(
      screen.getByRole("button", { name: /tambah kalung — m/i }),
    );

    // The other size must still be reachable without reopening.
    expect(await screen.findByText("Kalung — L")).toBeInTheDocument();
  });

  it("says how many of each size are already in the basket", async () => {
    const user = userEvent.setup();
    mockedPos.updateCart.mockResolvedValue({
      ...cartWithItem,
      items: [
        {
          ...cartWithItem.items[0],
          refId: VARIANT_M,
          name: "Kalung — M",
          qty: "2.0000",
        },
      ],
    });

    renderWithAuth(<PosScreen />);
    await openPicker(user);
    await user.click(
      screen.getByRole("button", { name: /tambah kalung — m/i }),
    );

    /*
      With the modal closing, the basket behind it was the feedback. Left open, a
      button that can be pressed four times has to say what those presses did —
      otherwise the cashier counts in their head, which is what a till exists to
      stop.
    */
    expect(await screen.findByText("2 di keranjang")).toBeInTheDocument();
  });

  it("offers a way out, since it no longer closes itself", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);
    await user.click(screen.getByRole("button", { name: /selesai/i }));

    await waitFor(() =>
      expect(screen.queryByText("Kalung — M")).not.toBeInTheDocument(),
    );
  });

  it("refuses a second tap while the first is still in flight", async () => {
    const user = userEvent.setup();
    // A write that never settles — the state a double-tap would race.
    mockedPos.updateCart.mockReturnValue(new Promise(() => {}));

    renderWithAuth(<PosScreen />);
    await openPicker(user);

    const add = screen.getByRole("button", { name: /tambah kalung — m/i });
    await user.click(add);

    /*
      Every mutation sends the WHOLE basket, so a second tap built from a basket
      the first has not yet updated would silently undo it. The modal closing
      used to make this impossible; open, it is one tap away.
    */
    await waitFor(() => expect(add).toBeDisabled());
  });
});

/**
 * Stock per variant, in the picker.
 *
 * The picker showed none at first, on the grounds that the endpoint it called
 * did not know the shift's warehouse and a badge counting a shelf in another
 * building is worse than no badge. That reasoning was right and the conclusion
 * was wrong: it left a cashier choosing between sizes unable to see which ones
 * exist, which is the one question the modal is open to answer.
 */
describe("PosVariantDialog — stock per variant", () => {
  const VARIANT_M = "5a7f1f77bcf86cd799439103";
  const VARIANT_L = "5a7f1f77bcf86cd799439104";

  const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      await screen.findByRole("button", {
        name: /pilih varian kalung anjing/i,
      }),
    );
    await screen.findByText("Kalung — M");
  };

  beforeEach(() => {
    mockedPos.catalog.mockImplementation(async (query) =>
      query?.parentId
        ? {
            items: [
              variantTile(VARIANT_M, "Kalung — M", "KA-M", {
                qty: "4.0000",
                state: "ok",
              }),
              variantTile(VARIANT_L, "Kalung — L", "KA-L", {
                qty: "0.0000",
                state: "out",
              }),
            ],
            pagination: { page: 1, limit: 48, total: 2, totalPages: 1 },
          }
        : catalogPage,
    );
  });

  it("asks the CATALOGUE, which knows the shift's warehouse", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);

    // The products endpoint would have answered with the same variants and no
    // stock — the reason the badge was missing in the first place.
    expect(mockedPos.catalog).toHaveBeenCalledWith(
      expect.objectContaining({ parentId: PARENT_ID }),
    );
  });

  it("badges how many of each size are left", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);

    expect(screen.getByText("4 tersisa")).toBeInTheDocument();
  });

  it("says Habis, not just a colour", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);

    // ui-rules §1.3 — a badge is legible to somebody who cannot tell the tints
    // apart.
    expect(screen.getByText("Habis")).toBeInTheDocument();
  });

  it("will not let an empty size be added", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);

    // The row stays visible: a cashier looking for a size needs to see that the
    // shop stocks it and has run out, not that it does not exist.
    expect(
      screen.getByRole("button", { name: /tambah kalung — l/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /tambah kalung — m/i }),
    ).not.toBeDisabled();
  });

  it("says so when a family has more variants than fit", async () => {
    mockedPos.catalog.mockImplementation(async (query) =>
      query?.parentId
        ? {
            items: [
              variantTile(VARIANT_M, "Kalung — M", "KA-M", {
                qty: "4.0000",
                state: "ok",
              }),
            ],
            pagination: { page: 1, limit: 48, total: 50, totalPages: 2 },
          }
        : catalogPage,
    );

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", {
        name: /pilih varian kalung anjing/i,
      }),
    );

    // A silent cap reads as "that is all of them", which on a size picker means
    // telling a customer the shop does not stock their size.
    expect(await screen.findByText(/49 varian lain/)).toBeInTheDocument();
  });
});

/**
 * The toast on adding.
 *
 * The variant picker stays open, so a tap that changed only a small count on the
 * row it was tapped from was easy to miss. The confirmation lives on the SCREEN
 * rather than in the picker so adding from a tile gets the same answer — two
 * different confirmations for one act is how a cashier learns to trust neither.
 */
describe("PosScreen — confirming an add", () => {
  it("names what was added", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah royal canin/i }),
    );

    await waitFor(() =>
      expect(swalToast).toHaveBeenCalledWith(
        "Royal Canin Adult 2kg ditambahkan.",
      ),
    );
  });

  it("says nothing until the basket has actually taken it", async () => {
    const user = userEvent.setup();
    // A write that never settles — the toast must wait for the server, not fire
    // on the tap. Confirming an add that then failed would be worse than silence.
    mockedPos.updateCart.mockReturnValue(new Promise(() => {}));

    renderWithAuth(<PosScreen />);
    await user.click(
      await screen.findByRole("button", { name: /tambah royal canin/i }),
    );

    expect(swalToast).not.toHaveBeenCalled();
  });
});

/**
 * The variant row's layout.
 *
 * The first version put two green badges side by side — stock and cart count —
 * and the name truncated to make room for them. Two pills of the same colour
 * answering different questions read as one confused answer, and the part that
 * actually distinguishes the sizes was the part that got cut.
 */
describe("PosVariantDialog — reading a row", () => {
  const VARIANT_1KG = "5a7f1f77bcf86cd799439105";

  beforeEach(() => {
    mockedPos.catalog.mockImplementation(async (query) =>
      query?.parentId
        ? {
            items: [
              {
                ...variantTile(
                  VARIANT_1KG,
                  "Cat Choise Adult — 1kg / Chicken",
                  "CC-ADULT-1KG-CHICKEN",
                  { qty: "15.0000", state: "ok" },
                ),
              },
            ],
            pagination: { page: 1, limit: 48, total: 1, totalPages: 1 },
          }
        : {
            ...catalogPage,
            items: [
              {
                ...catalogPage.items[1],
                name: "Cat Choise Adult",
              },
            ],
          },
    );
  });

  const openPicker = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(
      await screen.findByRole("button", {
        name: /pilih varian cat choise adult/i,
      }),
    );
  };

  it("shows only what distinguishes the variant, not the family name again", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);

    // The modal's subtitle already says "Cat Choise Adult".
    expect(await screen.findByText("1kg / Chicken")).toBeInTheDocument();
  });

  it("still names the family in full for a screen reader", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);

    // "Tambah 1kg / Chicken" out of context says nothing about what is being
    // added — the button's label keeps the whole name even though the row shows
    // the short one.
    expect(
      await screen.findByRole("button", {
        name: "Tambah Cat Choise Adult — 1kg / Chicken",
      }),
    ).toBeInTheDocument();
  });

  it("leaves the whole name alone when it does not start with the family's", async () => {
    mockedPos.catalog.mockImplementation(async (query) =>
      query?.parentId
        ? {
            items: [
              variantTile(VARIANT_1KG, "Kemasan Ekonomis 5kg", "CC-ECO", {
                qty: "3.0000",
                state: "ok",
              }),
            ],
            pagination: { page: 1, limit: 48, total: 1, totalPages: 1 },
          }
        : {
            ...catalogPage,
            items: [{ ...catalogPage.items[1], name: "Cat Choise Adult" }],
          },
    );

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await openPicker(user);

    // A tenant may name a variant anything. Better a long row than an empty one.
    expect(await screen.findByText("Kemasan Ekonomis 5kg")).toBeInTheDocument();
  });
});

/**
 * FR-2 — who the basket belongs to.
 *
 * The picker and quick-add were built in Fase 2 and never mounted anywhere: the
 * phase notes said the POS cart panel would do it, and Fase 6 did not. These pin
 * the wiring, which is all that was missing.
 */
describe("PosScreen — choosing a customer", () => {
  it("offers the choice, and says it is optional", async () => {
    renderWithAuth(<PosScreen />);

    // Most sales at a petshop till are walk-ins, so the empty state invites
    // rather than warns.
    expect(
      await screen.findByRole("button", { name: /pilih pelanggan/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/opsional/i)).toBeInTheDocument();
  });

  it("saves the chosen customer to the basket", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /pilih pelanggan/i }),
    );
    await user.click(await screen.findByText("Ibu Rina"));

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        customerId: "cust-1",
      }),
    );
  });

  it("sends the customer ALONE, not alongside the lines", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /pilih pelanggan/i }),
    );
    await user.click(await screen.findByText("Ibu Rina"));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());

    // Nothing about the customer changes what anything costs, so there is no
    // other figure to keep in step — and sending the lines alongside would let a
    // mis-set customer disturb the prices.
    const [, patch] = mockedPos.updateCart.mock.calls[0];
    expect(patch).not.toHaveProperty("items");
  });

  it("shows the customer once the basket carries one", async () => {
    mockedPos.updateCart.mockResolvedValue({
      ...cartWithItem,
      customerId: "cust-1",
      customer: { _id: "cust-1", name: "Ibu Rina", phone: "0812-3456-7890" },
    });

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /pilih pelanggan/i }),
    );
    await user.click(await screen.findByText("Ibu Rina"));

    const basket = within(await screen.findByRole("complementary"));
    expect(await basket.findByText("0812-3456-7890")).toBeInTheDocument();
    // Two separate acts: Ganti reopens the picker, × makes it a walk-in again.
    expect(basket.getByRole("button", { name: "Ganti" })).toBeInTheDocument();
    expect(
      basket.getByRole("button", { name: /lepas ibu rina/i }),
    ).toBeInTheDocument();
  });

  it("clears the customer without touching the lines", async () => {
    mockedPos.updateCart.mockResolvedValue({
      ...cartWithItem,
      customerId: "cust-1",
      customer: { _id: "cust-1", name: "Ibu Rina", phone: "0812" },
    });

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /pilih pelanggan/i }),
    );
    await user.click(await screen.findByText("Ibu Rina"));

    const basket = within(await screen.findByRole("complementary"));
    await user.click(
      await basket.findByRole("button", { name: /lepas ibu rina/i }),
    );

    await waitFor(() => {
      const last = mockedPos.updateCart.mock.calls.at(-1);
      expect(last?.[1]).toEqual({ customerId: null });
    });
  });
});

/**
 * One telephone, one customer (FR-2, overridden 25 Aug 2026).
 *
 * The PRD said a repeated number is saved with a warning. The tenant decided a
 * number identifies a customer, so it is refused — and the form STAYS OPEN with
 * the message beside the field holding the number, because that is the one thing
 * to change and closing would throw away a name already typed.
 */
describe("PosScreen — a phone number already in use", () => {
  it("refuses, names the holder, and keeps the form", async () => {
    const user = userEvent.setup();
    const mockedCustomers = customerService as jest.Mocked<
      typeof customerService
    >;
    mockedCustomers.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    mockedCustomers.createWithWarnings.mockRejectedValue(
      new ApiError("Nomor HP sudah dipakai", 409, {
        reason: "No. HP ini sudah terdaftar atas nama Ibu Rina",
      }),
    );

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /pilih pelanggan/i }),
    );
    await user.type(
      await screen.findByLabelText(/cari pelanggan/i),
      "081234567890",
    );
    await user.click(
      await screen.findByRole("button", { name: /daftarkan pelanggan baru/i }),
    );
    await user.type(
      await screen.findByLabelText(/nama pelanggan/i),
      "Pak Budi",
    );
    await user.click(screen.getByRole("button", { name: /simpan pelanggan/i }));

    // Named, so the cashier knows whether they are about to register somebody
    // twice.
    expect(
      await screen.findByText(/sudah terdaftar atas nama Ibu Rina/),
    ).toBeInTheDocument();

    // And the name they typed is still there — retyping it with one digit
    // different is exactly what closing would have cost them.
    expect(screen.getByLabelText(/nama pelanggan/i)).toHaveValue("Pak Budi");
  });
});

/**
 * FR-6's label rule, reachable at last.
 *
 * "Label default keranjang tersimpan = nama pelanggan (bila ada) atau
 * 'Keranjang N'". It could not be met while the cart carried only an id.
 */
describe("PosHeldCartsDialog — naming a parked basket", () => {
  it("names it after the customer", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      {
        ...cartWithItem,
        heldLabel: null,
        customer: { _id: "cust-1", name: "Ibu Rina", phone: "0812-3456" },
      },
    ]);

    renderWithAuth(<PosScreen />);
    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    // "Keranjang 2" tells a cashier holding two identical baskets nothing.
    expect(dialog.getByText("Ibu Rina")).toBeInTheDocument();
    expect(dialog.getByText(/0812-3456/)).toBeInTheDocument();
  });

  it("falls back to Keranjang N for a walk-in", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      { ...cartWithItem, heldLabel: null, customer: null },
    ]);

    renderWithAuth(<PosScreen />);
    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Keranjang 1")).toBeInTheDocument();
  });

  it("lets an explicit label win — a cashier who named it meant that name", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      {
        ...cartWithItem,
        heldLabel: "Titipan sore",
        customer: { _id: "cust-1", name: "Ibu Rina", phone: "0812" },
      },
    ]);

    renderWithAuth(<PosScreen />);
    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText("Titipan sore")).toBeInTheDocument();
    expect(dialog.queryByText("Ibu Rina")).not.toBeInTheDocument();
  });
});

/**
 * A basket is not parked until somebody parks it.
 *
 * Every cart used to be born `held`, which made parking the DEFAULT rather than
 * a decision: the basket a cashier was still building appeared in Keranjang
 * Tersimpan from its first line, beside baskets somebody had genuinely put
 * aside. Simpan, meanwhile, wrote nothing — the parking had already happened.
 */
describe("PosScreen — parking is a decision, not a default", () => {
  it("Simpan actually parks it, rather than only clearing the screen", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /royal canin/i }),
    );
    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());

    mockedPos.updateCart.mockClear();
    await user.click(screen.getByRole("button", { name: /titipkan/i }));

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        status: "held",
      }),
    );
  });

  /*
    A RESUMED BASKET LEAVES THE LIST — the PRD's plain rule, restored 27 Agt.

    Un-parking was tried first, then reversed to stop a cashier stranding basket
    A by switching to B, then restored once the block below made that impossible:
    with anything on screen, no row can be opened at all.
  */
  it("takes a resumed basket out of the parked list", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      { ...cartWithItem, status: "held" },
    ]);

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );
    await user.click(await screen.findByRole("button", { name: /lanjutkan/i }));

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        status: "active",
      }),
    );
  });

  /*
    FR-6, and it follows the PRD: "melanjutkan keranjang tersimpan diblokir bila
    keranjang aktif saat ini belum kosong — kasir diminta menyimpan atau
    menyelesaikan keranjang aktif dulu."

    An earlier version parked the open basket automatically instead. It lost
    nothing either, but it did it silently — and a basket parked without the
    cashier noticing is one that can be forgotten until the till is closed.
  */
  it("refuses to open another basket while unsaved work is on screen", async () => {
    const user = userEvent.setup();
    const OTHER_ID = "5a7f1f77bcf86cd7994390e2";
    mockedPos.heldCarts.mockResolvedValue([
      { ...cartWithItem, _id: OTHER_ID, status: "held" },
    ]);

    renderWithAuth(<PosScreen />);

    // Build an unsaved basket first.
    await user.click(
      await screen.findByRole("button", { name: /royal canin/i }),
    );
    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());

    await user.click(
      screen.getByRole("button", { name: /keranjang tersimpan/i }),
    );

    expect(
      await screen.findByRole("button", { name: /lanjutkan/i }),
    ).toBeDisabled();
  });

  it("says why, rather than leaving a dead button", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      { ...cartWithItem, _id: "5a7f1f77bcf86cd7994390e2", status: "held" },
    ]);

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /royal canin/i }),
    );
    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    await user.click(
      screen.getByRole("button", { name: /keranjang tersimpan/i }),
    );

    expect(
      await screen.findByText(/titipkan atau selesaikan dulu/i),
    ).toBeInTheDocument();
  });

  /*
    FR-6: the list carries label, item count, subtotal AND when it was saved.
    The last one is what a cashier scans for — the trolley nobody has touched
    since before the last customer.

    It reads `updatedAt`, which is also what the list is sorted by: a basket
    resumed and added to at 15:40 reads as 15:40, because it is not abandoned.
  */
  it("says when each basket was last saved", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      {
        ...cartWithItem,
        status: "held",
        updatedAt: "2026-08-27T07:32:00.000Z",
      },
    ]);

    renderWithAuth(<PosScreen />);
    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );

    // Alongside the count and the subtotal, on one line.
    const row = await screen.findByText(/1 item/);
    expect(row).toHaveTextContent("Rp 100.000");
    expect(row.textContent).toMatch(/\d{2}[.:]\d{2}/);
  });

  it("moves with the basket — a resumed one reads as touched, not abandoned", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      {
        ...cartWithItem,
        status: "held",
        updatedAt: "2026-08-27T08:40:00.000Z",
      },
    ]);

    renderWithAuth(<PosScreen />);
    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );

    const row = await screen.findByText(/1 item/);
    expect(row.textContent).toContain("15.40");
  });

  it("opens one freely when the till is empty", async () => {
    const user = userEvent.setup();
    mockedPos.heldCarts.mockResolvedValue([
      { ...cartWithItem, status: "held" },
    ]);

    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /keranjang tersimpan/i }),
    );

    expect(
      screen.queryByText(/titipkan atau selesaikan dulu/i),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /lanjutkan/i }),
    ).toBeEnabled();
  });

  /*
    THE TWO RULES TOGETHER. Resuming un-parks, so the only way to reach a second
    parked basket is to put the first one back — which is exactly what the PRD
    asks the cashier to do, and what makes the un-parking safe.
  */
  it("lets the cashier switch once they have put the first one back", async () => {
    const user = userEvent.setup();
    const OTHER_ID = "5a7f1f77bcf86cd7994390e2";

    // A resumed basket: on screen, and no longer in the list.
    mockedPos.activeCart.mockResolvedValue(cartWithItem);
    mockedPos.heldCarts.mockResolvedValue([
      { ...cartWithItem, _id: OTHER_ID, status: "held" },
    ]);

    renderWithAuth(<PosScreen />);
    await screen.findByRole("button", { name: /titipkan/i });

    // Blocked while it is open…
    await user.click(
      screen.getByRole("button", { name: /keranjang tersimpan/i }),
    );
    expect(
      await screen.findByRole("button", { name: /lanjutkan/i }),
    ).toBeDisabled();

    // …and free once it is put back.
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /titipkan/i }));

    await user.click(
      screen.getByRole("button", { name: /keranjang tersimpan/i }),
    );
    expect(
      await screen.findByRole("button", { name: /lanjutkan/i }),
    ).toBeEnabled();
  });

  /*
    The cart lives on the server and the till holds only a reference, so a
    refreshed browser used to strand it — invisible in Keranjang Tersimpan, which
    now lists only what was PARKED, and the next line would open a second basket.
  */
  it("picks the basket back up after a reload", async () => {
    mockedPos.activeCart.mockResolvedValue(cartWithItem);

    renderWithAuth(<PosScreen />);

    /*
      The basket's own controls, not the product name — that appears on the
      catalogue tile too. Titipkan and Bayar exist only once a basket has
      something in it, so their presence IS the recovery.
    */
    expect(
      await screen.findByRole("button", { name: /titipkan/i }),
    ).toBeInTheDocument();
  });

  it("does not blame the cashier when there is nothing to recover", async () => {
    mockedPos.activeCart.mockResolvedValue(null);

    renderWithAuth(<PosScreen />);

    await screen.findByRole("button", { name: /pilih pelanggan/i });
    expect(screen.queryByText(/gagal/i)).not.toBeInTheDocument();
  });

  it("stays quiet when the recovery itself fails", async () => {
    mockedPos.activeCart.mockRejectedValue(new Error("offline"));

    renderWithAuth(<PosScreen />);

    // A basket that cannot be recovered is not worth a red banner on a till
    // that is otherwise working.
    await screen.findByRole("button", { name: /pilih pelanggan/i });
    expect(screen.queryByText(/gagal/i)).not.toBeInTheDocument();
  });
});

/**
 * The transaction's note (FR-5).
 *
 * The column, the 500-character limit and the receipt's own rendering all
 * existed — and there was no box to type one into anywhere on the till. The
 * third time in this module that something was built underneath and never
 * mounted above.
 */
describe("PosScreen — the transaction note", () => {
  const withNote = (note: string | null) => {
    const basket = { ...cartWithItem, note };
    mockedPos.activeCart.mockResolvedValue(basket);
    mockedPos.createCart.mockResolvedValue(basket);
    mockedPos.updateCart.mockResolvedValue(basket);
  };

  /*
    HIDDEN UNTIL ASKED FOR. Almost no sale has a note, and a textarea open on
    every basket is dead space on the one screen where vertical room is scarce.
  */
  it("offers to add one without taking up the room for it", async () => {
    withNote(null);
    renderWithAuth(<PosScreen />);

    expect(
      await screen.findByRole("button", { name: /tambah catatan/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /catatan transaksi/i }),
    ).not.toBeInTheDocument();
  });

  /*
    IT COMMITS ON BLUR, not on every keystroke. A cart write sends the whole
    basket, so a PATCH per character would be a request per character.
  */
  it("saves what was typed once the cashier moves on", async () => {
    const user = userEvent.setup();
    withNote(null);
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah catatan/i }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /catatan transaksi/i }),
      "Jangan pakai parfum",
    );

    mockedPos.updateCart.mockClear();
    await user.tab();

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        note: "Jangan pakai parfum",
      }),
    );
  });

  it("writes nothing when the note was not changed", async () => {
    const user = userEvent.setup();
    withNote(null);
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah catatan/i }),
    );
    mockedPos.updateCart.mockClear();
    await user.tab();

    expect(mockedPos.updateCart).not.toHaveBeenCalled();
  });

  /*
    Null rather than "" — an emptied field is a note that is NOT THERE, and the
    receipt tests for its presence before printing the line.
  */
  it("clears it to null rather than to an empty string", async () => {
    const user = userEvent.setup();
    withNote("Jangan pakai parfum");
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /ubah catatan/i }),
    );
    await user.clear(
      screen.getByRole("textbox", { name: /catatan transaksi/i }),
    );

    mockedPos.updateCart.mockClear();
    await user.tab();

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        note: null,
      }),
    );
  });

  it("shows a stored note without opening the editor", async () => {
    withNote("Jangan pakai parfum");
    renderWithAuth(<PosScreen />);

    expect(await screen.findByText("Jangan pakai parfum")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /catatan transaksi/i }),
    ).not.toBeInTheDocument();
  });

  /*
    Without a header this is one bare line of text between the charges and the
    subtotal. A cashier reading "testing" there has no way to know it is the
    transaction's note rather than a label somebody typed — and nothing at all
    to suggest tapping it does anything.
  */
  it("says that it IS a note, and that it can be changed", async () => {
    withNote("Jangan pakai parfum");
    renderWithAuth(<PosScreen />);

    const row = await screen.findByRole("button", { name: /ubah catatan/i });

    expect(row).toHaveTextContent("Catatan");
    expect(row).toHaveTextContent("Jangan pakai parfum");
  });

  it("abandons the edit on Escape, leaving the stored note alone", async () => {
    const user = userEvent.setup();
    withNote("Jangan pakai parfum");
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /ubah catatan/i }),
    );
    await user.type(
      screen.getByRole("textbox", { name: /catatan transaksi/i }),
      " tambahan",
    );

    mockedPos.updateCart.mockClear();
    await user.keyboard("{Escape}");

    expect(mockedPos.updateCart).not.toHaveBeenCalled();
    expect(screen.getByText("Jangan pakai parfum")).toBeInTheDocument();
  });

  /*
    THE BACKEND'S OWN CEILING, enforced by the box rather than by a refusal —
    FR-5 asks for no hard cap in the UI and a sensible one on the server, and a
    `maxLength` is the form declining to produce something the server would
    reject rather than a message after the fact.
  */
  it("cannot produce a note the server would refuse", async () => {
    const user = userEvent.setup();
    withNote(null);
    renderWithAuth(<PosScreen />);

    await user.click(
      await screen.findByRole("button", { name: /tambah catatan/i }),
    );

    expect(
      screen.getByRole("textbox", { name: /catatan transaksi/i }),
    ).toHaveAttribute("maxLength", "500");
  });
});
