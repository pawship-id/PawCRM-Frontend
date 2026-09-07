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

function render(belongings: BookingBelonging[], onChanged = jest.fn()) {
  renderWithAuth(
    <BookingBelongingsCard
      booking={booking(belongings)}
      petId={PET_A}
      petName="Mochi"
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

beforeEach(() => {
  jest.clearAllMocks();
  bookings.checkBelonging.mockResolvedValue(booking([]) as never);
  bookings.addBelonging.mockResolvedValue(booking([]) as never);
});

/**
 * Titipan owner — checked in on arrival, checked out on the way home.
 *
 * WHAT THESE PIN is the pair of states a single "returned" checkbox cannot tell
 * apart, the order the two ticks happen in, and — since the card moved off the
 * booking overview onto one animal's page — that it shows ONE animal's things.
 */
describe("BookingBelongingsCard", () => {
  it("shows only the animal whose page this is", () => {
    /*
      THE REASON IT MOVED. It used to be one card on the booking overview,
      grouped by animal, so handing Mochi's collar back meant scrolling past
      Coco's. This page is about one animal; the other's things are not on it.
    */
    render([
      belonging({ _id: "a", petId: PET_A, name: "Carrier biru" }),
      belonging({ _id: "b", petId: PET_B, name: "Kalung merah" }),
    ]);

    expect(screen.getByText("Carrier biru")).toBeInTheDocument();
    expect(screen.queryByText("Kalung merah")).not.toBeInTheDocument();
  });

  it("says so plainly when this animal brought nothing", () => {
    // Not an empty card and not a blank space: the fact, stated. §10.
    render([belonging({ petId: PET_B })]);

    expect(screen.getByText(/tidak menitipkan barang/i)).toBeInTheDocument();
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

  it("counts what is still here in the header, in words", async () => {
    // §1.3 — a red "2" is a number somebody has to decode. The badge carries
    // the word, and it is what tells a counter the visit cannot close yet.
    render([
      belonging({ _id: "a", checkedInAt: "2026-09-04T01:00:00.000Z" }),
      belonging({
        _id: "b",
        name: "Kalung merah",
        checkedInAt: "2026-09-04T01:00:00.000Z",
        checkedOutAt: "2026-09-04T06:00:00.000Z",
      }),
    ]);

    expect(screen.getByText("1 belum kembali")).toBeInTheDocument();
    expect(screen.getByText(/tidak bisa diselesaikan/i)).toBeInTheDocument();
  });

  it("does not count something that never arrived as outstanding", () => {
    /*
      THE WHOLE REASON THERE ARE TWO DATES. An item written down when the booking
      was taken and never handed over has nothing to give back, and holding the
      visit open over it would teach the shop to ignore the warning.
    */
    render([belonging({ checkedInAt: null })]);

    expect(screen.queryByText(/belum kembali/i)).not.toBeInTheDocument();
    expect(screen.getByText("Semua kembali")).toBeInTheDocument();
  });

  it("adds a thing to THIS animal, checked in", async () => {
    /*
      An item added at the counter is one somebody is holding — it arrived in the
      same movement that recorded it — so the server defaults `checkedIn` and the
      card does not send it. The petId is the page's, never asked for.
    */
    render([]);

    await userEvent.click(screen.getByRole("button", { name: /tambah barang/i }));
    await userEvent.type(
      screen.getByLabelText(/nama barang titipan mochi/i),
      "Kalung merah",
    );
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    await waitFor(() =>
      expect(bookings.addBelonging).toHaveBeenCalledWith("bk-1", {
        petId: PET_A,
        name: "Kalung merah",
      }),
    );
  });

  it("hands the updated booking up rather than guessing locally", async () => {
    // The row reflects the server: nothing is ticked optimistically and
    // reconciled afterwards.
    const updated = booking([
      belonging({ checkedInAt: "2026-09-04T01:00:00.000Z" }),
    ]);
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

    expect(
      await screen.findByText(/belum dicentang masuk/i),
    ).toBeInTheDocument();
    // Unchanged: the tick follows the server, and the server said no.
    expect(screen.getByLabelText(/carrier biru keluar/i)).not.toBeChecked();
  });

  it("keeps the draft on screen when the add is refused", async () => {
    /*
      A refusal that also empties the box makes somebody retype what they just
      typed, and the second attempt is where the typo goes in. The form stays
      open with the words in it.
    */
    bookings.addBelonging.mockRejectedValue(
      new ApiError("Validation failed", 422, {
        reason: "Barang titipan sudah mencapai batas",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    render([]);

    await userEvent.click(screen.getByRole("button", { name: /tambah barang/i }));
    const field = screen.getByLabelText(/nama barang titipan mochi/i);
    await userEvent.type(field, "Kalung merah");
    await userEvent.click(screen.getByRole("button", { name: "Simpan" }));

    expect(await screen.findByText(/sudah mencapai batas/i)).toBeInTheDocument();
    expect(field).toHaveValue("Kalung merah");
  });
});
