import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BookingRescheduleDialog } from "@/features/booking/components/BookingRescheduleDialog";
import { ApiError } from "@/services/api-error";
import { bookingService } from "@/services/booking.service";
import type { Booking } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const bookings = bookingService as jest.Mocked<typeof bookingService>;

const booking = (over: Partial<Booking> = {}): Booking =>
  ({
    _id: "bk-1",
    bookingNumber: "BK-260903-001",
    // 09:00 local. Read through UTC this lands the previous day east of London.
    scheduledAt: new Date("2026-09-03T09:00:00").toISOString(),
    status: "confirmed",
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

function render(over: Partial<Booking> = {}, onChanged = jest.fn()) {
  renderWithAuth(
    <BookingRescheduleDialog
      booking={booking(over)}
      open
      onOpenChange={jest.fn()}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

beforeEach(() => {
  jest.clearAllMocks();
  bookings.reschedule.mockResolvedValue(booking() as never);
});

/**
 * MOVING AN APPOINTMENT TO ANOTHER TIME.
 *
 * WHAT THESE PIN: that it goes through the reschedule verb rather than the edit
 * form — which would REPRICE the visit — that the two boxes are read in the
 * shop's own clock, and that a clash is offered an override rather than a dead
 * end.
 */
describe("BookingRescheduleDialog", () => {
  it("prefills the time the booking is currently on", () => {
    // In the shop's own zone. `toISOString().slice(0,10)` would show the
    // previous day west of UTC+7 for a morning appointment.
    render();

    expect(screen.getByLabelText(/tanggal baru/i)).toHaveValue("2026-09-03");
    expect(screen.getByLabelText(/jam baru/i)).toHaveValue("09:00");
  });

  it("sends the new time through the reschedule verb", async () => {
    render();

    const date = screen.getByLabelText(/tanggal baru/i);
    await userEvent.clear(date);
    await userEvent.type(date, "2026-09-05");
    await userEvent.click(screen.getByRole("button", { name: /pindahkan jadwal/i }));

    await waitFor(() =>
      expect(bookings.reschedule).toHaveBeenCalledWith("bk-1", {
        scheduledAt: new Date("2026-09-05T09:00").toISOString(),
      }),
    );
  });

  it("never saves through the edit form — that would reprice the visit", async () => {
    /*
      THE FAILURE THIS GUARDS. `PATCH /bookings/:id` re-snapshots every unbilled
      row at today's catalogue price, because changing what is being done is a
      new quote. Moving a date through it would bill a shop's price rise to a
      customer who only rang to say Thursday is off.
    */
    render();

    await userEvent.click(screen.getByRole("button", { name: /pindahkan jadwal/i }));

    await waitFor(() => expect(bookings.reschedule).toHaveBeenCalled());
    expect(bookings.update).not.toHaveBeenCalled();
  });

  it("offers the override only after the diary refuses", async () => {
    /*
      A CHECKBOX THAT IS ALWAYS THERE is one people tick out of habit, and the
      clash check is the thing standing between a groomer and two dogs at ten.
      It appears when there is something to override, and says what it costs.
    */
    bookings.reschedule.mockRejectedValueOnce(
      new ApiError("Sinta sudah ada booking jam itu", 400, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    render();

    expect(screen.queryByText(/dua pekerjaan di jam yang sama/i)).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /pindahkan jadwal/i }));

    expect(
      await screen.findByText(/sudah ada booking jam itu/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/dua pekerjaan di jam yang sama/i),
    ).toBeInTheDocument();
  });

  it("sends forceClash only on the second attempt", async () => {
    bookings.reschedule.mockRejectedValueOnce(
      new ApiError("Sinta sudah ada booking jam itu", 400, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    render();

    await userEvent.click(screen.getByRole("button", { name: /pindahkan jadwal/i }));
    await screen.findByText(/dua pekerjaan di jam yang sama/i);
    await userEvent.click(screen.getByRole("button", { name: /tetap pindahkan/i }));

    await waitFor(() => expect(bookings.reschedule).toHaveBeenCalledTimes(2));
    expect(bookings.reschedule.mock.calls[0][1]).not.toHaveProperty(
      "forceClash",
    );
    expect(bookings.reschedule.mock.calls[1][1]).toMatchObject({
      forceClash: true,
    });
  });

  it("clears the clash when the time is changed again", async () => {
    // Picking a different hour is the OTHER remedy, and the warning must not
    // outlive the time it was about — a stale one turns the next save into an
    // override nobody meant to make.
    bookings.reschedule.mockRejectedValueOnce(
      new ApiError("Sinta sudah ada booking jam itu", 400, {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    render();

    await userEvent.click(screen.getByRole("button", { name: /pindahkan jadwal/i }));
    await screen.findByText(/dua pekerjaan di jam yang sama/i);

    const time = screen.getByLabelText(/jam baru/i);
    await userEvent.clear(time);
    await userEvent.type(time, "14:00");

    expect(screen.queryByText(/dua pekerjaan di jam yang sama/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /pindahkan jadwal/i }),
    ).toBeInTheDocument();
  });

  it("shows a refusal that is not a clash as an error, with no override", async () => {
    bookings.reschedule.mockRejectedValueOnce(
      new ApiError("Cannot reschedule a visit that has started", 409, {
        reason: "Hewannya sudah sampai",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any),
    );
    render();

    await userEvent.click(screen.getByRole("button", { name: /pindahkan jadwal/i }));

    expect(await screen.findByText(/hewannya sudah sampai/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /tetap pindahkan/i }),
    ).not.toBeInTheDocument();
  });

  it("tells the page to reload once the move lands", async () => {
    const onChanged = render();

    await userEvent.click(screen.getByRole("button", { name: /pindahkan jadwal/i }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
