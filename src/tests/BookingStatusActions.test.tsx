import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingStatusActions } from "@/features/booking";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingStatusEvent } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mocked = bookingService as jest.Mocked<typeof bookingService>;

const BOOKING_ID = "5a7f1f77bcf86cd799439101";

const booking = (overrides: Partial<Booking> = {}) =>
  ({
    _id: BOOKING_ID,
    bookingNumber: "BK-260826-001",
    petName: "Bruno",
    status: "confirmed",
    statusHistory: [],
    ...overrides,
  }) as Booking;

const event = (overrides: Partial<BookingStatusEvent> = {}) =>
  ({
    status: "confirmed",
    at: "2026-08-26T03:00:00.000Z",
    by: "user-1",
    byName: "Mbak Sari",
    implied: false,
    ...overrides,
  }) as BookingStatusEvent;

function render(target: Booking, options = {}) {
  const onChanged = jest.fn();
  renderWithAuth(
    <BookingStatusActions booking={target} onChanged={onChanged} />,
    options,
  );
  return onChanged;
}

async function openMenu(name = "BK-260826-001") {
  await userEvent.click(screen.getByRole("button", { name: `Aksi untuk ${name}` }));
  return screen.getByRole("menu");
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.changeStatus.mockResolvedValue(booking({ status: "check_in" }));
});

/**
 * The till only ever sees the END of a booking. An animal arriving and a groomer
 * starting are facts nobody could record until this menu existed.
 */
