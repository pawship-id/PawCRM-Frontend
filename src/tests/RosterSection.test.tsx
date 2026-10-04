import { fireEvent, screen, waitFor } from "@testing-library/react";
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
 * THE ROSTER — FR-4, on a screen at last.
 *
 * It has been storable since the user module shipped and had no screen. The
 * roster decides who may be booked; until this section existed the only way to
 * set it was to call the API by hand.
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

  /*
    ─── COMMISSION MOVED TO THE SHOP — 13 September 2026 ──────────────────────

    One rule for everybody, set in Layanan › Grooming › Pengaturan. The server
    stopped reading `users.commissionRate`, so this form neither shows nor sends
    it — and sending the stored rate back would keep alive a number that means
    nothing.
  */
  it("sends no commission rate at all, even for somebody who had one", async () => {
    renderWithAuth(
      <RosterSection
        user={user({
          commissionRate: { type: "percentage", value: 20, matrix: [] },
        })}
        onUpdated={jest.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());
    expect(users.update.mock.calls[0][1]).toEqual({
      isGroomer: false,
      /* The antar-jemput roster, sent with the groomer flag (21 Sep 2026). */
      isDriver: false,
      groomerLevel: null,
      availability: { weeklyOff: [], leaveDates: [] },
    });
  });

  /*
    ─── THE LEVEL — the label beside a groomer's name on a booking's crew ───────

    Offered only for a groomer, and sent back as it was so a save of the
    schedule does not wipe it.
  */
  it("offers a level only for somebody ticked as a groomer", async () => {
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    expect(
      screen.queryByRole("combobox", { name: "Level groomer" }),
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Groomer"));

    expect(
      screen.getByRole("combobox", { name: "Level groomer" }),
    ).toBeInTheDocument();
  });

  it("sends a stored level back on save", async () => {
    renderWithAuth(
      <RosterSection
        user={user({ isGroomer: true, groomerLevel: "senior" })}
        onUpdated={jest.fn()}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());
    expect(users.update.mock.calls[0][1]).toEqual(
      expect.objectContaining({ isGroomer: true, groomerLevel: "senior" }),
    );
  });

  it("says where commission is set now, and offers no control for it", () => {
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    expect(
      screen.getByText(/komisi diatur untuk seluruh toko/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /komisi/i }),
    ).not.toBeInTheDocument();
  });

  /*
    ─── LEAVE, TAKEN IN WEEKS ────────────────────────────────────────────────

    Somebody off from the 14th to the 20th was SEVEN uses of a date picker until
    3 September 2026, and a shop that finds that tedious writes the leave on
    paper — at which point the booking form cheerfully offers a groomer who is
    in Bali.
  */
  it("expands a range into individual days", async () => {
    /*
      STORED AS DAYS, DELIBERATELY. A stored range would need every reader —
      `offReason`, the clash check, the calendar — to learn about intervals, and
      each is a place to get an off-by-one wrong on somebody's last day off.
    */
    const onUpdated = jest.fn();

    renderWithAuth(<RosterSection user={user()} onUpdated={onUpdated} />);

    fireEvent.change(screen.getByLabelText(/dari tanggal/i), {
      target: { value: "2026-09-14" },
    });
    fireEvent.change(screen.getByLabelText(/sampai/i), {
      target: { value: "2026-09-16" },
    });

    /* The button counts, so nobody presses it wondering what it will do. */
    await userEvent.click(
      screen.getByRole("button", { name: /tambah 3 hari/i }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());
    expect(users.update.mock.calls[0][1].availability?.leaveDates).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
  });

  it("asks about the whole range in one go, not a day at a time", async () => {
    /*
      Seven round trips would be bad; seven separate warnings a reader has to add
      up would be worse.
    */
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/dari tanggal/i), {
      target: { value: "2026-09-14" },
    });
    fireEvent.change(screen.getByLabelText(/sampai/i), {
      target: { value: "2026-09-16" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: /tambah 3 hari/i }),
    );

    await waitFor(() => expect(bookings.affectedByLeave).toHaveBeenCalled());
    expect(bookings.affectedByLeave).toHaveBeenCalledTimes(1);
    expect(bookings.affectedByLeave).toHaveBeenCalledWith("user-1", [
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
    ]);
  });

  it("keeps one day one field and one press", async () => {
    /*
      "Sampai" IS OPTIONAL. A required second date would make every single-day
      absence a decision about whether to repeat the first one.
    */
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/dari tanggal/i), {
      target: { value: "2026-09-14" },
    });
    await userEvent.click(screen.getByRole("button", { name: /^tambah$/i }));

    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());
    expect(users.update.mock.calls[0][1].availability?.leaveDates).toEqual([
      "2026-09-14",
    ]);
  });

  it("refuses a range that runs backwards, and says so", async () => {
    // Silently doing nothing is the other option, and it teaches nobody.
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/dari tanggal/i), {
      target: { value: "2026-09-16" },
    });
    fireEvent.change(screen.getByLabelText(/sampai/i), {
      target: { value: "2026-09-14" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /harus setelah tanggal mulai/i,
    );
    expect(screen.getByRole("button", { name: /^tambah$/i })).toBeDisabled();
  });

  it("warns about the bookings a range would strand", async () => {
    /*
      KRITERIA 4.9. Marking somebody off when they already have four animals
      booked is a DECISION, not a typo — so it is shown before the save, and the
      save is still allowed.
    */
    bookings.affectedByLeave.mockResolvedValue([
      {
        _id: "it-1",
        name: "Grooming Full Service",
        scheduledAt: "2026-09-15T02:00:00.000Z",
        bookingNumber: "BK-260915-001",
      },
    ] as never);

    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    fireEvent.change(screen.getByLabelText(/dari tanggal/i), {
      target: { value: "2026-09-14" },
    });
    fireEvent.change(screen.getByLabelText(/sampai/i), {
      target: { value: "2026-09-16" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: /tambah 3 hari/i }),
    );

    expect(await screen.findByText(/BK-260915-001/)).toBeInTheDocument();
    /* Shown, never enforced — the shop will phone the customer. */
    expect(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    ).toBeEnabled();
  });

  /*
    ─── WHO IS EVEN A GROOMER ────────────────────────────────────────────────

    Nothing recorded this until 3 September 2026, so the booking form's dropdown
    was built from "every active user" — a shop with ten staff and two groomers
    picked from ten names, cashier and owner included.
  */
  it("sends the groomer flag when it is ticked", async () => {
    renderWithAuth(<RosterSection user={user()} onUpdated={jest.fn()} />);

    await userEvent.click(screen.getByRole("checkbox", { name: /^groomer$/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());
    expect(users.update.mock.calls[0][1].isGroomer).toBe(true);
  });

  it("opens already ticked for somebody who is one", async () => {
    renderWithAuth(
      <RosterSection user={user({ isGroomer: true })} onUpdated={jest.fn()} />,
    );

    expect(screen.getByRole("checkbox", { name: /^groomer$/i })).toBeChecked();
  });

  it("can untick somebody who has stopped grooming", async () => {
    /*
      THE FLAG IS EDITABLE IN BOTH DIRECTIONS, which is the point of storing it
      rather than deriving it from work already done: a derivation cannot be told
      that somebody has moved to the counter.
    */
    renderWithAuth(
      <RosterSection user={user({ isGroomer: true })} onUpdated={jest.fn()} />,
    );

    await userEvent.click(screen.getByRole("checkbox", { name: /^groomer$/i }));
    await userEvent.click(
      screen.getByRole("button", { name: /simpan jadwal/i }),
    );

    await waitFor(() => expect(users.update).toHaveBeenCalled());
    expect(users.update.mock.calls[0][1].isGroomer).toBe(false);
  });
});
