import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingPetNotesCard } from "@/features/booking/components/BookingPetNotesCard";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingPetService } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;

const PET_A = "pet-1";
const PET_B = "pet-2";

/*
  ⚠️ THE NOTES ARE THE ANIMAL'S, NOT THE SERVICE'S — PCR-042.

  They used to be written onto every ROW of that animal, and the card read them
  back from whichever row carried one. The animal has its own document now, so
  there is exactly one place to hold them and nothing left to disagree.

  A service still sits on the pet — the card renders on a page that has one — but
  it carries no notes of its own any more.
*/
const service = (over: Partial<BookingPetService> = {}) =>
  ({
    itemId: "row-1",
    serviceId: "svc-1",
    name: "Full Grooming",
    price: "150000.0000",
    addons: [],
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

type PetNotes = {
  internalNotes?: string | null;
  customerNotes?: string | null;
};

const booking = (notes: PetNotes = {}, petId = PET_A): Booking =>
  ({
    _id: "bk-1",
    pets: [
      {
        petId,
        petName: "Mochi",
        internalNotes: null,
        customerNotes: null,
        ...notes,
        services: [service()],
      },
      {
        petId: PET_B,
        petName: "Coco",
        internalNotes: "Coco galak",
        customerNotes: null,
        services: [service()],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

function render(notes: PetNotes = {}, onChanged = jest.fn()) {
  renderWithAuth(
    <BookingPetNotesCard
      booking={booking(notes)}
      petId={PET_A}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

beforeEach(() => {
  jest.clearAllMocks();
  bookings.setPetNotes.mockResolvedValue(booking() as never);
});

/**
 * ONE ANIMAL'S TWO NOTES, EDITED WHERE THE WORK IS.
 *
 * WHAT THESE PIN is that a note save never touches the price, that the two boxes
 * save independently, and that the card shows THIS animal's words.
 */
describe("BookingPetNotesCard", () => {
  it("shows the animal's stored notes, each under its own label", () => {
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

  it("shows this animal's notes and not the other's", () => {
    // The page is about one animal; Coco's note is on Coco's page.
    render();

    expect(screen.getByLabelText(/internal/i)).toHaveValue("");
    expect(screen.queryByDisplayValue("Coco galak")).not.toBeInTheDocument();
  });

  /*
    ⚠️ REWRITTEN FOR PCR-042. It read: "reads each note from whichever ROW carries
    it" — the rows of one animal held the same words by construction, and a
    booking written before the split could disagree, so the card took each half
    from whichever row had it.

    There are no rows to disagree any more. The case is kept, CHANGED rather than
    deleted, because what it protects is unchanged: the two boxes are filled
    independently, and one being empty must not blank the other.
  */
  it("fills each box independently — one being empty does not blank the other", () => {
    render({ internalNotes: "Takut hairdryer" });

    expect(screen.getByLabelText(/internal/i)).toHaveValue("Takut hairdryer");
    expect(screen.getByLabelText(/untuk pelanggan/i)).toHaveValue("");
  });

  it("saves on blur, sending only the field that changed", async () => {
    /*
      THE OTHER BOX MAY BE HALF-TYPED. A patch carrying both would write whatever
      the screen last read over words somebody is still entering.
    */
    render();

    await userEvent.type(screen.getByLabelText(/internal/i), "Takut hairdryer");
    await userEvent.tab();

    await waitFor(() =>
      expect(bookings.setPetNotes).toHaveBeenCalledWith("bk-1", PET_A, {
        internalNotes: "Takut hairdryer",
      }),
    );
  });

  it("never sends the whole booking — that is what would reprice the visit", async () => {
    /*
      THE FAILURE THIS GUARDS. `update` re-snapshots every unbilled row at
      today's catalogue price, so a booking taken before a price rise would
      silently bill more because somebody typed a note.
    */
    render();

    await userEvent.type(screen.getByLabelText(/internal/i), "x");
    await userEvent.tab();

    await waitFor(() => expect(bookings.setPetNotes).toHaveBeenCalled());
    expect(bookings.update).not.toHaveBeenCalled();
  });

  it("does not send anything when nothing was typed", async () => {
    // Tabbing through is the commonest thing that happens to this card; a
    // request per focus lost would be a request per glance.
    render({ internalNotes: "Takut hairdryer" });

    await userEvent.click(screen.getByLabelText(/internal/i));
    await userEvent.tab();

    expect(bookings.setPetNotes).not.toHaveBeenCalled();
  });

  it("sends an emptied box, so a note can be deleted", async () => {
    render({ internalNotes: "Takut hairdryer" });

    await userEvent.clear(screen.getByLabelText(/internal/i));
    await userEvent.tab();

    await waitFor(() =>
      expect(bookings.setPetNotes).toHaveBeenCalledWith("bk-1", PET_A, {
        internalNotes: "",
      }),
    );
  });

  it("keeps the words on screen when the save is refused", async () => {
    /*
      A REFUSAL THAT ALSO CLEARS THE BOX makes somebody retype what they just
      typed, and the second attempt is where the sentence comes out worse.
    */
    bookings.setPetNotes.mockRejectedValue(
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
    bookings.setPetNotes.mockResolvedValue(updated as never);
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
      <BookingPetNotesCard
        booking={booking({ internalNotes: "Takut hairdryer" })}
        petId={PET_A}
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
