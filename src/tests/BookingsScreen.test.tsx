import { screen, waitFor, within } from "@testing-library/react";
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
    // AFTER PCR-040 the animals are on the rows; the header lists them.
    pets: [{ petId: "pet-1", petName: "Bruno" }],
    petCount: 1,
    totalAmount: "150000.0000",
    totalDurationMin: null,
    billingState: "unbilled",
    petName: "Bruno",
    items: [
      {
        _id: "row-1",
        petId: "pet-1",
        petName: "Bruno",
        serviceId: "svc-1",
        name: "Grooming Full Service",
        price: "150000.0000",
        durationMin: null,
        notes: null,
        pulledToCartAt: null,
        pulledToInvoiceAt: null,
        groomerUserId: null,
        groomerName: "Belum ditentukan",
      },
    ],
    scheduledAt: "2026-08-26T03:00:00.000Z",
    status: "confirmed",
    origin: "booking",
    posTransactionId: null,
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
  /*
    THE GROOMER FILTER'S OPTIONS. It reads `bookings/availability` rather than
    the user register, because that endpoint rides on `bookings:read` — the same
    grant that opened this list — and a receptionist has no reason to hold
    `users:read`.
  */
  mocked.availability.mockResolvedValue([
    { _id: "user-1", fullName: "Sinta", offReason: null },
    { _id: "user-2", fullName: "Mbak Sari", offReason: null },
  ]);
  /*
    The unbilled lens asks for its own count on every load. Stubbed to "nothing
    outstanding" so these cases stay about the list rather than about the pill —
    the pill has its own describe at the foot of the file.
  */
  mocked.unbilledSummary.mockResolvedValue({
    bookingCount: 0,
    serviceCount: 0,
    total: "0.0000",
  });
});

/**
 * Until this screen existed the only way to check whether a booking had been
 * created, pulled or completed was to open the database. Every rule the till
 * enforces about bookings was invisible to the person who owns the shop.
 */
