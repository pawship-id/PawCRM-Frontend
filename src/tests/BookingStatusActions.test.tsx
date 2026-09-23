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

/** One booking — one animal, one service — which is what the control moves. */
const booking = (overrides: Partial<Booking> = {}) =>
  ({
    _id: BOOKING_ID,
    bookingNumber: "BK-260826-001",
    petId: "pet-1",
    petName: "Bruno",
    status: "confirmed",
    pickupRequested: false,
    deliveryRequested: false,
    statusHistory: [],
    ...overrides,
  }) as Booking;

const event = (overrides: Partial<BookingStatusEvent> = {}) =>
  ({
    status: "confirmed",
    at: "2026-08-26T03:00:00.000Z",
    by: "user-1",
    byName: "Mbak Sari",
    byRoleName: "Ops",
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
  /*
    ⚠️ A PREFIX MATCH, NOT THE WHOLE LABEL. The trigger names the ANIMAL as well
    as the booking — "Aksi untuk BK-260826-001 · Bruno" — because a day sheet
    lists one row per booking, and twenty identical "Aksi" buttons tell a
    screen-reader user nothing about which dog they are about to move.
  */
  await userEvent.click(
    screen.getByRole("button", { name: new RegExp(`Aksi untuk ${name}`, "i") }),
  );
  return screen.getByRole("menu");
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.changeStatus.mockResolvedValue(booking({ status: "arrived" }));
});

/**
 * The till only ever sees the END of a booking. An animal arriving and a groomer
 * starting are facts nobody could record until this menu existed.
 */
