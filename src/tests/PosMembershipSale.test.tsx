import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosScreen } from "@/features/pos";
import { posService } from "@/services/pos.service";
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
import { membershipService } from "@/services/membership.service";
import { ApiError } from "@/services/api-error";
import type { PosShift, PosTransaction } from "@/types/api";

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
jest.mock("@/services/membership.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedBookings = bookingService as jest.Mocked<typeof bookingService>;
const mockedMemberships = membershipService as jest.Mocked<
  typeof membershipService
>;

const SHIFT_ID = "5a7f1f77bcf86cd7994390d1";
const CART_ID = "5a7f1f77bcf86cd7994390e1";
const PET_ID = "5a7f1f77bcf86cd799439121";
const PLAN_ID = "5a7f1f77bcf86cd799439401";

/**
 * ─── SELLING A MEMBERSHIP PACKAGE AT THE TILL (Promosi V1, Fase 4) ──────────
 *
 * The package tile opens its OWN dialog (`PosMembershipSaleDialog`): whose,
 * from when, the referral code — with who may buy answered by the server's
 * `/pet-memberships/eligibility` per animal (contract §3.9). It still goes in
 * as `kind: "membership"` (the old bug: it once went in as a service), now with
 * its start date, referral code and `packageRef` (§6.2).
 *
 * And the basket: the quote's recommended pick is applied automatically, and
 * each line shows its own select (§6.3).
 */
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

const cart = (): PosTransaction =>
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
    createdAt: "2026-09-17T02:00:00.000Z",
    updatedAt: "2026-09-17T02:00:00.000Z",
  }) as PosTransaction;

const MIMI_ID = "5a7f1f77bcf86cd799439122";

/** The tile as `posCatalog.service.js` shapes a package (contract §6.1). */
const PACKAGE = {
  kind: "membership" as const,
  _id: PLAN_ID,
  name: "Paket VIP Setahun",
  code: "MSP-0001",
  barcode: null,
  batchCode: null,
  price: "1200000.0000",
  priceFrom: true,
  priceMode: "variant" as const,
  categoryId: null,
  unit: null,
  image: null,
  stock: null,
  variantCount: null,
  sellable: true,
  hasVariants: false,
  variantAxes: [],
  variants: [],
  addons: [],
  durationDays: 183,
  durationMonths: 6,
  eligibility: "all" as const,
  attachTo: "pet" as const,
  petSpecies: [],
  branchIds: [],
  benefitCount: 2,
};

/** `/eligibility` for a holder, as §3.9 answers it. */
const eligible = (over: Record<string, unknown> = {}) => ({
  ok: true,
  reasons: [],
  planId: PLAN_ID,
  attachTo: "pet",
  petId: PET_ID,
  customerId: "cust-1",
  price: "1200000.0000",
  variantKey: null,
  activeCard: null,
  suggestedStartDate: new Date().toISOString(),
  startDate: new Date().toISOString(),
  endDate: "2027-04-15T03:00:00.000Z",
  ...over,
});

let eligibilityByPet: Record<string, unknown> = {};

beforeEach(() => {
  jest.clearAllMocks();

  mockedPos.currentShift.mockResolvedValue(shift);
  mockedPos.heldCarts.mockResolvedValue([]);
  mockedPos.activeCart.mockResolvedValue(null);
  mockedPos.createCart.mockResolvedValue(cart());
  mockedPos.updateCart.mockResolvedValue(cart());
  mockedBookings.bridge.mockResolvedValue([]);

  mockedPos.catalog.mockResolvedValue({
    items: [PACKAGE],
    pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedMemberships.quote.mockResolvedValue({ cards: [], lines: [] } as any);
  mockedMemberships.listMemberships.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  eligibilityByPet = {
    [PET_ID]: eligible(),
    [MIMI_ID]: eligible({
      ok: false,
      petId: MIMI_ID,
      price: null,
      reasons: [
        { code: "species_not_allowed", field: "petId", message: "Jenis hewan ini tidak termasuk paket" },
      ],
    }),
  };
  mockedMemberships.eligibility.mockImplementation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (query: any) =>
      (query.petId ? eligibilityByPet[query.petId] : eligible({ attachTo: "customer", petId: null })) as never,
  );

  const lists = [
    [categoryService, { _id: "c1", name: "Makanan" }],
    [warehouseService, { _id: "w1", name: "Gudang Utama" }],
    [branchService, { _id: "b1", name: "Toko Pusat" }],
    [userService, { _id: "u1", fullName: "Bu Rina" }],
    [
      customerService,
      { _id: "cust-1", name: "Ibu Rina", phone: "081234567890" },
    ],
    [serviceService, { _id: "svc-1", name: "Grooming", price: "150000.0000" }],
  ] as const;

  lists.forEach(([service, item]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).list.mockResolvedValue({
      items: [item],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (petService as any).list.mockResolvedValue({
    items: [
      { _id: PET_ID, name: "Bruno", speciesLabel: "Anjing", sizeLabel: "Kecil", furTypeLabel: null },
      { _id: MIMI_ID, name: "Mimi", speciesLabel: "Kucing", sizeLabel: null, furTypeLabel: null },
    ],
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });

  primeVariantOptions(variantOptionService.list, zoneService.list);
});

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /pilih pelanggan/i }),
  );
  await user.click(await screen.findByText("Ibu Rina"));
  await user.click(
    await screen.findByRole("button", { name: /tambah paket vip setahun/i }),
  );
  await screen.findByRole("heading", { name: /jual paket: paket vip setahun/i });
  return within(screen.getByRole("dialog"));
}

