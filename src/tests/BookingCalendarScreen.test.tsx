import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingCalendarScreen } from "@/features/booking";
import { bookingService } from "@/services/booking.service";
import { branchService } from "@/services/branch.service";
import type { BookingCalendar, BookingCalendarEntry } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
/* The calendar filters by branch now — FR-3 kriteria 3.9. */
jest.mock("@/services/branch.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;
const branches = branchService as jest.Mocked<typeof branchService>;

const SINTA = "user-sinta";
const RIO = "user-rio";

/* Today at 10:00 in the browser's zone — which is the shop's. */
const at = (hour: number, minute = 0) => {
  const now = new Date();
  now.setHours(hour, minute, 0, 0);
  return now.toISOString();
};

const entry = (overrides: Partial<BookingCalendarEntry> = {}) =>
  ({
    _id: "row-mochi",
    bookingId: "bk-1",
    bookingNumber: "BK-260902-001",
    status: "confirmed",
    branchId: "b1",
    startAt: at(10),
    durationMin: 90,
    groomerUserId: SINTA,
    groomerName: "Sinta",
    petId: "pet-mochi",
    petName: "Mochi",
    customerName: "Bu Lisa",
    serviceName: "Full Grooming",
    notes: null,
    ...overrides,
  }) as BookingCalendarEntry;

const calendar = (overrides: Partial<BookingCalendar> = {}): BookingCalendar => ({
  from: "2026-09-02",
  to: "2026-09-02",
  groomers: [{ _id: SINTA, name: "Sinta" }],
  hasUnassigned: false,
  entries: [entry()],
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  bookings.calendar.mockResolvedValue(calendar());
  branches.list.mockResolvedValue({
    items: [{ _id: "b1", name: "Cibubur" }],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
  } as never);
});

/**
 * THE DAY SHEET, DRAWN — FR-3 / PCR-042.
 */
describe("BookingCalendarScreen", () => {
  it("puts each groomer in a column of their own", async () => {
    bookings.calendar.mockResolvedValue(
      calendar({
        groomers: [
          { _id: SINTA, name: "Sinta" },
          { _id: RIO, name: "Rio" },
        ],
      }),
    );

    renderWithAuth(<BookingCalendarScreen />);

    expect(await screen.findByText("Sinta")).toBeInTheDocument();
    expect(screen.getByText("Rio")).toBeInTheDocument();
  });

  /*
    A BLOCK IS A ROW. Bu Lisa brings Mochi and Coco; Sinta takes one and Rio the
    other, so one booking shows up in two columns at once — a shape the old
    one-booking-one-pet calendar could not draw.
  */
  it("draws one block per animal, even when they share a booking", async () => {
    bookings.calendar.mockResolvedValue(
      calendar({
        groomers: [
          { _id: SINTA, name: "Sinta" },
          { _id: RIO, name: "Rio" },
        ],
        entries: [
          entry(),
          entry({
            _id: "row-coco",
            petId: "pet-coco",
            petName: "Coco",
            groomerUserId: RIO,
            groomerName: "Rio",
          }),
        ],
      }),
    );

    renderWithAuth(<BookingCalendarScreen />);

    expect(await screen.findByText("Mochi")).toBeInTheDocument();
    expect(screen.getByText("Coco")).toBeInTheDocument();
  });

  /*
    COLOUR IS NEVER THE ONLY DIFFERENCE — for the reader who cannot separate
    these hues, and for the screen in a sunlit reception that washes them out.
  */
  it("writes the status on the block, not only in its colour", async () => {
    renderWithAuth(<BookingCalendarScreen />);

    await screen.findByText("Mochi");
    expect(screen.getAllByText(/dikonfirmasi/i).length).toBeGreaterThan(0);
  });

  /*
    A ROW NOBODY IS ASSIGNED TO is the ordinary state of a booking taken over the
    phone. Leaving it off would hide exactly the work that still needs somebody
    put on it.
  */
  it("gives unassigned work a column of its own", async () => {
    bookings.calendar.mockResolvedValue(
      calendar({
        groomers: [],
        hasUnassigned: true,
        entries: [entry({ groomerUserId: null, groomerName: null })],
      }),
    );

    renderWithAuth(<BookingCalendarScreen />);

    expect(await screen.findByText("Belum ditentukan")).toBeInTheDocument();
  });

  /*
    NULL RATHER THAN A GUESS, and the block SAYS SO. Inventing a length would put
    a number on the calendar that nobody chose.
  */
  it("says when a block has no duration rather than guessing one", async () => {
    bookings.calendar.mockResolvedValue(
      calendar({ entries: [entry({ durationMin: null })] }),
    );

    renderWithAuth(<BookingCalendarScreen />);

    expect(
      await screen.findByText(/durasi belum diisi/i),
    ).toBeInTheDocument();
  });

  it("opens the whole visit when a block is clicked", async () => {
    renderWithAuth(<BookingCalendarScreen />);

    await userEvent.click(await screen.findByText("Mochi"));

    expect(await screen.findByText(/Bu Lisa/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /tutup/i })).toBeInTheDocument();
  });

  /*
    SEVEN DAYS OF HALF-HOUR SLOTS is a grid nobody can read on a laptop. The
    weekly view answers the question it is actually asked — "which day is full" —
    in counts and hours.
  */
  it("summarises the week rather than drawing every slot", async () => {
    renderWithAuth(<BookingCalendarScreen />);

    await screen.findByText("Mochi");
    await userEvent.click(screen.getByRole("button", { name: "Mingguan" }));

    await waitFor(() =>
      expect(screen.getAllByText(/layanan ·/).length).toBeGreaterThan(0),
    );
  });

  it("moves a day at a time, and comes back to today", async () => {
    renderWithAuth(<BookingCalendarScreen />);

    await screen.findByText("Mochi");
    const [first] = bookings.calendar.mock.calls[0];
    /* The daily view asks for one day: the range collapses to a single date. */
    expect(first?.dateFrom).toBe(first?.dateTo);

    await userEvent.click(screen.getByRole("button", { name: /berikutnya/i }));

    await waitFor(() => {
      const [latest] = bookings.calendar.mock.calls.at(-1)!;
      expect(latest?.dateFrom).not.toBe(first?.dateFrom);
    });
  });

  it("says so plainly when nothing is booked", async () => {
    bookings.calendar.mockResolvedValue(
      calendar({ groomers: [], entries: [] }),
    );

    renderWithAuth(<BookingCalendarScreen />);

    expect(
      await screen.findByText(/tidak ada booking hari ini/i),
    ).toBeInTheDocument();
  });

  /*
    THE BRANCH IS A FILTER HERE — kriteria 3.9 — and it used to follow the
    session's branch silently. That is the TILL's idea of a branch: a terminal
    stands in one shop all day. A calendar is read by whoever is answering the
    phone, and an owner with two shops looking at one of them without being told
    which is worse than one extra control.
  */
  it("offers a branch filter when there is more than one", async () => {
    branches.list.mockResolvedValue({
      items: [
        { _id: "b1", name: "Cibubur" },
        { _id: "b2", name: "Bekasi" },
      ],
      pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
    } as never);

    renderWithAuth(<BookingCalendarScreen />);

    expect(
      await screen.findByRole("button", { name: /filter cabang/i }),
    ).toBeInTheDocument();
  });

  /* ONE BRANCH IS NOT A CHOICE — `soleBranch` answers it and asks nothing. */
  it("does not offer one when the shop has a single branch", async () => {
    renderWithAuth(<BookingCalendarScreen />);

    await screen.findByText("Mochi");
    expect(
      screen.queryByRole("button", { name: /filter cabang/i }),
    ).not.toBeInTheDocument();
  });

  it("scopes the fetch to the branch it was given", async () => {
    renderWithAuth(<BookingCalendarScreen />);

    await waitFor(() =>
      expect(bookings.calendar).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: "b1" }),
      ),
    );
  });

  /*
    ─── THE EMPTY COLUMN ─────────────────────────────────────────────────────

    A calendar that only shows busy people cannot answer the question a
    receptionist actually brings to it: "siapa yang bisa ambil anjing jam dua".
    The one person who can is exactly the one with no blocks.
  */
  it("draws a column for a groomer who is in but has nothing booked", async () => {
    bookings.calendar.mockResolvedValue({
      from: "2026-09-03T00:00:00.000Z",
      to: "2026-09-03T16:59:59.999Z",
      groomers: [
        { _id: "user-1", name: "Sinta", idle: false },
        { _id: "user-2", name: "Rio", idle: true },
      ],
      hasUnassigned: false,
      entries: [],
    } as never);

    renderWithAuth(<BookingCalendarScreen />);

    expect(await screen.findByText("Rio")).toBeInTheDocument();
    /*
      LABELLED, NOT A BLANK COLUMN. An empty column with no explanation reads as
      a loading failure; "kosong" says the person is here and free.
    */
    expect(screen.getByText(/kosong/i)).toBeInTheDocument();
  });

  it("does not label a busy groomer as free", async () => {
    bookings.calendar.mockResolvedValue({
      from: "2026-09-03T00:00:00.000Z",
      to: "2026-09-03T16:59:59.999Z",
      groomers: [{ _id: "user-1", name: "Sinta", idle: false }],
      hasUnassigned: false,
      entries: [],
    } as never);

    renderWithAuth(<BookingCalendarScreen />);

    await screen.findByText("Sinta");
    expect(screen.queryByText(/kosong/i)).not.toBeInTheDocument();
  });

  /*
    ─── HOW FULL SOMEBODY'S DAY IS ────────────────────────────────────────────

    LOAD, NOT CAPACITY. "Capacity" would mean announcing a limit, and nothing in
    this system knows anybody's working hours: a groomer on half days, one who
    stays late on Saturdays, one who is training somebody — each has a different
    ceiling and none is written down. A wrong ceiling is worse than none, because
    somebody starts refusing work against it.
  */
  it("says how much of each groomer's day is already booked", async () => {
    bookings.calendar.mockResolvedValue({
      from: "2026-09-03T00:00:00.000Z",
      to: "2026-09-03T16:59:59.999Z",
      groomers: [{ _id: "user-1", name: "Sinta", idle: false }],
      hasUnassigned: false,
      entries: [
        {
          _id: "it-1",
          bookingId: "bk-1",
          bookingNumber: "BK-1",
          status: "confirmed",
          startAt: "2026-09-03T02:00:00.000Z",
          durationMin: 90,
          groomerUserId: "user-1",
          groomerName: "Sinta",
          petId: "pet-1",
          petName: "Bruno",
          customerName: "Ibu Rina",
          serviceName: "Grooming Full Service",
          notes: null,
        },
        {
          _id: "it-2",
          bookingId: "bk-2",
          bookingNumber: "BK-2",
          status: "confirmed",
          startAt: "2026-09-03T05:00:00.000Z",
          durationMin: 60,
          groomerUserId: "user-1",
          groomerName: "Sinta",
          petId: "pet-2",
          petName: "Coco",
          customerName: "Pak Adi",
          serviceName: "Potong Kuku",
          notes: null,
        },
      ],
    } as never);

    renderWithAuth(<BookingCalendarScreen />);

    expect(await screen.findByText(/2j 30m terisi/)).toBeInTheDocument();
  });

  it("counts a row with no duration as one slot, not as nothing", async () => {
    /*
      The same assumption the grid DRAWS it with. Counting it as zero would make
      a day of untimed work look empty — which is the one reading that would get
      somebody double-booked.
    */
    bookings.calendar.mockResolvedValue({
      from: "2026-09-03T00:00:00.000Z",
      to: "2026-09-03T16:59:59.999Z",
      groomers: [{ _id: "user-1", name: "Sinta", idle: false }],
      hasUnassigned: false,
      entries: [
        {
          _id: "it-1",
          bookingId: "bk-1",
          bookingNumber: "BK-1",
          status: "confirmed",
          startAt: "2026-09-03T02:00:00.000Z",
          durationMin: null,
          groomerUserId: "user-1",
          groomerName: "Sinta",
          petId: "pet-1",
          petName: "Bruno",
          customerName: "Ibu Rina",
          serviceName: "Grooming Full Service",
          notes: null,
        },
      ],
    } as never);

    renderWithAuth(<BookingCalendarScreen />);

    expect(await screen.findByText(/30m terisi/)).toBeInTheDocument();
  });

  it("says 'kosong' rather than '0m terisi' for a free groomer", async () => {
    // Two ways of saying the same thing, and only one of them reads as an
    // invitation to book somebody.
    bookings.calendar.mockResolvedValue({
      from: "2026-09-03T00:00:00.000Z",
      to: "2026-09-03T16:59:59.999Z",
      groomers: [{ _id: "user-2", name: "Rio", idle: true }],
      hasUnassigned: false,
      entries: [],
    } as never);

    renderWithAuth(<BookingCalendarScreen />);

    expect(await screen.findByText(/kosong/i)).toBeInTheDocument();
    expect(screen.queryByText(/terisi/)).not.toBeInTheDocument();
  });
});