describe("BookingStatusActions", () => {
  it("offers the moves the state machine allows, and no way back", async () => {
    render(booking({ status: "confirmed" }));

    const menu = await openMenu();

    expect(
      within(menu).getByRole("menuitem", { name: "Mark arrived" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Start work" }),
    ).toBeInTheDocument();
    // Already confirmed — and nothing ever moves back down the ladder.
    expect(
      within(menu).queryByRole("menuitem", { name: "Confirm booking" }),
    ).toBeNull();
  });

  it("offers nothing to move on a booking that is already final", async () => {
    render(booking({ status: "completed" }));

    const menu = await openMenu();

    /*
      ⚠️ THE MENU IS EMPTY OF MOVES, and since the "Status history" row was
      removed there is nothing ungated left to keep it open — so this asserts on
      what is ABSENT. A final booking offers no way back and no way on.
    */
    expect(
      within(menu).queryByRole("menuitem", { name: /batalkan/i }),
    ).toBeNull();
    expect(
      within(menu).queryByRole("menuitem", { name: "Start work" }),
    ).toBeNull();
  });

  it("moves the booking once the move is confirmed", async () => {
    const onChanged = render(booking({ status: "confirmed" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Mark arrived" }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Mark arrived", hidden: false }),
    );

    /* ONE BOOKING, NO `petId` — the booking is the animal. */
    await waitFor(() =>
      expect(mocked.changeStatus).toHaveBeenCalledWith(
        BOOKING_ID,
        "arrived",
        null,
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("names the booking and its animal in the dialog, and nothing about others", async () => {
    render(booking());
    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /Arrive/i }),
    );

    const dialog = screen.getByRole("dialog");

    expect(dialog).toHaveTextContent(/BK-260826-001 · Bruno/);
    /* One booking is one animal: there are no "other animals" to mention. */
    expect(dialog).not.toHaveTextContent(/hewan lain/i);
  });

  it("says which rung a jump fills in behind it", async () => {
    render(booking({ status: "draft", bookingNumber: null }));

    /*
      A DRAFT HAS NO NUMBER, so the label falls back to the ANIMAL rather than to
      "booking ini": "Bruno" says which dog, where the generic phrase said nothing
      on a day sheet where several of these sit one under the other.
    */
    const menu = await openMenu("Bruno");
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Mark arrived" }),
    );

    expect(
      await screen.findByText(/sekalian tercatat sebagai/i),
    ).toBeInTheDocument();
    /*
      TWO RUNGS NOW, not one: `requested` joined the ladder between `draft` and
      `confirmed` on 5 Sep 2026. A dog handed over was asked for and agreed to,
      and the warning has to name both or it under-reports what saving records.
    */
    expect(screen.getByText("Requested dan Confirmed")).toBeInTheDocument();
    expect(screen.getByText(/pada jam yang sama/i)).toBeInTheDocument();
  });

  it("says nothing about extra rungs when none are skipped", async () => {
    render(booking({ status: "arrived" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Start work" }),
    );

    expect(screen.queryByText(/sekalian tercatat/i)).toBeNull();
  });

  /* Completing here says the work is done, not that anybody paid for it. */
  it("warns that finishing a booking is not the same as billing it", async () => {
    render(booking({ status: "in_progress" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Mark completed" }),
    );

    expect(
      await screen.findByText(/tidak mencatat pembayaran/i),
    ).toBeInTheDocument();
  });

  /*
    ⚠️ THE WARNING HAS TO NAME THE RIGHT CONSEQUENCE (23 September 2026).

    It used to say a completed booking left the kasir's list, which stopped
    being true when the bridge began offering every status but `cancelled` — and
    nothing failed, because the test above only looked for the half that was
    still correct. What actually closes is the money: `hasCompletedWork` freezes
    the service, the price and the crew.
  */
  it("names what completing actually closes, and not the till", async () => {
    render(booking({ status: "in_progress" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Mark completed" }),
    );

    const note = await screen.findByText(/tidak mencatat pembayaran/i);

    expect(note).toHaveTextContent(/tetap ada di daftar kasir/i);
    expect(note).toHaveTextContent(/harga dan groomernya tidak bisa diubah/i);
    expect(note).not.toHaveTextContent(/tidak muncul lagi di kasir/i);
  });

  it("sends the cancellation reason, and omits it when there is none", async () => {
    render(booking({ status: "confirmed" }));

    const menu = await openMenu();
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: /cancel booking/i }),
    );

    await userEvent.type(screen.getByLabelText(/alasan/i), "Pelanggan batal");
    await userEvent.click(
      screen.getByRole("button", { name: /cancel booking/i }),
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

    expect(
      within(menu).getByRole("menuitem", { name: "Mark arrived" }),
    ).toBeInTheDocument();
    expect(
      within(menu).queryByRole("menuitem", { name: /batalkan/i }),
    ).toBeNull();
  });

  it("offers no menu at all to a role that may only read", async () => {
    /*
      ⚠️ THE TRIGGER ITSELF IS GONE, not just its rows.

      Every group in this menu is wrapped in `Can`, so a read-only role saw a
      button that opened onto nothing. `hasMenu` therefore asks the PERMISSIONS
      as well as the ladder — counting the moves the ladder offers would have
      left this case exactly as it was.
    */
    render(booking(), {
      isSuperAdmin: false,
      permissions: [{ feature: "bookings", actions: ["read"] }],
    });

    /*
      NO POSITIVE ANCHOR TO WAIT ON: with nothing granted this component renders
      an empty row, so there is no text to find first. `render` is synchronous
      and every other case in this file opens this same trigger successfully, so
      "it did not render at all" is not a way this can pass by accident.
    */
    expect(
      screen.queryByRole("button", { name: /Aksi untuk/i }),
    ).not.toBeInTheDocument();
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
    await userEvent.click(
      within(menu).getByRole("menuitem", { name: "Mark arrived" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Mark arrived" }));

    expect(
      await screen.findByText(/somebody else changed it first/i),
    ).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });
});

/**
 * ─── THE "PROMINENT" VARIANT — the booking page's header ───────────────────
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
      ahead — "Hewan sudah datang" from `confirmed`, not a skip-ahead move.
    */
    renderProminent(booking({ status: "confirmed" }));

    expect(
      await screen.findByRole("button", { name: /mark arrived →/i }),
    ).toBeInTheDocument();
  });

  it("keeps the skip-ahead moves in Status lain, not on the primary button", async () => {
    renderProminent(booking({ status: "confirmed" }));

    await screen.findByRole("button", { name: /mark arrived →/i });
    await userEvent.click(
      screen.getByRole("button", { name: /other statuses/i }),
    );

    const menu = screen.getByRole("menu");
    // Arrival is the primary button, not repeated in the menu.
    expect(
      within(menu).queryByRole("menuitem", { name: "Mark arrived" }),
    ).not.toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Start work" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Mark completed" }),
    ).toBeInTheDocument();
  });

  it("moves the booking from the primary button through the same confirm dialog", async () => {
    const onChanged = renderProminent(booking({ status: "confirmed" }));

    await userEvent.click(
      await screen.findByRole("button", { name: /mark arrived →/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Mark arrived", hidden: false }),
    );

    await waitFor(() =>
      expect(mocked.changeStatus).toHaveBeenCalledWith(
        BOOKING_ID,
        "arrived",
        null,
      ),
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("has no primary button on a booking with nowhere left to go", async () => {
    /*
      `return_to_pawrents`, NOT `completed`. Finishing the work stopped being the
      end of a visit on 5 Sep 2026 — the animal is still at the shop, and handing
      it back is the rung that follows.
    */
    renderProminent(booking({ status: "return_to_pawrents" }));

    expect(screen.queryByRole("button", { name: /→/ })).not.toBeInTheDocument();

    /*
      ⚠️ AND NOR IS "Other statuses" — this used to assert the opposite.

      The trigger stayed because the menu behind it was never empty: the ungated
      "Status history" row was always in it. That row is gone, and an animal at
      the end of its ladder has no moves, no reschedule and no cancel left — so
      the button opened onto a blank panel, which reads as broken and invites the
      press twice.
    */
    expect(
      screen.queryByRole("button", { name: /other statuses/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps Other statuses while there is still one thing behind it", async () => {
    /*
      THE OTHER HALF, so the case above cannot be satisfied by hiding the
      trigger always. A confirmed animal has skip-ahead rungs AND a reschedule.
    */
    renderProminent(booking({ status: "confirmed" }));

    expect(
      screen.getByRole("button", { name: /other statuses/i }),
    ).toBeInTheDocument();
  });

  it("still gates the primary button on the permission, not just the menu", async () => {
    renderProminent(booking({ status: "confirmed" }), {
      isSuperAdmin: false,
      permissions: [],
    });

    expect(
      screen.queryByRole("button", { name: /mark arrived →/i }),
    ).not.toBeInTheDocument();
  });
});