const addButton = () => screen.getByRole("button", { name: /tambah ke keranjang/i });

describe("the tile", () => {
  it("says how long, from how much, and who holds it", async () => {
    renderWithAuth(<PosScreen />);

    expect(await screen.findByText("Membership · 6 bulan")).toBeInTheDocument();
    expect(screen.getByText("mulai Rp 1.200.000")).toBeInTheDocument();
    expect(screen.getByText("Semua pelanggan · melekat ke hewan")).toBeInTheDocument();
  });
});

describe("who may buy", () => {
  it("prices each animal from the server and disables the one that may not buy, with why", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openDialog(user);

    const bruno = await dialog.findByRole("radio", { name: /bruno/i });
    const mimi = await dialog.findByRole("radio", { name: /mimi/i });

    await waitFor(() => expect(bruno).toHaveTextContent("Rp 1.200.000"));
    expect(bruno).toBeEnabled();
    expect(mimi).toBeDisabled();
    expect(mimi).toHaveTextContent("Jenis hewan ini tidak termasuk paket");

    /* The one that may buy is chosen for the cashier. */
    expect(bruno).toHaveAttribute("aria-checked", "true");
  });

  it("refuses a second package for an animal already in the basket", async () => {
    mockedPos.activeCart.mockResolvedValue({
      ...cart(),
      items: [
        {
          kind: "membership",
          refId: PLAN_ID,
          name: "Paket VIP Setahun",
          qty: "1.0000",
          unitPrice: "1200000.0000",
          lineTotal: "1200000.0000",
          discount: null,
          petId: PET_ID,
          petName: "Bruno",
          packageRef: "pkg-1",
          bookingId: null,
          parentServiceId: null,
        },
      ],
    } as never);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    /* The package's own header says it was bought now. */
    expect(await screen.findByText(/\(dibeli sekarang\)/)).toBeInTheDocument();

    await user.click(
      await screen.findByRole("button", { name: /tambah paket vip setahun/i }),
    );
    const dialog = within(await screen.findByRole("dialog"));
    expect(
      await dialog.findByText("Sudah ada paket untuk Bruno di keranjang"),
    ).toBeInTheDocument();
    expect(dialog.getByRole("radio", { name: /bruno/i })).toBeDisabled();
  });
});

describe("adding it", () => {
  it("goes in as a membership line, starting when paid, with a packageRef", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openDialog(user);

    expect(await dialog.findByText("langsung bisa dipakai di transaksi ini")).toBeInTheDocument();
    expect(dialog.getByText(/aktif setelah transaksi lunas/i)).toBeInTheDocument();

    mockedPos.updateCart.mockClear();
    await waitFor(() => expect(addButton()).toBeEnabled());
    await user.click(addButton());

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        items: [
          { kind: "membership", refId: PLAN_ID, petId: PET_ID, qty: "1", packageRef: "pkg-1" },
        ],
      }),
    );
  });

  it("offers 'Setelah yang aktif berakhir' for a running card and sends the suggested start", async () => {
    eligibilityByPet[PET_ID] = eligible({
      activeCard: {
        id: "card-1",
        number: "MBR-2026-0007",
        planName: "Paket VIP Setahun",
        startDate: "2026-01-01T03:00:00.000Z",
        endDate: "2026-12-31T03:00:00.000Z",
        status: "active",
      },
      suggestedStartDate: "2027-01-01T03:00:00.000Z",
      startDate: "2027-01-01T03:00:00.000Z",
      endDate: "2027-06-30T03:00:00.000Z",
    });

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openDialog(user);

    expect(
      await dialog.findByRole("radio", { name: "Setelah yang aktif berakhir" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(dialog.getByRole("radio", { name: "Hari ini" })).toBeDisabled();
    expect(dialog.getAllByText(/membership aktif s\.d\./i).length).toBeGreaterThan(0);
    expect(dialog.getByText(/mulai dipakai/i)).toBeInTheDocument();

    mockedPos.updateCart.mockClear();
    await user.click(addButton());

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        items: [
          expect.objectContaining({
            kind: "membership",
            membershipStartDate: "2027-01-01T03:00:00.000Z",
          }),
        ],
      }),
    );
  });

  it("asks for the referral code on a referral plan, and sends it", async () => {
    mockedPos.catalog.mockResolvedValue({
      items: [{ ...PACKAGE, eligibility: "referral" }],
      pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openDialog(user);

    const code = await dialog.findByLabelText(/kode referral/i);
    expect(addButton()).toBeDisabled();

    await user.type(code, "rina-01");
    mockedPos.updateCart.mockClear();
    await user.click(addButton());

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        items: [expect.objectContaining({ referralCode: "RINA-01" })],
      }),
    );
  });

  it("shows a 409 refusal's reasons in the dialog, which stays open", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openDialog(user);

    mockedPos.updateCart.mockRejectedValueOnce(
      new ApiError("Tidak memenuhi syarat paket", 409, {
        reason: "Pelanggan sudah pernah punya membership",
        data: {
          reasons: [
            { code: "not_new_customer", field: "customerId", message: "Pelanggan sudah pernah punya membership" },
          ],
        },
      }),
    );
    await waitFor(() => expect(addButton()).toBeEnabled());
    await user.click(addButton());

    expect(
      await dialog.findByText("Pelanggan sudah pernah punya membership"),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("sells a customer-held plan to the customer, with no animal", async () => {
    mockedPos.catalog.mockResolvedValue({
      items: [{ ...PACKAGE, attachTo: "customer", priceFrom: false, priceMode: "fixed" }],
      pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    const dialog = await openDialog(user);

    expect(
      await dialog.findByText("Berlaku untuk semua hewan: Bruno, Mimi"),
    ).toBeInTheDocument();

    mockedPos.updateCart.mockClear();
    await waitFor(() => expect(addButton()).toBeEnabled());
    await user.click(addButton());

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        items: [expect.objectContaining({ kind: "membership", petId: null })],
      }),
    );
  });
});

