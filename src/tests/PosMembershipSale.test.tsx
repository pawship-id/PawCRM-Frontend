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
 * ─── SELLING A MEMBERSHIP PACKAGE AT THE TILL ───────────────────────────────
 *
 * TWO BUGS THIS COVERS, both of which reached a real till (30 September 2026).
 *
 * 1. A PACKAGE WENT IN AS A SERVICE. The tile shares the "untuk hewan yang
 *    mana?" dialog with services — deliberately, it is the same question — but
 *    the answer went to `addServices`, which stamps `kind: "service"` on
 *    whatever it is handed. The package's id was then looked up in the SERVICE
 *    catalogue and came back "Service not found".
 *
 * 2. THE TOAST SAID IT WORKED ANYWAY, because `send` resolved on refusals.
 *
 * And the rule added on the back of them: an animal that already holds a live
 * card for the plan cannot be sold a second one HERE — a renewal is done from
 * Pelanggan › Membership, where the dates and the chain are visible.
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

/** The tile as `posCatalog.service.js` shapes a package: no stock, no variants. */
const PACKAGE = {
  kind: "membership" as const,
  _id: PLAN_ID,
  name: "Paket VIP Setahun",
  code: "GROOM-12",
  barcode: null,
  batchCode: null,
  price: "1200000.0000",
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
  durationDays: 365,
  benefitCount: 2,
};

/** A card the animal already holds, as `GET /pet-memberships` returns one. */
const liveCard = (over: Record<string, unknown> = {}) => ({
  id: "card-1",
  number: "MBR-2026-0007",
  planId: PLAN_ID,
  plan: { id: PLAN_ID, name: "Paket VIP Setahun", code: "GROOM-12" },
  petId: PET_ID,
  status: "active",
  startDate: "2026-01-01",
  endDate: "2026-12-31",
  daysLeft: 92,
  ...over,
});

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

  /* `useBenefitQuote` asks on every basket that has lines — no offers here. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedMemberships.quote.mockResolvedValue({ cards: [], lines: [] } as any);

  /* No card held, unless a test says otherwise. */
   
  mockedMemberships.listMemberships.mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const lists = [
    [categoryService, { _id: "c1", name: "Makanan" }],
    [warehouseService, { _id: "w1", name: "Gudang Utama" }],
    [branchService, { _id: "b1", name: "Toko Pusat" }],
    [userService, { _id: "u1", fullName: "Bu Rina" }],
    [
      customerService,
      { _id: "cust-1", name: "Ibu Rina", phone: "081234567890" },
    ],
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

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /pilih pelanggan/i }),
  );
  await user.click(await screen.findByText("Ibu Rina"));
  await user.click(
    await screen.findByRole("button", { name: /tambah paket vip setahun/i }),
  );
  await screen.findByRole("heading", { name: /untuk hewan yang mana/i });
}

/*
  ─── WHILE THE ANSWER IS STILL COMING ───────────────────────────────────────

  "Not found YET" and "not held" are the same absence of a card and are not the
  same fact. Treating them alike let the button go live the moment an animal was
  picked and die again when the warning landed a moment later — a button that
  invites a click it is about to refuse.
*/
describe("while the card is still being looked up", () => {
  it("keeps the button dead, and says what it is waiting for", async () => {
    let release: (value: unknown) => void = () => {};
    mockedMemberships.listMemberships.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }) as never,
    );

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    const waiting = await screen.findByRole("button", {
      name: /memeriksa membership/i,
    });
    expect(waiting).toBeDisabled();

    /* And it comes alive once the answer says the animal holds nothing. */
    release({
      items: [],
      pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
    });

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /tambah ke keranjang/i }),
      ).toBeEnabled(),
    );
  });
});

describe("a package the animal does not hold yet", () => {
  /* THE BUG: this used to go out as `kind: "service"` and earn a 400. */
  it("goes into the basket as a membership line, naming the animal", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    mockedPos.updateCart.mockClear();
    await user.click(
      await screen.findByRole("button", { name: /tambah ke keranjang/i }),
    );

    await waitFor(() =>
      expect(mockedPos.updateCart).toHaveBeenCalledWith(CART_ID, {
        items: [
          { kind: "membership", refId: PLAN_ID, petId: PET_ID, qty: "1" },
        ],
      }),
    );
  });
});

