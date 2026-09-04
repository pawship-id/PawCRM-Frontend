import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingBelongingsCard } from "@/features/booking/components/BookingBelongingsCard";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking, BookingBelonging } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;

const PET_A = "pet-1";
const PET_B = "pet-2";

const belonging = (
  overrides: Partial<BookingBelonging> = {},
): BookingBelonging => ({
  _id: "bel-1",
  petId: PET_A,
  name: "Carrier biru",
  checkedInAt: null,
  checkedOutAt: null,
  checkedInBy: null,
  checkedOutBy: null,
  ...overrides,
});

const booking = (belongings: BookingBelonging[]): Booking =>
  ({ _id: "bk-1", belongings }) as Booking;

const petNames = new Map([
  [PET_A, "Mochi"],
  [PET_B, "Coco"],
]);

function render(belongings: BookingBelonging[], onChanged = jest.fn()) {
  renderWithAuth(
    <BookingBelongingsCard
      booking={booking(belongings)}
      petNames={petNames}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

beforeEach(() => {
  jest.clearAllMocks();
  bookings.checkBelonging.mockResolvedValue(booking([]) as never);
});

/**
 * Barang bawaan pawrents — checked in on arrival, checked out on the way home.
 *
 * WHAT THESE PIN is the pair of states a single "returned" checkbox cannot tell
 * apart, and the order the two ticks happen in.
 */
describe("BookingBelongingsCard", () => {
  it("renders nothing when nobody handed anything over", () => {
    // A visit where the owner brought only the dog is unchanged by this feature.
    const { container } = renderWithAuth(
      <BookingBelongingsCard
        booking={booking([])}
        petNames={petNames}
        onChanged={jest.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("groups the things under the animal that brought them", () => {
    render([
      belonging({ _id: "a", petId: PET_A, name: "Carrier biru" }),
      belonging({ _id: "b", petId: PET_B, name: "Kalung merah" }),
    ]);

    expect(screen.getByText("Mochi")).toBeInTheDocument();
    expect(screen.getByText("Coco")).toBeInTheDocument();
  });

  it("ticks one thing in, by its own id", async () => {
    // Never a save of the whole list: two counters at once would overwrite each
    // other, and the loser is an item quietly un-returned.
    render([belonging({ _id: "bel-9" })]);

    await userEvent.click(screen.getByLabelText(/carrier biru masuk/i));

    await waitFor(() =>
      expect(bookings.checkBelonging).toHaveBeenCalledWith("bk-1", "bel-9", {
        checkedIn: true,
      }),
    );
  });

  it("will not let something be handed back before it arrived", async () => {
    /*
      THE ORDER THE TWO HAPPEN IN. The server refuses it with a 409 naming the
      item; disabling the box means nobody has to read a refusal to learn the
      rule.
    */
    render([belonging()]);

    expect(screen.getByLabelText(/carrier biru keluar/i)).toBeDisabled();
    expect(screen.getByLabelText(/carrier biru masuk/i)).toBeEnabled();
  });

  it("opens the hand-back once it has arrived", async () => {
    render([belonging({ checkedInAt: "2026-09-04T01:00:00.000Z" })]);

    const out = screen.getByLabelText(/carrier biru keluar/i);
    expect(out).toBeEnabled();

    await userEvent.click(out);

    await waitFor(() =>
      expect(bookings.checkBelonging).toHaveBeenCalledWith("bk-1", "bel-1", {
        checkedOut: true,
      }),
    );
  });

  it("names what is still here, and says what it blocks", async () => {
    // "Masih ada barang" sends somebody hunting; naming the carrier tells them
    // what to look for.
    render([
      belonging({ _id: "a", name: "Carrier biru", checkedInAt: "2026-09-04T01:00:00.000Z" }),
      belonging({
        _id: "b",
        name: "Kalung merah",
        checkedInAt: "2026-09-04T01:00:00.000Z",
        checkedOutAt: "2026-09-04T06:00:00.000Z",
      }),
    ]);

    const warning = screen.getByText(/belum dikembalikan/i).closest("div");
    // The one still here is named; the one already returned is not.
    expect(warning).toHaveTextContent("Carrier biru");
    expect(warning).not.toHaveTextContent("Kalung merah");
    expect(screen.getByText(/tidak bisa diselesaikan/i)).toBeInTheDocument();
  });

  it("does not count something that never arrived as outstanding", () => {
    /*
      THE WHOLE REASON THERE ARE TWO DATES. An item written down when the booking
      was taken and never handed over has nothing to give back, and holding the
      visit open over it would teach the shop to ignore the warning.
    */
    render([belonging({ checkedInAt: null })]);

    expect(screen.queryByText(/belum dikembalikan/i)).not.toBeInTheDocument();
    expect(screen.getByText(/tidak ada barang yang tertinggal/i)).toBeInTheDocument();
  });

  it("hands the updated booking up rather than guessing locally", async () => {
    // The row reflects the server: nothing is ticked optimistically and
    // reconciled afterwards.
    const updated = booking([belonging({ checkedInAt: "2026-09-04T01:00:00.000Z" })]);
    bookings.checkBelonging.mockResolvedValue(updated as never);
    const onChanged = render([belonging()]);

    await userEvent.click(screen.getByLabelText(/carrier biru masuk/i));

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(updated));
  });

  it("shows the server's refusal and leaves the box alone", async () => {
    bookings.checkBelonging.mockRejectedValue(
      new ApiError("Barang ini belum ditandai masuk", 409, {
        reason: "Carrier biru belum dicentang masuk",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    render([belonging({ checkedInAt: "2026-09-04T01:00:00.000Z" })]);

    await userEvent.click(screen.getByLabelText(/carrier biru keluar/i));

    /*
      The card already carries the outstanding-items warning, so the refusal is
      asked for by its own words rather than by role.
    */
    expect(
      await screen.findByText(/belum dicentang masuk/i),
    ).toBeInTheDocument();
    // Unchanged: the tick follows the server, and the server said no.
    expect(screen.getByLabelText(/carrier biru keluar/i)).not.toBeChecked();
  });
});