describe("BookingsScreen", () => {
  it("shows who, which animal and how much", async () => {
    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("BK-260826-001")).toBeInTheDocument();
    expect(screen.getByText("Ibu Rina")).toBeInTheDocument();
    expect(screen.getByText("Bruno")).toBeInTheDocument();
    expect(screen.getByText("Rp 150.000")).toBeInTheDocument();
  });

  it("does not list the services on the row", async () => {
    /*
      ─── WHY THE COLUMN LEFT ─────────────────────────────────────────────────

      It printed every row of the booking — name over groomer — inside one cell,
      the only cell whose height depended on the booking. A visit with three
      services made its row three times as tall and pushed the next booking off
      the fold; a day sheet showing six bookings is worth more than one showing
      two and their service lists. It also repeated "Belum ditentukan" once per
      service, which is the ordinary state of a booking taken over the phone.

      WHAT IT ANSWERED IS STILL ANSWERED: `Hewan` names the animals, `Total` sums
      exactly these rows, and "which services" is a question about ONE booking —
      answered on that booking's page, next to the prices and the sessions.
    */
    renderWithAuth(<BookingsScreen />);

    await screen.findByText("BK-260826-001");

    expect(screen.queryByText("Grooming Full Service")).not.toBeInTheDocument();
    expect(screen.queryByText("Belum ditentukan")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("columnheader", { name: /layanan/i }),
    ).not.toBeInTheDocument();
    /* The money it added up is still there — the sum is of those same rows. */
    expect(screen.getByText("Rp 150.000")).toBeInTheDocument();
  });

  /*
    A booking sitting in somebody's basket right now is neither
    confirmed-and-waiting nor sold, and the status alone cannot say so. Without
    this a cashier at the second till reads "Confirmed" and rings it up again.
  */
  it("says when a confirmed booking is already in a basket", async () => {
    mocked.list.mockResolvedValue(
      page([booking({ billingState: "billed" })]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText(/ada di keranjang/i)).toBeInTheDocument();
  });

  it("does not say so once it has been paid for", async () => {
    mocked.list.mockResolvedValue(
      page([
        booking({
          status: "completed",
          billingState: "billed",
          posTransactionId: "sale-1",
        }),
      ]),
    );

    renderWithAuth(<BookingsScreen />);

    await screen.findByText("Completed");
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
    await user.click(await screen.findByText("Completed"));

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

    expect(await screen.findByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows the number once the animal has arrived", async () => {
    mocked.list.mockResolvedValue(
      page([booking({ status: "arrived", bookingNumber: "BK-260826-001" })]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("Arrived")).toBeInTheDocument();
    expect(screen.getByText("BK-260826-001")).toBeInTheDocument();
  });

  it("can be filtered to just the drafts", async () => {
    const user = userEvent.setup();

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    await user.click(screen.getByRole("button", { name: /filter status booking/i }));
    await user.click(await screen.findByRole("option", { name: "Draft" }));

    await waitFor(() =>
      expect(
        mocked.list.mock.calls[mocked.list.mock.calls.length - 1][0]?.status,
      ).toBe("draft"),
    );
  });

  it("offers arrival as a status of its own", async () => {
    const user = userEvent.setup();

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    await user.click(screen.getByRole("button", { name: /filter status booking/i }));

    expect(
      await screen.findByRole("option", { name: "Arrived" }),
    ).toBeInTheDocument();
  });
});

/**
 * WHAT THE STATUS BADGE ALONE CANNOT SAY — and since Amandemen PCR-021/022/023
 * there are two such things rather than one.
 *
 * A paid booking used to read "Selesai", so "Confirmed" could only mean
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
      page([booking({ billingState: "billed" })]),
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
          billingState: "billed",
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

/**
 * "BELUM DITAGIH" — the lens for work the shop has forgotten to charge for.
 *
 * WHAT IT IS FOR. A grooming that was done and never billed is money simply
 * lost, and it leaves no trace: the booking looks ordinary, the day sheet looks
 * finished, and until this pill no screen said a bill was never raised.
 *
 * THE COUNT IS THE POINT. A pill that only said "Belum ditagih" would have to be
 * clicked to find out whether anything is behind it. One that carries a number
 * answers before anybody asks — which is the difference between a filter and a
 * thing that gets work done.
 */
describe("BookingsScreen — the unbilled lens", () => {
  const summary = (over = {}) => ({
    bookingCount: 3,
    serviceCount: 4,
    total: "390000.0000",
    ...over,
  });

  it("carries the count before anybody filters", async () => {
    mocked.unbilledSummary.mockResolvedValue(summary());

    renderWithAuth(<BookingsScreen />);

    /*
      `waitFor` ON THE COUNT, not `findByRole` on the pill: the pill renders
      immediately WITHOUT a number and the number arrives with the summary, so
      finding the button proves nothing about the count.
    */
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /belum ditagih/i }),
      ).toHaveTextContent("3"),
    );
  });

  /*
    THE COUNT COMES FROM THE SERVER OVER THE WHOLE BOOK, not from the page below.
    One derived from a paged list would say "1" on a page of one and change as
    somebody paged through — a number nobody could act on.
  */
  it("asks the server for it rather than counting the rows", async () => {
    mocked.unbilledSummary.mockResolvedValue(summary());

    renderWithAuth(<BookingsScreen />);

    await waitFor(() => expect(mocked.unbilledSummary).toHaveBeenCalled());
    // One row on the page, three outstanding in the book.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /belum ditagih/i }),
      ).toHaveTextContent("3"),
    );
  });

  it("filters the list when clicked", async () => {
    const user = userEvent.setup();
    mocked.unbilledSummary.mockResolvedValue(summary());

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    await user.click(screen.getByRole("button", { name: /belum ditagih/i }));

    await waitFor(() =>
      expect(
        mocked.list.mock.calls[mocked.list.mock.calls.length - 1][0]?.unbilled,
      ).toBe(true),
    );
  });

  /*
    SENT ONLY WHEN ON. `unbilled: false` is not the opposite question — the server
    does not support it — and sending it would be a filter nobody asked for.
  */
  it("sends nothing at all while the lens is off", async () => {
    mocked.unbilledSummary.mockResolvedValue(summary());

    renderWithAuth(<BookingsScreen />);

    await waitFor(() => expect(mocked.list).toHaveBeenCalled());
    expect(mocked.list.mock.calls[0][0]?.unbilled).toBeUndefined();
  });

  /*
    SAID IN MONEY, not only in rows. "3 booking" is a queue; "Rp 390.000 belum
    ditagih" is what it costs to leave it alone.
  */
  it("says what it costs, once the lens is on", async () => {
    const user = userEvent.setup();
    mocked.unbilledSummary.mockResolvedValue(summary());

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    await user.click(screen.getByRole("button", { name: /belum ditagih/i }));

    expect(await screen.findByText(/Rp 390.000/)).toBeInTheDocument();
    expect(screen.getByText(/4 layanan/)).toBeInTheDocument();
  });

  /* On the ordinary day sheet it would be a standing reproach nobody asked for. */
  it("keeps the money line off the unfiltered list", async () => {
    mocked.unbilledSummary.mockResolvedValue(summary());

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    expect(screen.queryByText(/belum ditagih dari/i)).not.toBeInTheDocument();
  });

  /*
    NOTHING OUTSTANDING IS GOOD NEWS, and "Belum ada booking" under this lens
    would read as "this shop has no bookings" — the wrong news entirely.
  */
  it("says so plainly when there is nothing left to bill", async () => {
    const user = userEvent.setup();
    mocked.unbilledSummary.mockResolvedValue(
      summary({ bookingCount: 0, serviceCount: 0, total: "0.0000" }),
    );

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    mocked.list.mockResolvedValue(page([]));
    await user.click(screen.getByRole("button", { name: /belum ditagih/i }));

    expect(
      await screen.findByText(/semua layanan sudah ditagih/i),
    ).toBeInTheDocument();
  });

  /*
    THE LIST IS WHAT THE SCREEN IS FOR. A summary that fails must not take the
    page down with it — the pill simply carries no number.
  */
  it("still draws the list when the count cannot be read", async () => {
    mocked.unbilledSummary.mockRejectedValue(new Error("offline"));

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("BK-260826-001")).toBeInTheDocument();
    const pill = await screen.findByRole("button", { name: /belum ditagih/i });
    expect(pill).not.toHaveTextContent("3");
  });

});