describe("a package the animal still holds", () => {
  beforeEach(() => {
     
    mockedMemberships.listMemberships.mockResolvedValue({
      items: [liveCard()],
      pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it("says until when, and where a renewal is done", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      await dialog.findByText(/masih punya membership ini sampai/i),
    ).toBeInTheDocument();
    expect(dialog.getByText("MBR-2026-0007", { exact: false })).toBeInTheDocument();
    expect(
      dialog.getByText(/pelanggan › membership/i),
    ).toBeInTheDocument();
  });

  it("will not let it be added", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /tambah ke keranjang/i }),
      ).toBeDisabled(),
    );
  });

  /*
    A SCHEDULED CARD COUNTS TOO, matching the server's `findLiveForPlan` — "not
    cancelled and not yet ended". Blocking only on `active` would let a queued
    card through here and have the payment refuse it, which is the failure this
    whole check exists to move earlier.
  */
  it("blocks on a card that has not started yet either", async () => {
     
    mockedMemberships.listMemberships.mockResolvedValue({
      items: [liveCard({ status: "scheduled", startDate: "2027-01-01" })],
      pagination: { page: 1, limit: 1, total: 1, totalPages: 1 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /tambah ke keranjang/i }),
      ).toBeDisabled(),
    );
  });

  it("asks the server for both live states, not just the active one", async () => {
    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await waitFor(() =>
      expect(mockedMemberships.listMemberships).toHaveBeenCalledWith(
        expect.objectContaining({
          petId: PET_ID,
          planId: PLAN_ID,
          status: ["active", "scheduled"],
        }),
      ),
    );
  });
});

/* A READ THAT FAILED MUST NOT BLOCK THE TILL — the server still refuses a real
   duplicate at payment, so the worst case is the behaviour before this check. */
describe("when the card lookup itself fails", () => {
  it("still lets the cashier add it", async () => {
    mockedMemberships.listMemberships.mockRejectedValue(new Error("offline"));

    const user = userEvent.setup();
    renderWithAuth(<PosScreen />);
    await openDialog(user);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /tambah ke keranjang/i }),
      ).toBeEnabled(),
    );
  });
});

/**
 * ─── THE CHIP ON A LINE A CARD PAID FOR ─────────────────────────────────────
 *
 * It named the benefit and repeated the saving — "Gratis Grooming Lengkap
 * −Rp 150.000" — which on a real basket wrapped onto three lines beside its own
 * ✕, taller than the row it belonged to. Both facts were already on that row.
 * What the chip is for is saying the discount came from a CARD.
 */
describe("a line the membership paid for", () => {
  const paidLine = {
    kind: "service",
    refId: "svc-1",
    name: "Bruno - Grooming Lengkap",
    sku: null,
    qty: "1.0000",
    unitPrice: "150000.0000",
    /* BEFORE the discount — what the server stores. The nought the row shows
       is `lineTotal` less `discount.resolvedAmount`, worked out by `netOf`. */
    lineTotal: "150000.0000",
    membershipDiscount: "150000.0000",
    discount: {
      source: "membership",
      benefitLabel: "Gratis Grooming Lengkap",
      mode: "amount",
      value: "150000.0000",
      /* What every reader actually sums — see `netOf` and `ownDiscountOf`. */
      resolvedAmount: "150000.0000",
      approvedBy: null,
      membershipId: "mem-1",
      benefitId: "ben-1",
    },
    petId: PET_ID,
    petName: "Bruno",
    bookingId: null,
    parentServiceId: null,
  };

  beforeEach(() => {
    mockedPos.activeCart.mockResolvedValue({
      ...cart(),
      items: [paidLine],
    } as never);
  });

  it("says only that a membership paid, not the benefit's whole name", async () => {
    renderWithAuth(<PosScreen />);

    expect(await screen.findByText("Benefit membership")).toBeInTheDocument();
    expect(
      screen.queryByText(/gratis grooming lengkap\s*−/i),
    ).not.toBeInTheDocument();
  });

  /* The name is not thrown away — it is the chip's tooltip, for a customer
     holding two packages. */
  it("keeps the benefit's name reachable as a tooltip", async () => {
    renderWithAuth(<PosScreen />);

    const chip = await screen.findByTitle("Gratis Grooming Lengkap");
    expect(chip).toHaveTextContent("Benefit membership");
  });

  /*
    A MARK, NOT A CONTROL (1 October 2026). Taking a benefit off happens in the
    Benefit membership section and nowhere else — two places deciding one thing
    is how they come to disagree.
  */
  it("gives the chip nothing to press", async () => {
    renderWithAuth(<PosScreen />);

    const chip = await screen.findByTitle("Gratis Grooming Lengkap");
    expect(within(chip).queryByRole("button")).not.toBeInTheDocument();
  });

  it("strikes the old price through and shows what is charged under it", async () => {
    renderWithAuth(<PosScreen />);

    /* The unit price on the left reads the same figure, so this asks whether
       ANY of them is struck — the total column is the one that is. */
    await screen.findByText("Rp 0");
    expect(
      screen
        .getAllByText("Rp 150.000")
        .some((node) => node.className.includes("line-through")),
    ).toBe(true);
  });

  /*
    THE CONTROL STAYS LIVE on a line already at nought (8 October 2026): the
    discount moved into the line dialog, which also holds the lot and the note.
  */
  it("still opens the line dialog on a line already at nought", async () => {
    renderWithAuth(<PosScreen />);

    // The discount moved into the dialog (8 October 2026), which also holds the
    // lot and the note — so the control no longer greys out on a zero line.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /ubah bruno - grooming lengkap/i }),
      ).toBeEnabled(),
    );
  });
});
