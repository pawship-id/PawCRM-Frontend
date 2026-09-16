import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingNotesCard } from "@/features/booking/components/BookingNotesCard";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;

type Notes = {
  internalNotes?: string | null;
  customerNotes?: string | null;
};

/* ONE BOOKING, ONE PAIR OF NOTES — the booking is the animal on this visit. */
const booking = (notes: Notes = {}): Booking =>
  ({
    _id: "bk-1",
    petId: "pet-1",
    petName: "Mochi",
    internalNotes: null,
    customerNotes: null,
    ...notes,
  }) as Booking;

function render(notes: Notes = {}, onChanged = jest.fn()) {
  renderWithAuth(
    <BookingNotesCard booking={booking(notes)} onChanged={onChanged} />,
  );
  return onChanged;
}

beforeEach(() => {
  jest.clearAllMocks();
  bookings.setNotes.mockResolvedValue(booking() as never);
});

/**
 * THE BOOKING'S TWO NOTES, EDITED WHERE THE WORK IS.
 *
 * WHAT THESE PIN is that a note save never touches the price, and that the two
 * boxes save independently.
 */
describe("BookingNotesCard", () => {
  it("shows the stored notes, each under its own label", () => {
    render({
      internalNotes: "Pemiliknya minta jangan digundul",
      customerNotes: "Bulunya kusut, sarankan 3 minggu sekali",
    });

    expect(screen.getByLabelText(/internal/i)).toHaveValue(
      "Pemiliknya minta jangan digundul",
    );
    expect(screen.getByLabelText(/untuk pelanggan/i)).toHaveValue(
      "Bulunya kusut, sarankan 3 minggu sekali",
    );
  });

  it("fills each box independently — one being empty does not blank the other", () => {
    render({ internalNotes: "Takut hairdryer" });

    expect(screen.getByLabelText(/internal/i)).toHaveValue("Takut hairdryer");
    expect(screen.getByLabelText(/untuk pelanggan/i)).toHaveValue("");
  });

  it("saves on blur to the booking's own notes route, sending only the field that changed", async () => {
    /*
      THE OTHER BOX MAY BE HALF-TYPED. A patch carrying both would write whatever
      the screen last read over words somebody is still entering.
    */
    render();

    await userEvent.type(screen.getByLabelText(/internal/i), "Takut hairdryer");
    await userEvent.tab();

    await waitFor(() =>
      expect(bookings.setNotes).toHaveBeenCalledWith("bk-1", {
        internalNotes: "Takut hairdryer",
      }),
    );
  });

  it("never sends the whole booking — that is what would reprice the visit", async () => {
    /*
      THE FAILURE THIS GUARDS. `update` re-snapshots an unbilled service at
      today's catalogue price, so a booking taken before a price rise would
      silently bill more because somebody typed a note.
    */
    render();

    await userEvent.type(screen.getByLabelText(/internal/i), "x");
    await userEvent.tab();

    await waitFor(() => expect(bookings.setNotes).toHaveBeenCalled());
    expect(bookings.update).not.toHaveBeenCalled();
  });

  it("does not send anything when nothing was typed", async () => {
    // Tabbing through is the commonest thing that happens to this card; a
    // request per focus lost would be a request per glance.
    render({ internalNotes: "Takut hairdryer" });

    await userEvent.click(screen.getByLabelText(/internal/i));
    await userEvent.tab();

    expect(bookings.setNotes).not.toHaveBeenCalled();
  });

  it("sends an emptied box, so a note can be deleted", async () => {
    render({ internalNotes: "Takut hairdryer" });

    await userEvent.clear(screen.getByLabelText(/internal/i));
    await userEvent.tab();

    await waitFor(() =>
      expect(bookings.setNotes).toHaveBeenCalledWith("bk-1", {
        internalNotes: "",
      }),
    );
  });

  it("keeps the words on screen when the save is refused", async () => {
    /*
      A REFUSAL THAT ALSO CLEARS THE BOX makes somebody retype what they just
      typed, and the second attempt is where the sentence comes out worse.
    */
    bookings.setNotes.mockRejectedValue(
      new ApiError("Cannot change the notes on this booking", 409, {
        reason: "It is already completed, which is final",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    render();

    await userEvent.type(screen.getByLabelText(/internal/i), "Takut hairdryer");
    await userEvent.tab();

    expect(await screen.findByText(/already completed/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/internal/i)).toHaveValue("Takut hairdryer");
  });

  it("hands the updated booking up rather than guessing locally", async () => {
    const updated = booking({ internalNotes: "Takut hairdryer" });
    bookings.setNotes.mockResolvedValue(updated as never);
    const onChanged = render();

    await userEvent.type(screen.getByLabelText(/internal/i), "Takut hairdryer");
    await userEvent.tab();

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
  });

  it("says where the customer note does not go yet", () => {
    /*
      A BOX THAT LOOKS LIKE IT REACHES THE OWNER BUT DOES NOT is worse than one
      that is honest — somebody would write "sudah kami hubungi" in it and assume
      the customer had been told.
    */
    render();

    expect(screen.getByText(/belum tampil otomatis/i)).toBeInTheDocument();
    expect(screen.getByText(/tidak pernah ditampilkan/i)).toBeInTheDocument();
  });

  it("shows the notes as text, not boxes, without the grant", () => {
    // Somebody reading the page is not being stopped mid-act, and a greyed-out
    // textarea reads as broken. What is written still shows.
    renderWithAuth(
      <BookingNotesCard
        booking={booking({ internalNotes: "Takut hairdryer" })}
        onChanged={jest.fn()}
      />,
      {
        isSuperAdmin: false,
        permissions: [{ feature: "bookings", actions: ["read"] }] as never,
      },
    );

    expect(screen.getByText("Takut hairdryer")).toBeInTheDocument();
    expect(screen.queryByLabelText(/internal/i)).not.toBeInTheDocument();
  });
});
