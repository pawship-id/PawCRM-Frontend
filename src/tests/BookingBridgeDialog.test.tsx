import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingBridgeDialog } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { petService } from "@/services/pet.service";
import { serviceService } from "@/services/service.service";
import type { Booking } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/pet.service");
jest.mock("@/services/service.service");

const mockedBookings = bookingService as jest.Mocked<typeof bookingService>;
const mockedPets = petService as jest.Mocked<typeof petService>;
const mockedServices = serviceService as jest.Mocked<typeof serviceService>;

const CUSTOMER_ID = "5a7f1f77bcf86cd7994390c1";
const PET_ID = "5a7f1f77bcf86cd7994390d1";
const SERVICE_ID = "5a7f1f77bcf86cd7994390e1";

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  _id: "5a7f1f77bcf86cd799439101",
  tenantId: "507f1f77bcf86cd799439011",
  branchId: "5a7f1f77bcf86cd7994390b1",
  bookingNumber: "BK-260824-001",
  customerId: CUSTOMER_ID,
  petId: PET_ID,
  items: [
    {
      serviceId: SERVICE_ID,
      name: "Grooming Full Service",
      price: "150000.0000",
      groomerUserId: null,
      // Never null — the server names an unassigned slot (FR-3's edge case).
      groomerName: "Belum ditentukan",
    },
  ],
  petName: "Bruno",
  customerName: "Ibu Rina",
  scheduledAt: "2026-08-24T02:00:00.000Z",
  status: "confirmed",
  statusHistory: [],
  origin: "booking",
  posTransactionId: null,
  pulledToCartAt: null,
  notes: null,
  cancelReason: null,
  createdAt: "2026-08-24T00:00:00.000Z",
  updatedAt: "2026-08-24T00:00:00.000Z",
  ...overrides,
});

function page<T>(items: T[]) {
  return {
    items,
    pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedPets.list.mockResolvedValue(
    page([{ _id: PET_ID, name: "Bella", customerId: CUSTOMER_ID }]),
  );
  mockedServices.list.mockResolvedValue(
    page([
      { _id: SERVICE_ID, name: "Grooming Full Service", price: "150000.0000" },
    ]),
  );
});

function open(onPull = jest.fn(), onAdd = jest.fn()) {
  renderWithAuth(
    <BookingBridgeDialog
      customerId={CUSTOMER_ID}
      customerName="Ibu Rina"
      open
      onOpenChange={jest.fn()}
      onPull={onPull}
      onAdd={onAdd}
    />,
  );
  return onPull;
}

/** The ad-hoc tab's callback, which is the half these tests are about. */
function openAdhoc() {
  const onAdd = jest.fn();
  open(jest.fn(), onAdd);
  return onAdd;
}

