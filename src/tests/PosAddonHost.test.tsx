import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosScreen } from "@/features/pos";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import { warehouseService } from "@/services/warehouse.service";
import { categoryService } from "@/services/category.service";
import { userService } from "@/services/user.service";
import { branchService } from "@/services/branch.service";
import { customerService } from "@/services/customer.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import { variantOptionService } from "@/services/variantOption.service";
import { zoneService } from "@/services/zone.service";
import type { PosAddonHost, PosShift, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";
import { primeVariantOptions } from "./helpers/variantOptions";

jest.mock("@/services/pos.service");
jest.mock("@/services/booking.service");
jest.mock("@/services/warehouse.service");
jest.mock("@/services/category.service");
jest.mock("@/services/user.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/customer.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");
jest.mock("@/services/variantOption.service");
jest.mock("@/services/zone.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedBookings = bookingService as jest.Mocked<typeof bookingService>;

/**
 * "TAMBAHKAN KE LAYANAN YANG MANA?" (21 October 2026).
 *
 * An add-on picked alone off the grid, once its animal is chosen, asks which of
 * that animal's unfinished groomings it goes on — in this basket, in the diary,
 * or a new booking of its own. With nothing to offer it is added as before.
 */
const SHIFT_ID = "5a7f1f77bcf86cd7994390d1";
const CART_ID = "5a7f1f77bcf86cd7994390e1";
const PET_ID = "5a7f1f77bcf86cd799439121";
const ADDON_ID = "svc-parfum";
const GROOM_ID = "svc-groom";

const shift = {
  _id: SHIFT_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftNumber: "SHF-20261021-0001",
  cashierUserId: "u1",
  openedAt: "2026-10-21T02:00:00.000Z",
  openingCash: "500000.0000",
  status: "open",
} as unknown as PosShift;

const cart = (overrides: Partial<PosTransaction> = {}): PosTransaction =>
  ({
    _id: CART_ID,
    tenantId: "t1",
    branchId: "b1",
    warehouseId: "w1",
    shiftId: SHIFT_ID,
    transactionNumber: null,
    customerId: "cust-1",
    customer: { _id: "cust-1", name: "Ibu Rina", phone: "081234567890" },
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
    status: "active",
    heldLabel: null,
    bookingIds: [],
    paidAt: null,
    createdAt: "2026-10-21T02:00:00.000Z",
    updatedAt: "2026-10-21T02:00:00.000Z",
    ...overrides,
  }) as PosTransaction;

/** The add-on tile — flat-priced, filed as an add-on. */
const PARFUM = {
  kind: "service" as const,
  _id: ADDON_ID,
  name: "Parfum",
  code: "PRF",
  barcode: null,
  batchCode: null,
  price: "25000.0000",
  categoryId: null,
  unit: null,
  variantCount: null,
  image: null,
  stock: null,
  serviceKind: null,
  serviceType: "addon" as const,
  billingUnit: "per_pet" as const,
  hasVariants: false,
  variantAxes: [],
  variants: [],
  addons: [],
};

const inCart: PosAddonHost = {
  source: "cart",
  bookingId: "bk-draft",
  bookingNumber: null,
  serviceId: GROOM_ID,
  serviceName: "Grooming Lengkap",
  status: "draft",
  scheduledAt: "2026-10-21T02:05:00.000Z",
  hasAddon: false,
};

const inDiary: PosAddonHost = {
  source: "diary",
  bookingId: "bk-diary",
  bookingNumber: "BK-261024-001",
  serviceId: GROOM_ID,
  serviceName: "Mandi Sehat",
  status: "confirmed",
  scheduledAt: "2026-10-24T03:00:00.000Z",
  hasAddon: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedPos.currentShift.mockResolvedValue(shift);
  mockedPos.xReport.mockResolvedValue({
    shift,
    transactionCount: 0,
    breakdown: [],
    refunds: { count: 0, cashRefunds: "0.0000" },
    totals: {
      takings: "0.0000",
      cashTakings: "0.0000",
      expectedCash: "500000.0000",
    },
  });
  mockedPos.heldCarts.mockResolvedValue([]);
  mockedPos.activeCart.mockResolvedValue(null);
  mockedPos.createCart.mockResolvedValue(cart());
  mockedPos.updateCart.mockResolvedValue(cart());
  mockedPos.pullBookings.mockResolvedValue(cart({ bookingIds: ["bk-diary"] }));
  mockedPos.addonHosts.mockResolvedValue([]);
  mockedPos.catalog.mockResolvedValue({
    items: [PARFUM],
    pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  mockedBookings.bridge.mockResolvedValue([]);

  const lists = [
    [categoryService, { _id: "c1", name: "Makanan" }],
    [warehouseService, { _id: "w1", name: "Gudang Utama" }],
    [branchService, { _id: "b1", name: "Toko Pusat" }],
    [userService, { _id: "u1", fullName: "Bu Rina" }],
    [customerService, { _id: "cust-1", name: "Ibu Rina", phone: "081234567890" }],
    [petService, { _id: PET_ID, name: "Bruno" }],
    [serviceService, { _id: "svc-1", name: "Grooming", price: "150000.0000" }],
  ] as const;

  lists.forEach(([service, item]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).list.mockResolvedValue({
      items: [item],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  primeVariantOptions(variantOptionService.list, zoneService.list);
});

/**
 * Customer → the Parfum tile → the animal dialog, with Bruno pre-selected. The
 * host list is drawn IN THIS DIALOG, under the price, once the animal is
 * chosen (21 October 2026) — there is no second dialog.
 */
async function openParfumForBruno(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /pilih pelanggan/i }));
  await user.click(await screen.findByText("Ibu Rina"));
  await user.click(await screen.findByRole("button", { name: /parfum/i }));

  const petDialog = within(
    (await screen.findByRole("heading", { name: /untuk hewan yang mana/i })).closest(
      "[role='dialog']",
    ) as HTMLElement,
  );
  await petDialog.findByText("Rp 25.000");
  await waitFor(() => expect(mockedPos.addonHosts).toHaveBeenCalledWith(CART_ID, PET_ID, ADDON_ID));
  mockedPos.updateCart.mockClear();
  return petDialog;
}

const add = (dialog: ReturnType<typeof within>) =>
  dialog.getByRole("button", { name: /tambah ke keranjang/i });

const hostGroup = async (dialog: ReturnType<typeof within>) =>
  within(await dialog.findByRole("radiogroup", { name: "Tempat add-on" }));

const lastItems = () => mockedPos.updateCart.mock.calls.at(-1)![1].items ?? [];

describe("an add-on picked alone at the till", () => {
  it("asks nothing when the animal has no unfinished grooming", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    expect(dialog.queryByText(/tambahkan ke layanan yang mana/i)).not.toBeInTheDocument();
    await user.click(add(dialog));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    const line = lastItems().at(-1);
    expect(line).toMatchObject({ kind: "service", refId: ADDON_ID, petId: PET_ID });
    expect(line).not.toHaveProperty("parentServiceId");
  });

  it("lists the basket's and the diary's grooming in the animal dialog, then 'Booking baru'", async () => {
    mockedPos.addonHosts.mockResolvedValue([inCart, inDiary]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    const group = await hostGroup(dialog);
    expect(dialog.getByText(/tambahkan ke layanan yang mana/i)).toBeInTheDocument();
    expect(group.getByText("Grooming Lengkap")).toBeInTheDocument();
    expect(group.getByText("Di keranjang ini")).toBeInTheDocument();
    expect(group.getByText("Mandi Sehat")).toBeInTheDocument();
    expect(group.getByText("BK-261024-001")).toBeInTheDocument();
    expect(group.getByText("Confirmed")).toBeInTheDocument();
    expect(group.getByText("Booking baru (hanya add-on ini)")).toBeInTheDocument();
    /* The grooming in the basket is pre-selected — the common case is one tap. */
    expect(group.getAllByRole("radio")).toHaveLength(3);
    expect(group.getAllByRole("radio")[0]).toHaveAttribute("aria-checked", "true");
    /* Nothing is written until the cashier presses Tambah. */
    expect(mockedPos.updateCart).not.toHaveBeenCalled();
  });

  it("still asks with a single option", async () => {
    mockedPos.addonHosts.mockResolvedValue([inCart]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    expect((await hostGroup(dialog)).getAllByRole("radio")).toHaveLength(2);
  });

  it("hangs it on the basket's grooming: parent service and booking on the line", async () => {
    mockedPos.addonHosts.mockResolvedValue([inCart, inDiary]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    await hostGroup(dialog);
    await user.click(add(dialog));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    expect(mockedPos.pullBookings).not.toHaveBeenCalled();
    expect(lastItems().at(-1)).toEqual({
      kind: "service",
      refId: ADDON_ID,
      petId: PET_ID,
      qty: "1",
      parentServiceId: GROOM_ID,
      bookingId: "bk-draft",
    });
  });

  it("pulls a diary booking and hangs the add-on on it, in one tap", async () => {
    mockedPos.addonHosts.mockResolvedValue([inCart, inDiary]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    await user.click((await hostGroup(dialog)).getByRole("radio", { name: /mandi sehat/i }));
    await user.click(add(dialog));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    expect(mockedPos.pullBookings).toHaveBeenCalledWith(CART_ID, ["bk-diary"]);
    expect(lastItems().at(-1)).toEqual({
      kind: "service",
      refId: ADDON_ID,
      petId: PET_ID,
      qty: "1",
      parentServiceId: GROOM_ID,
      bookingId: "bk-diary",
    });
    /* The pull came first, and the write was built from what it returned. */
    expect(mockedPos.pullBookings.mock.invocationCallOrder[0]).toBeLessThan(
      mockedPos.updateCart.mock.invocationCallOrder.at(-1)!,
    );
  });

  it("raises its own booking when the cashier picks 'Booking baru'", async () => {
    mockedPos.addonHosts.mockResolvedValue([inCart]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    await user.click((await hostGroup(dialog)).getByRole("radio", { name: /booking baru/i }));
    await user.click(add(dialog));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    const line = lastItems().at(-1);
    expect(line).toMatchObject({ kind: "service", refId: ADDON_ID, petId: PET_ID });
    expect(line).not.toHaveProperty("parentServiceId");
    expect(line).not.toHaveProperty("bookingId");
    expect(mockedPos.pullBookings).not.toHaveBeenCalled();
  });

  it("draws a host that already has this add-on disabled, and pre-selects the next one", async () => {
    mockedPos.addonHosts.mockResolvedValue([{ ...inCart, hasAddon: true }, inDiary]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    const group = await hostGroup(dialog);
    const [taken, diary, fresh] = group.getAllByRole("radio");
    /* Kept in the list, so the cashier sees why it is not offered. */
    expect(group.getByText("Grooming Lengkap")).toBeInTheDocument();
    expect(group.getByText("Sudah ada add-on ini")).toBeInTheDocument();
    expect(taken).toBeDisabled();
    expect(taken).toHaveAttribute("aria-checked", "false");
    expect(diary).toHaveAttribute("aria-checked", "true");
    expect(fresh).toHaveAttribute("aria-checked", "false");
  });

  it("falls back to 'Booking baru' when every host already has it", async () => {
    mockedPos.addonHosts.mockResolvedValue([{ ...inCart, hasAddon: true }]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    const group = await hostGroup(dialog);
    expect(group.getByRole("radio", { name: /grooming lengkap/i })).toBeDisabled();
    expect(group.getByRole("radio", { name: /booking baru/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await user.click(add(dialog));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    expect(lastItems().at(-1)).not.toHaveProperty("parentServiceId");
  });

  it("shows the server's refusal of a second copy in the basket's error banner", async () => {
    const message = "Add-on Parfum sudah ada di booking Bruno · Grooming Lengkap.";
    mockedPos.addonHosts.mockResolvedValue([inCart]);
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openParfumForBruno(user);

    await hostGroup(dialog);
    mockedPos.updateCart.mockRejectedValueOnce(
      new ApiError(message, 400, { details: [{ field: "items[1]", message }] }),
    );
    await user.click(add(dialog));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});