describe("BookingStatusActions", () => {
  it("offers the moves the state machine allows, and no way back", async () => {
    render(booking({ status: "confirmed" }));

    const menu = await openMenu();

    expect(within(menu).getByRole("menuitem", { name: "Check-in" })).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Mulai dikerjakan" }),
    ).toBeInTheDocument();
    // Already confirmed — and nothing ever moves back down the ladder.
    expect(within(menu).queryByRole("menuitem", { name: "Konfirmasi" })).toBeNull();
  });

  it("offers nothing to move on a booking that is already final", async () => {
    render(booking({ status: "completed" }));

    const menu = await openMenu();

    expect(within(menu).getByRole("menuitem", { name: /riwayat/i })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /batalkan/i })).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Mulai dikerjakan" }),
    ).toBeNull();
  });

  it("moves the booking once the move is confirmed", async () => {
    const onChanged = render(booking({ status: "confirmed" }));

    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Check-in" }));

    await userEvent.click(
      screen.getByRole("button", { name: "Check-in", hidden: false }),
    );

    await waitFor(() =>
      expect(mocked.changeStatus).toHaveBeenCalledWith(BOOKING_ID, "check_in", null),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  /*
    Nobody hands over a dog for an appointment that was never agreed — the server
    records the confirmation too, so the dialog says so before the move rather
    than leaving an entry nobody chose to be discovered in the log.
  */
  it("says which rung a jump fills in behind it", async () => {
    render(booking({ status: "draft", bookingNumber: null }));

    const menu = await openMenu("booking ini");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Check-in" }));

    expect(await screen.findByText(/sekalian tercatat sebagai/i)).toBeInTheDocument();
    expect(screen.getByText("Dikonfirmasi")).toBeInTheDocument();
    expect(screen.getByText(/pada jam yang sama/i)).toBeInTheDocument();
  });

  it("says nothing about extra rungs when none are skipped", async () => {
    render(booking({ status: "check_in" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Mulai dikerjakan" }),
    );

    expect(screen.queryByText(/sekalian tercatat/i)).toBeNull();
  });

  /* Completing here says the work is done, not that anybody paid for it. */
  it("warns that finishing a booking is not the same as billing it", async () => {
    render(booking({ status: "in_progress" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Tandai selesai" }),
    );

    expect(
      await screen.findByText(/tidak mencatat pembayaran/i),
    ).toBeInTheDocument();
  });

  it("sends the cancellation reason, and omits it when there is none", async () => {
    render(booking({ status: "confirmed" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /batalkan booking/i }),
    );

    await userEvent.type(screen.getByLabelText(/alasan/i), "Pelanggan batal");
    await userEvent.click(
      screen.getByRole("button", { name: /batalkan booking/i }),
    );

    await waitFor(() =>
      expect(mocked.changeStatus).toHaveBeenCalledWith(
        BOOKING_ID,
        "cancelled",
        "Pelanggan batal",
      ),
    );
  });

  it("hides cancelling from a role that may only reschedule", async () => {
    render(booking(), {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read", "update"] }],
    });

    const menu = await openMenu();

    expect(within(menu).getByRole("menuitem", { name: "Check-in" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: /batalkan/i })).toBeNull();
  });

  /* The trail is a read: seeing the row is the only grant it needs. */
  it("still offers the history to a role that may move nothing", async () => {
    render(booking(), {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }],
    });

    const menu = await openMenu();

    expect(within(menu).getByRole("menuitem", { name: /riwayat/i })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "Check-in" })).toBeNull();
  });

  /*
    A 409 is the interesting failure — somebody else moved it first — and the
    backend puts the state it actually found in `reason`.
  */
  it("shows what the server refused, and leaves the list alone", async () => {
    mocked.changeStatus.mockRejectedValue(
      new ApiError("Cannot change this booking's status", 409, {
        reason: "Somebody else changed it first — reload and try again",
      }),
    );

    const onChanged = render(booking({ status: "confirmed" }));

    const menu = await openMenu();
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Check-in" }));
    await userEvent.click(screen.getByRole("button", { name: "Check-in" }));

    expect(await screen.findByText(/somebody else changed it first/i)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

/**
 * `status` says where a booking stands and nothing about how it got there;
 * `updatedAt` answers only the last move, because the next one overwrites it.
 */
describe("BookingStatusActions — the trail", () => {
  async function openHistory(target: Booking) {
    render(target);
    const menu = await openMenu(target.bookingNumber ?? "booking ini");
    await userEvent.click(within(menu).getByRole("menuitem", { name: /riwayat/i }));
  }

  it("lists each move with its time and who made it", async () => {
    await openHistory(
      booking({
        statusHistory: [event(), event({ status: "check_in", at: "2026-08-26T03:32:00.000Z" })],
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: /riwayat status/i });

    expect(within(dialog).getByText("Dikonfirmasi")).toBeInTheDocument();
    expect(within(dialog).getByText("Check-in")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Mbak Sari")).toHaveLength(2);
  });

  /* Two entries at the same second would otherwise claim two decisions. */
  it("marks the rung that came along with another move", async () => {
    await openHistory(
      booking({
        statusHistory: [
          event({ implied: true }),
          event({ status: "check_in", implied: false }),
        ],
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: /riwayat status/i });

    expect(within(dialog).getByText(/otomatis/i)).toBeInTheDocument();
  });

  /* Nothing human moved it — a booking settled by a paid sale. */
  it("names the mover as the system when there was no person", async () => {
    await openHistory(
      booking({
        statusHistory: [event({ by: null, byName: null, status: "completed" })],
      }),
    );

    const dialog = await screen.findByRole("dialog", { name: /riwayat status/i });

    expect(within(dialog).getByText("Sistem")).toBeInTheDocument();
  });

  /* An empty trail means "not recorded", never "never moved". */
  it("says a trail is missing rather than pretending nothing happened", async () => {
    await openHistory(booking({ statusHistory: [] }));

    expect(
      await screen.findByText(/tidak tercatat/i),
    ).toBeInTheDocument();
  });
});

/**
 * ─── THE "PROMINENT" VARIANT — the per-animal work page's header ───────────
 *
 * Same state machine, same dialog, same server call as the compact ellipsis
 * used everywhere else — only the trigger is different: a big primary button
 * for the very next rung, and a secondary "Status lain" trigger for the rest.
 * Duplicating the confirm-and-submit logic for a second look is exactly the
 * kind of drift this module has produced bugs from before.
 */
describe("BookingStatusActions — prominent variant", () => {
  function renderProminent(target: Booking, options = {}) {
    const onChanged = jest.fn();
    renderWithAuth(
      <BookingStatusActions
        booking={target}
        onChanged={onChanged}
        variant="prominent"
      />,
      options,
    );
    return onChanged;
  }

  it("shows the very next rung as a big primary button", async () => {
    /*
      `forward` IS IN LADDER ORDER, so its first entry is the one rung directly
      ahead — "Check-in" from `confirmed`, not a skip-ahead move.
    */
    renderProminent(booking({ status: "confirmed" }));

    expect(
      await screen.findByRole("button", { name: /check-in →/i }),
    ).toBeInTheDocument();
  });

  it("keeps the skip-ahead moves in Status lain, not on the primary button", async () => {
    renderProminent(booking({ status: "confirmed" }));

    await screen.findByRole("button", { name: /check-in →/i });
    await userEvent.click(
      screen.getByRole("button", { name: /status lain/i }),
    );

    const menu = screen.getByRole("menu");
    // Check-in is the primary button, not repeated in the menu.
    expect(
      within(menu).queryByRole("menuitem", { name: "Check-in" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Mulai dikerjakan" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Tandai selesai" }),
    ).toBeInTheDocument();
  });

  it("moves the booking from the primary button through the same confirm dialog", async () => {
    const onChanged = renderProminent(booking({ status: "confirmed" }));

    await userEvent.click(
      await screen.findByRole("button", { name: /check-in →/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Check-in", hidden: false }),
    );

    await waitFor(() =>
      expect(mocked.changeStatus).toHaveBeenCalledWith(
        BOOKING_ID,
        "check_in",
        null,
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("has no primary button on a booking with nowhere left to go", async () => {
    renderProminent(booking({ status: "completed" }));

    expect(
      screen.queryByRole("button", { name: /→/ }),
    ).not.toBeInTheDocument();
    // But Status lain — and the trail inside it — is still reachable.
    expect(
      screen.getByRole("button", { name: /status lain/i }),
    ).toBeInTheDocument();
  });

  it("still gates the primary button on the permission, not just the menu", async () => {
    renderProminent(booking({ status: "confirmed" }), {
      isSuperAdmin: false,
      permissions: [],
    });

    expect(
      screen.queryByRole("button", { name: /check-in →/i }),
    ).not.toBeInTheDocument();
  });
});