/**
 * ─── THE BASKET: AUTO-APPLY AND THE PER-LINE SELECT (contract §6.3) ─────────
 */
describe("a member pick in the basket", () => {
  const grooming = {
    kind: "service",
    refId: "svc-1",
    name: "Grooming Lengkap",
    sku: null,
    qty: "1.0000",
    unitPrice: "150000.0000",
    lineTotal: "150000.0000",
    discount: null,
    membershipDiscount: null,
    petId: PET_ID,
    petName: "Bruno",
    bookingId: null,
    parentServiceId: null,
  };
  const candidate = {
    membershipId: "mem-1",
    membershipNumber: "MBR-0042",
    virtual: false,
    packageRef: null,
    planName: "Explorer",
    attachTo: "pet",
    benefitId: "ben-1",
    benefitLabel: "Grooming",
    optionId: "opt-1",
    optionKind: "free_item",
    kind: "quota",
    label: "Jatah Grooming 0/1",
    discount: "150000.0000",
    visitFee: "zone",
    visitFeeDiscount: "0.0000",
    used: 0,
    cap: 1,
    options: [],
  };

  it("applies the quote's recommendation without being asked", async () => {
    mockedPos.activeCart.mockResolvedValue({ ...cart(), items: [grooming] } as never);
    mockedMemberships.quote.mockResolvedValue({
      cards: [],
      lines: [{ ref: "0", petId: PET_ID, candidates: [candidate], recommended: candidate, unavailable: [] }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithAuth(<PosScreen />);

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        items: [
          expect.objectContaining({
            refId: "svc-1",
            benefit: { membershipId: "mem-1", benefitId: "ben-1", optionId: "opt-1" },
          }),
        ],
      }),
    );
  });

  it("draws the pick as a select, and Tanpa member takes it off", async () => {
    const paid = {
      ...grooming,
      membershipDiscount: "150000.0000",
      discount: {
        mode: "amount",
        value: "150000.0000",
        resolvedAmount: "150000.0000",
        approvedBy: null,
        source: "membership",
        membershipId: "mem-1",
        benefitId: "ben-1",
        optionId: "opt-1",
        benefitLabel: "Grooming",
      },
      benefit: { membershipId: "mem-1", packageRef: null, benefitId: "ben-1", optionId: "opt-1" },
    };
    mockedPos.activeCart.mockResolvedValue({ ...cart(), items: [paid] } as never);
    mockedMemberships.quote.mockResolvedValue({
      cards: [],
      lines: [
        {
          ref: "0",
          petId: PET_ID,
          candidates: [candidate],
          recommended: candidate,
          unavailable: [
            { membershipId: "mem-1", benefitId: "ben-2", benefitLabel: "Mandi", reason: "paused" },
          ],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);

    const select = await screen.findByRole("combobox", { name: /member untuk grooming lengkap/i });
    await waitFor(() => expect(select).toHaveTextContent("Jatah Grooming 0/1 −Rp 150 rb"));
    expect(screen.getByText("Member ditunda")).toBeInTheDocument();
    /* The animal's header. */
    expect(screen.getByText("Bruno")).toBeInTheDocument();

    mockedPos.updateCart.mockClear();
    await user.click(select);
    await user.click(await screen.findByRole("option", { name: "Tanpa member" }));

    await waitFor(() => expect(mockedPos.updateCart).toHaveBeenCalled());
    const sent = mockedPos.updateCart.mock.calls[0][1].items ?? [];
    expect(sent[0].benefit).toBeUndefined();
  });
});