/**
 * FILTERING BY WHO DOES THE WORK.
 *
 * Status and origin were on this bar from the first day; the question a shop
 * actually asks — "mana bookingnya Sinta hari ini" — was not answerable at all.
 */
describe("BookingsScreen — the groomer filter", () => {
/*
    "SIAPA YANG MENGERJAKAN" — the filter a shop asks for first, and the one
    that was missing while status and origin were there from the start.

    IT IS A QUESTION ABOUT ROWS. The groomer sits on each service since PCR-040
    and a visit can be split between two people, so the server resolves it into
    booking ids rather than matching a header field.
  */
  it("filters the list by groomer", async () => {
    const user = userEvent.setup();

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    await user.click(screen.getByRole("button", { name: /filter groomer/i }));
    await user.click(await screen.findByRole("option", { name: /sinta/i }));

    await waitFor(() =>
      expect(mocked.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ groomerUserId: "user-1" }),
      ),
    );
  });

  it("sends no groomer at all for 'Semua groomer'", async () => {
    /*
      "" IS NOT A GROOMER. Sent as an empty string it would reach Joi as an
      invalid ObjectId and take the whole list down with a 400 — the same shape
      every other filter on this bar avoids by sending `undefined`.
    */
    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    expect(mocked.list.mock.calls[0][0]?.groomerUserId).toBeUndefined();
  });

  it("shows the filter disabled, with the reason, when nobody is marked", async () => {
    /*
      SHOWN AND DISABLED, NEVER HIDDEN — and it WAS hidden, which cost a bug
      report. The list reads `users.isGroomer`, so a shop that has not ticked
      anybody gets nothing back; a filter that simply is not there reads as a
      feature that does not work, with nothing on screen to say otherwise.
    */
    mocked.availability.mockResolvedValue([]);

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    const filter = screen.getByRole("button", { name: /filter groomer/i });
    expect(filter).toBeInTheDocument();
    expect(filter).toBeDisabled();
    expect(
      screen.getByText(/ditandai sebagai groomer/i),
    ).toBeInTheDocument();
  });

  it("says so when the groomer list cannot be loaded at all", async () => {
    /*
      A DIFFERENT PROBLEM FROM "nobody is marked", and saying which one points at
      the remedy. Swallowing it made the two indistinguishable.
    */
    mocked.availability.mockRejectedValue(new Error("offline"));

    renderWithAuth(<BookingsScreen />);
    await screen.findByText("BK-260826-001");

    expect(
      await screen.findByText(/tidak bisa dimuat/i),
    ).toBeInTheDocument();
  });
});

/**
 * ─── "SUDAH DIBAYAR" IS NOT ENOUGH SINCE PCR-040 ───────────────────────────
 *
 * `posTransactionId` is stamped on the header by any sale that touched the
 * booking, and a sale may cover ONE of two animals. The list read "Sudah
 * dibayar" over a visit half of which had never been charged for — the screen
 * agreeing with money the shop had lost.
 */