describe("BookingBridgeDialog — both tabs are always reachable", () => {
  it("offers the ad-hoc tab even when there are bookings to pull", async () => {
    // FR-3: "Kedua tab tersedia setiap kali modal dibuka."
    mockedBookings.bridge.mockResolvedValue([booking()]);
    open();

    expect(
      await screen.findByRole("button", { name: /tambah layanan baru/i }),
    ).toBeVisible();
  });

  it("opens on the pull tab when there is something to pull", async () => {
    mockedBookings.bridge.mockResolvedValue([booking()]);
    open();

    expect(await screen.findByText("BK-260824-001")).toBeVisible();
  });

  it("opens on the ad-hoc tab when there is nothing to pull", async () => {
    // Opening on an empty list and asking somebody to notice a second tab is a
    // worse first frame than opening on the tab that can do something.
    mockedBookings.bridge.mockResolvedValue([]);
    open();

    expect(await screen.findByText(/^Layanan$/)).toBeVisible();
  });

  it("does not move a cashier off a tab they chose, when data lands late", async () => {
    /*
      The bug the derived default exists to prevent: an effect that flipped the
      tab on arrival would move somebody who had already tapped through — or, on
      a slow connection, move them mid-tick.
    */
    let resolve!: (value: Booking[]) => void;
    mockedBookings.bridge.mockReturnValue(
      new Promise<Booking[]>((r) => {
        resolve = r;
      }),
    );
    open();

    await userEvent.click(
      screen.getByRole("button", { name: /tambah layanan baru/i }),
    );
    resolve([booking()]);

    await waitFor(() => expect(mockedPets.list).toHaveBeenCalled());
    // Still on the tab the cashier picked.
    expect(
      screen.getByRole("button", { name: /tambah layanan baru/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("BookingBridgeDialog — pulling", () => {
  it("cannot be submitted with nothing ticked", async () => {
    mockedBookings.bridge.mockResolvedValue([booking()]);
    open();

    expect(
      await screen.findByRole("button", { name: /tarik ke keranjang/i }),
    ).toBeDisabled();
  });

  it("hands the ticked bookings back and writes nothing itself", async () => {
    // Marking them as pulled belongs to whatever creates the cart, inside the
    // transaction that writes it — a dialog that did it would leave bookings
    // claimed by a cart that was never built.
    const target = booking();
    mockedBookings.bridge.mockResolvedValue([target]);
    const onPull = open();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /tarik bk-260824-001/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tarik ke keranjang/i }),
    );

    expect(onPull).toHaveBeenCalledWith([target]);
    expect(mockedBookings.update).not.toHaveBeenCalled();
  });

  it("points at the other tab when the customer has no booking today", async () => {
    /*
      Reached by TAPPING BACK to the pull tab, because with nothing to pull the
      dialog opens on the ad-hoc one. The empty state is not dead code — it is
      what a cashier sees when they check whether a booking exists and it does
      not, which is the PRD's edge case ("pesan kosong yang mengarahkan ke tab
      Tambah Layanan Baru").
    */
    mockedBookings.bridge.mockResolvedValue([]);
    open();

    await userEvent.click(
      await screen.findByRole("button", { name: /tarik booking/i }),
    );

    expect(
      await screen.findByText(/tidak ada booking terkonfirmasi/i),
    ).toBeVisible();
  });
});

describe("BookingBridgeDialog — the ad-hoc tab", () => {
  beforeEach(() => {
    mockedBookings.bridge.mockResolvedValue([]);
  });

  it("needs at least one service before it can be submitted", async () => {
    // FR-3: "minimal 1 layanan tercentang sebelum tombol bisa disubmit".
    open();

    expect(
      await screen.findByRole("button", { name: /tambah ke keranjang/i }),
    ).toBeDisabled();
  });

  /*
    IT WRITES NOTHING. The booking is raised when the sale settles — FR-3's own
    words, "berstatus Completed setelah pembayaran selesai". The first version
    created it here, so a line the cashier then deleted from the basket left an
    appointment for a grooming nobody was ever charged for.
  */
  it("hands the choice back rather than creating a booking", async () => {
    const onAdd = openAdhoc();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );

    expect(onAdd).toHaveBeenCalledWith({
      petId: PET_ID,
      petName: "Bella",
      serviceIds: [SERVICE_ID],
    });
    expect(mockedBookings.create).not.toHaveBeenCalled();
  });

  it("sends no price — the server prices the line", async () => {
    const onAdd = openAdhoc();

    await userEvent.click(
      await screen.findByRole("checkbox", { name: /grooming full service/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /tambah ke keranjang/i }),
    );

    const [choice] = onAdd.mock.calls[0];
    expect(choice).not.toHaveProperty("price");
  });

  it("asks only for services still on offer", async () => {
    // The till cannot sell a retired service.
    open();

    await waitFor(() =>
      expect(mockedServices.list).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      ),
    );
  });

  it("asks only for this customer's live pets", async () => {
    open();

    await waitFor(() =>
      expect(mockedPets.list).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: CUSTOMER_ID, isActive: true }),
      ),
    );
  });

  it("pre-selects the only pet, removing a click from every walk-in", async () => {
    open();

    expect(await screen.findByRole("button", { name: "Bella" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
