import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingsScreen } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import type { Booking, PageResult } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");

const mocked = bookingService as jest.Mocked<typeof bookingService>;

const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    _id: "bk-1",
    tenantId: "t1",
    branchId: "b1",
    bookingNumber: "BK-260826-001",
    customerId: "cust-1",
    customerName: "Ibu Rina",
    petId: "pet-1",
    petName: "Bruno",
    items: [
      {
        serviceId: "svc-1",
        name: "Grooming Full Service",
        price: "150000.0000",
        groomerUserId: null,
        groomerName: "Belum ditentukan",
      },
    ],
    scheduledAt: "2026-08-26T03:00:00.000Z",
    status: "confirmed",
    origin: "booking",
    posTransactionId: null,
    pulledToCartAt: null,
    notes: null,
    cancelReason: null,
    createdAt: "2026-08-26T00:00:00.000Z",
    updatedAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  }) as Booking;

const page = (items: Booking[]): PageResult<Booking> => ({
  items,
  pagination: { page: 1, limit: 20, total: items.length, totalPages: 1 },
});

beforeEach(() => {
  mocked.list.mockResolvedValue(page([booking()]));
});

/**
 * Until this screen existed the only way to check whether a booking had been
 * created, pulled or completed was to open the database. Every rule the till
 * enforces about bookings was invisible to the person who owns the shop.
 */
describe("BookingsScreen", () => {
  it("shows who, which animal, what service and how much", async () => {
    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("BK-260826-001")).toBeInTheDocument();
    expect(screen.getByText("Ibu Rina")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText("Grooming Full Service")).toBeInTheDocument();
    expect(screen.getByText("Rp 150.000")).toBeInTheDocument();
  });

  it("names an unassigned groomer rather than leaving the cell blank", async () => {
    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("Belum ditentukan")).toBeInTheDocument();
  });

  /*
    A booking sitting in somebody's basket right now is neither
    confirmed-and-waiting nor sold, and the status alone cannot say so. Without
    this a cashier at the second till reads "Dikonfirmasi" and rings it up again.
  */
  it("says when a confirmed booking is already in a basket", async () => {
    mocked.list.mockResolvedValue(
      page([booking({ pulledToCartAt: "2026-08-26T04:00:00.000Z" })]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText(/ada di keranjang/i)).toBeInTheDocument();
  });

  it("does not say so once it has been paid for", async () => {
    mocked.list.mockResolvedValue(
      page([
        booking({
          status: "completed",
          pulledToCartAt: "2026-08-26T04:00:00.000Z",
          posTransactionId: "sale-1",
        }),
      ]),
    );

    renderWithAuth(<BookingsScreen />);

    await screen.findByText("Selesai");
    expect(screen.queryByText(/ada di keranjang/i)).not.toBeInTheDocument();
  });

  /*
    Every booking made the ordinary way would otherwise carry a badge saying so,
    which is a column of noise — a badge earns its place by being the exception.
  */
  it("badges a till-made booking, and only that one", async () => {
    mocked.list.mockResolvedValue(
      page([
        booking({ _id: "bk-1", origin: "pos_adhoc" }),
        booking({ _id: "bk-2", bookingNumber: "BK-260826-002", origin: "booking" }),
      ]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findAllByText("Dari kasir")).toHaveLength(1);
  });

  /*
    The first question anybody asks this screen is "did that grooming I just
    rang up actually get recorded", and an empty list filtered to a day they
    have not thought about reads as "no".
  */
  it("asks for everything on first load, not just today", async () => {
    renderWithAuth(<BookingsScreen />);

    await waitFor(() => expect(mocked.list).toHaveBeenCalled());

    const [query] = mocked.list.mock.calls[0];
    expect(query?.scheduledFrom).toBeUndefined();
    expect(query?.status).toBeUndefined();
  });

  it("narrows by status", async () => {
    const user = userEvent.setup();
    renderWithAuth(<BookingsScreen />);

    await screen.findByText("BK-260826-001");
    await user.click(screen.getByRole("button", { name: /filter status booking/i }));
    await user.click(await screen.findByText("Selesai"));

    await waitFor(() =>
      expect(
        mocked.list.mock.calls[mocked.list.mock.calls.length - 1][0]?.status,
      ).toBe("completed"),
    );
  });

  it("narrows by where the booking came from", async () => {
    const user = userEvent.setup();
    renderWithAuth(<BookingsScreen />);

    await screen.findByText("BK-260826-001");
    await user.click(screen.getByRole("button", { name: /filter asal booking/i }));
    await user.click(await screen.findByText("Dari kasir"));

    await waitFor(() =>
      expect(
        mocked.list.mock.calls[mocked.list.mock.calls.length - 1][0]?.origin,
      ).toBe("pos_adhoc"),
    );
  });

  it("says so plainly when nothing matches", async () => {
    mocked.list.mockResolvedValue(page([]));

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText(/belum ada booking/i)).toBeInTheDocument();
  });

  it("does not blame the user when the list cannot be loaded", async () => {
    mocked.list.mockRejectedValue(new Error("offline"));

    renderWithAuth(<BookingsScreen />);

    expect(
      await screen.findByText(/tidak bisa dimuat/i),
    ).toBeInTheDocument();
  });
});
