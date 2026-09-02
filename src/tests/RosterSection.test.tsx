import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RosterSection } from "@/features/users";
import { bookingService } from "@/services/booking.service";
import { userService } from "@/services/user.service";
import type { User } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/user.service");
jest.mock("@/services/booking.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const users = userService as jest.Mocked<typeof userService>;
const bookings = bookingService as jest.Mocked<typeof bookingService>;

const user = (overrides: Partial<User> = {}): User =>
  ({
    _id: "user-1",
    fullName: "Sinta",
    commissionRate: null,
    availability: { weeklyOff: [], leaveDates: [] },
    ...overrides,
  }) as User;

beforeEach(() => {
  jest.clearAllMocks();
  bookings.affectedByLeave.mockResolvedValue([]);
  users.update.mockImplementation(async (_id, patch) =>
    ({ ...user(), ...patch }) as User,
  );
});

/**
 * THE ROSTER AND THE RATE — FR-4 and FR-6, on a screen at last.
 *
 * Both have been storable since the user module shipped and neither had one.
 * The roster decides who may be booked; the rate decides what they earn. Until
 * this section existed the only way to set either was to call the API by hand.
 */
describe("RosterSection", () => {
  /*
    JAVASCRIPT'S DAY NUMBERING — 0 is Sunday, 3 is Wednesday. It is what
    `Date#getDay` returns and what the server compares against; a friendlier
    numbering invented here would be a translation layer with exactly one job,
    to be got wrong once, quietly, on somebody's day off.
  */
  it("sends Wednesday as 3", async () => {
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    await userEvent.click(screen.getByLabelText("Rabu"));
    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() =>
      expect(users.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({
          availability: expect.objectContaining({ weeklyOff: [3] }),
        }),
      ),
    );
  });

  it("shows what is already set", () => {
    renderWithAuth(
      <RosterSection
        user={user({ availability: { weeklyOff: [3], leaveDates: [] } })}
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Rabu")).toBeChecked();
  });

  /*
    KRITERIA 4.9 — marking somebody off for next Wednesday when they already
    have four animals booked is a DECISION, not a typo, and it has to be made
    with the four animals visible.

    SHOWN, NOT ENFORCED. A shop that decides somebody is off anyway is making a
    real decision — they will phone the customers — and a screen that refused
    would send that decision somewhere this system cannot see.
  */
  it("warns about the bookings a new day off would strand", async () => {
    bookings.affectedByLeave.mockResolvedValue([
      {
        _id: "row-1",
        bookingId: "bk-1",
        bookingNumber: "BK-260909-004",
        scheduledAt: "2026-09-09T03:00:00.000Z",
        durationMin: 90,
        petId: "pet-1",
        name: "Full Grooming",
      },
    ]);

    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    await userEvent.click(screen.getByLabelText("Rabu"));

    expect(await screen.findByText(/BK-260909-004/)).toBeInTheDocument();
    expect(
      screen.getByText(/1 layanan sudah terjadwal/i),
    ).toBeInTheDocument();
    /* Still saveable — the warning is information, not a gate. */
    expect(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    ).toBeEnabled();
  });

  it("says nothing when the day off strands nobody", async () => {
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    await userEvent.click(screen.getByLabelText("Rabu"));

    await waitFor(() => expect(bookings.affectedByLeave).toHaveBeenCalled());
    expect(screen.queryByText(/sudah terjadwal/i)).not.toBeInTheDocument();
  });

  /* A failed courtesy must not stop somebody recording a day off. */
  it("still lets the day off be set when the check cannot be made", async () => {
    bookings.affectedByLeave.mockRejectedValue(new Error("offline"));

    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    await userEvent.click(screen.getByLabelText("Rabu"));
    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());
  });

  /* ── the rate ────────────────────────────────────────────────────────── */

  /*
    THE EXACT PAYLOAD, NOT `objectContaining` — and that distinction is why this
    test exists in this shape.

    The first version of this form sent `matrix: []` alongside every percentage,
    and the server refused every save: "commissionRate.matrix is not allowed for
    this commission type". The test that was supposed to catch it used
    `objectContaining`, which passes happily on an extra key it was not asked
    about. An assertion that cannot see a wrong extra field is not guarding the
    payload; it is guarding a subset of it.
  */
  it("sends a percentage rate, and NOTHING else", async () => {
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    await userEvent.click(screen.getByRole("combobox", { name: /komisi/i }));
    await userEvent.click(
      await screen.findByRole("option", { name: /persentase/i }),
    );

    await userEvent.type(screen.getByLabelText(/persen/i), "20");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());

    const [, patch] = users.update.mock.calls[0];
    expect(patch.commissionRate).toEqual({ type: "percentage", value: 20 });
  });

  it("sends a fixed rate the same way", async () => {
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    await userEvent.click(screen.getByRole("combobox", { name: /komisi/i }));
    await userEvent.click(
      await screen.findByRole("option", { name: /nominal tetap/i }),
    );

    await userEvent.type(screen.getByLabelText(/nominal/i), "25000");
    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());

    const [, patch] = users.update.mock.calls[0];
    expect(patch.commissionRate).toEqual({ type: "fixed", value: 25000 });
  });

  /*
    `null` IS THE ANSWER FOR MOST STAFF — cashiers, receptionists, a vet on
    salary — and it says so far more clearly than a rate of zero.
  */
  it("clears the rate to null rather than to zero", async () => {
    renderWithAuth(
      <RosterSection
        user={user({
          commissionRate: { type: "percentage", value: 20, matrix: [] },
        })}
        onUpdated={jest.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("combobox", { name: /komisi/i }));
    await userEvent.click(
      await screen.findByRole("option", { name: /tidak berkomisi/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() =>
      expect(users.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ commissionRate: null }),
      ),
    );
  });

  /*
    A MATRIX IS NOT EDITABLE HERE, and the screen says so rather than silently
    offering a control that would wipe it. A per-service rate needs a service
    picker with a row per service; squeezing a third mode in here would be worse
    than a stated limit.
  */
  it("warns before a matrix rate would be replaced", () => {
    renderWithAuth(
      <RosterSection
        user={user({
          commissionRate: {
            type: "matrix",
            value: null,
            matrix: [{ key: "svc-1", value: 30 }],
          },
        })}
        onUpdated={jest.fn()}
      />,
    );

    expect(screen.getByText(/komisi matriks/i)).toBeInTheDocument();
  });
});
