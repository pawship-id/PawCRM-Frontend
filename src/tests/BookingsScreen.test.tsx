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

/**
 * A booking taken at the till is a real document from the moment the service
 * goes into the basket — a draft, with no number yet.
 *
 * IT EARNS ITS NUMBER BY LEAVING DRAFT, which in the ordinary case is check-in:
 * the animal is at the shop, and now there is something two people can refer to
 * across a counter.
 */
describe("BookingsScreen — drafts and the number they have not earned", () => {
  it("shows a draft with no number rather than an invented one", async () => {
    mocked.list.mockResolvedValue(
      page([booking({ status: "draft", bookingNumber: null })]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("Draf")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the number once the animal has checked in", async () => {
    mocked.list.mockResolvedValue(
      page([booking({ status: "check_in", bookingNumber: "BK-260826-001" })]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("Check-in")).toBeInTheDocument();
    expect(screen.getByText("BK-260826-001")).toBeInTheDocument();
  });

  it("can be filtered to just the drafts", async () => {
    const user = userEvent.setup();

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    await user.click(screen.getByRole("button", { name: /filter status booking/i }));
    await user.click(await screen.findByRole("option", { name: "Draf" }));

    await waitFor(() =>
      expect(
        mocked.list.mock.calls[mocked.list.mock.calls.length - 1][0]?.status,
      ).toBe("draft"),
    );
  });

  it("offers check-in as a status of its own", async () => {
    const user = userEvent.setup();

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    await user.click(screen.getByRole("button", { name: /filter status booking/i }));

    expect(
      await screen.findByRole("option", { name: "Check-in" }),
    ).toBeInTheDocument();
  });
});

/**
 * WHAT THE STATUS BADGE ALONE CANNOT SAY — and since Amandemen PCR-021/022/023
 * there are two such things rather than one.
 *
 * A paid booking used to read "Selesai", so "Dikonfirmasi" could only mean
 * waiting. Now paying leaves it CONFIRMED — paying is not being groomed — and
 * one badge covers three situations: untouched, in a basket right now, or paid
 * for and still to be done. Reading the wrong one rings a grooming up twice.
 */
describe("BookingsScreen — what the badge cannot say on its own", () => {
  beforeEach(() => {
    mocked.list.mockReset();
  });

  it("says when a confirmed booking has already been paid for", async () => {
    mocked.list.mockResolvedValue(page([booking({ posTransactionId: "sale-1" })]));

    renderWithAuth(<BookingsScreen />);

    expect(
      await screen.findByText(/sudah dibayar — belum dikerjakan/i),
    ).toBeInTheDocument();
  });

  it("says when one is sitting in a basket", async () => {
    mocked.list.mockResolvedValue(
      page([booking({ pulledToCartAt: "2026-08-26T02:00:00.000Z" })]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText(/ada di keranjang/i)).toBeInTheDocument();
  });

  /*
    BOTH ARE TRUE AT ONCE AFTER A SALE — the basket that claimed it is the one
    that paid. "Ada di keranjang" would send a cashier looking for an open basket
    that has already been settled.
  */
  it("prefers 'paid' over 'in a basket' when both are true", async () => {
    mocked.list.mockResolvedValue(
      page([
        booking({
          posTransactionId: "sale-1",
          pulledToCartAt: "2026-08-26T02:00:00.000Z",
        }),
      ]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(
      await screen.findByText(/sudah dibayar — belum dikerjakan/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ada di keranjang/i)).not.toBeInTheDocument();
  });

  /* A finished booking says so in the badge; a second line would be noise. */
  it("says neither once the work is done", async () => {
    mocked.list.mockResolvedValue(
      page([booking({ status: "completed", posTransactionId: "sale-1" })]),
    );

    renderWithAuth(<BookingsScreen />);

    await screen.findByText("BK-260826-001");
    expect(
      screen.queryByText(/sudah dibayar — belum dikerjakan/i),
    ).not.toBeInTheDocument();
  });

  it("says neither when nothing has touched it", async () => {
    mocked.list.mockResolvedValue(page([booking()]));

    renderWithAuth(<BookingsScreen />);

    await screen.findByText("BK-260826-001");
    expect(
      screen.queryByText(/sudah dibayar|ada di keranjang/i),
    ).not.toBeInTheDocument();
  });
});