describe("BookingsTable — a half-paid booking", () => {
  it("says it was paid in part, not paid", async () => {
    mocked.list.mockResolvedValue(
      page([
        booking({
          posTransactionId: "sale-1",
          billingState: "partial",
          status: "confirmed",
        }),
      ]),
    );

    renderWithAuth(<BookingsScreen />);

    /*
      BOTH HALVES. How much was paid and whether the work has started are
      independent facts, and the first version folded them into one ladder — so
      a half-paid booking lost the "belum dikerjakan" that every other row
      carries, on the one row that needed explaining most.
    */
    expect(
      await screen.findByText(/sudah dibayar sebagian — belum dikerjakan/i),
    ).toBeInTheDocument();
  });

  it("drops the work half once the booking has moved on", async () => {
    // `confirmed` is the only status that means "paid, nobody has started".
    mocked.list.mockResolvedValue(
      page([
        booking({
          posTransactionId: "sale-1",
          billingState: "partial",
          status: "in_progress",
        }),
      ]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(
      await screen.findByText(/sudah dibayar sebagian/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/belum dikerjakan/i),
    ).not.toBeInTheDocument();
  });

  it("still says plainly paid when the whole visit was", async () => {
    mocked.list.mockResolvedValue(
      page([
        booking({
          posTransactionId: "sale-1",
          billingState: "billed",
          status: "confirmed",
        }),
      ]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(
      await screen.findByText(/sudah dibayar — belum dikerjakan/i),
    ).toBeInTheDocument();
  });
});

/**
 * ─── THE ACTION COLUMN READS, AND MOVES NOTHING ────────────────────────────
 *
 * The status menu used to live here — every forward rung, cancel, reschedule and
 * the trail, on every row. It was taken out on 5 September 2026.
 *
 * WHY IT MATTERS ENOUGH TO PIN: the kebab sat under the pointer at the end of
 * every row, and "Tandai selesai dikerjakan" on the wrong one fires commission
 * for the wrong visit. The ladder only runs forward — there is no undo, only a
 * cancellation and a new booking.
 */
describe("BookingsTable — a newly saved booking", () => {
  it("shows `requested` as a badge with a word on it", async () => {
    /*
      WHAT A NEW BOOKING LOOKS LIKE. Saving the form sends `requested`, and a row
      that came back with an EMPTY status cell would mean the value reached the
      list without a label to draw it with — the failure mode of adding a status
      to the API and not to `BOOKING_STATUS_LABELS`.
    */
    mocked.list.mockResolvedValue(
      page([booking({ status: "requested", bookingNumber: "BK-260905-004" })]),
    );

    renderWithAuth(<BookingsScreen />);

    expect(await screen.findByText("Requested")).toBeInTheDocument();
  });

  it("draws every status the API can send", async () => {
    /*
      THE MAP IS EXHAUSTIVE OR THE BADGE IS BLANK. TypeScript enforces this on
      `Record<BookingStatus, string>` — but only for code that compiles against
      the current type, which is exactly what a half-deployed frontend is not.
      Asserting it here makes a missing label a red test rather than an empty
      cell somebody reports as "the status is gone".
    */
    const statuses = [
      "draft",
      "requested",
      "confirmed",
      "pickup",
      "arrived",
      "in_progress",
      "completed",
      "delivery",
      "return_to_pawrents",
      "cancelled",
    ] as const;

    mocked.list.mockResolvedValue(
      page(
        statuses.map((status, index) =>
          booking({ _id: `bk-${index}`, status, bookingNumber: `BK-${index}` }),
        ),
      ),
    );

    renderWithAuth(<BookingsScreen />);

    await screen.findByText("Requested");
    for (const label of [
      "Draft",
      "Confirmed",
      "Pickup",
      "Arrived",
      "In Progress",
      "Completed",
      "Delivery",
      "Return to Pawrents",
      "Cancelled",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

describe("BookingsTable — the action column", () => {
  const openMenu = async () => {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /aksi untuk/i }));
    return screen.getByRole("menu");
  };

  it("keeps the kebab, and holds one thing in it", async () => {
    /*
      THE SHAPE OF THE COLUMN DID NOT CHANGE — every other table in this app ends
      in the same button, and a booking row ending in a bare link would be the
      one row somebody has to look at twice to find the actions on.
    */
    renderWithAuth(<BookingsScreen />);

    const menu = await openMenu();
    const link = within(menu).getByRole("menuitem", { name: /detail booking/i });

    expect(link).toHaveAttribute("href", "/dashboard/booking/bk-1");
  });

  it("offers no forward move, no cancel and no reschedule", async () => {
    /*
      MOVING A BOOKING FROM A LIST is a decision taken without looking at the
      thing being decided about — the evidence for "can this be handed over yet"
      is on the detail page and nowhere near the row. And "Tandai selesai
      dikerjakan" on the wrong row fires commission for the wrong visit, with no
      undo behind it.
    */
    renderWithAuth(<BookingsScreen />);

    const menu = await openMenu();

    expect(within(menu).getAllByRole("menuitem")).toHaveLength(1);
    expect(within(menu).queryByText(/hewan sudah datang/i)).toBeNull();
    expect(within(menu).queryByText(/tandai selesai/i)).toBeNull();
    expect(within(menu).queryByText(/cancel booking/i)).toBeNull();
    expect(within(menu).queryByText(/reschedule/i)).toBeNull();
    expect(within(menu).queryByText(/status history/i)).toBeNull();
  });
});
