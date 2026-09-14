import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SessionCrew } from "@/features/booking/components/SessionGroomers";
import { bookingService } from "@/services/booking.service";
import type { BookingSession } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");

const bookings = bookingService as jest.Mocked<typeof bookingService>;

const FULL = [{ feature: "bookings", actions: ["read", "update"] }];
const READ_ONLY = [{ feature: "bookings", actions: ["read"] }];

const sinta = {
  _id: "u-sinta",
  name: "Sinta",
  level: "senior" as const,
  sharePercent: 50,
  offReason: null,
};
const rio = {
  _id: "u-rio",
  name: "Rio",
  level: null,
  sharePercent: 50,
  offReason: null,
};

const session = (over: Partial<BookingSession> = {}): BookingSession =>
  ({
    sessionId: "se-1",
    sessionName: "Mandi",
    groomers: [sinta, rio],
    status: "pending",
    startedAt: null,
    finishedAt: null,
    notesSession: null,
    notesInternalSession: null,
    media: [],
    commissionWeight: null,
    ...over,
  }) as BookingSession;

const show = (one = session(), permissions = FULL) =>
  renderWithAuth(
    <SessionCrew
      bookingId="bk-1"
      session={one}
      groomers={[{ value: "u-dedi", label: "Dedi · Junior" }]}
      onChanged={jest.fn()}
    />,
    { isSuperAdmin: false, permissions: permissions as never },
  );

const box = (name: string) =>
  screen.getByLabelText(`Bagian komisi ${name} di Mandi (persen)`);

beforeEach(() => {
  jest.clearAllMocks();
  bookings.setSessionCrew.mockResolvedValue({} as never);
});

/**
 * ─── ONE ROW PER PERSON, AND THEIR PART OF THE TURN ─────────────────────────
 *
 * "Sinta · Senior … 50 % ×", then "+ Tambah groomer…". The percent is each
 * person's part of the turn's commission; the server refuses a split that does
 * not fit the crew or add up to 100, and this screen says so first.
 */
describe("SessionCrew", () => {
  it("names each person with their level, beside their percent and a way off", () => {
    show();

    expect(screen.getByText("Sinta")).toBeInTheDocument();
    expect(screen.getByText(/· Senior/)).toBeInTheDocument();
    expect(box("Sinta")).toHaveValue("50");
    expect(box("Rio")).toHaveValue("50");
    expect(
      screen.getByRole("button", { name: "Hapus Rio dari Mandi" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Tambah groomer ke Mandi" }),
    ).toHaveTextContent("+ Tambah groomer…");
  });

  it("fills the other box with the rest when two people share the turn, then saves", async () => {
    show();

    await userEvent.clear(box("Sinta"));
    await userEvent.type(box("Sinta"), "70{Enter}");

    await waitFor(() =>
      expect(bookings.setSessionCrew).toHaveBeenCalledWith("bk-1", {
        sessionId: "se-1",
        groomerUserIds: ["u-sinta", "u-rio"],
        groomerShares: { "u-sinta": 70, "u-rio": 30 },
      }),
    );
    expect(box("Rio")).toHaveValue("30");
  });

  it("takes the shop's decimal comma", async () => {
    show();

    await userEvent.clear(box("Rio"));
    await userEvent.type(box("Rio"), "37,5{Enter}");

    await waitFor(() =>
      expect(bookings.setSessionCrew).toHaveBeenCalledWith(
        "bk-1",
        expect.objectContaining({
          groomerShares: { "u-sinta": 62.5, "u-rio": 37.5 },
        }),
      ),
    );
  });

  it("says the total is wrong on a crew of three, and sends nothing", async () => {
    const dedi = { _id: "u-dedi", name: "Dedi", level: null, offReason: null };

    show(
      session({
        groomers: [
          { ...sinta, sharePercent: 33.33 },
          { ...rio, sharePercent: 33.33 },
          { ...dedi, sharePercent: 33.34 },
        ],
      }),
    );

    await userEvent.clear(box("Sinta"));
    await userEvent.type(box("Sinta"), "50{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Total bagian 116,67% — harus 100%.",
    );
    expect(bookings.setSessionCrew).not.toHaveBeenCalled();
  });

  it("refuses a percent above 100 without sending it", async () => {
    show();

    await userEvent.clear(box("Sinta"));
    await userEvent.type(box("Sinta"), "120{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Isi persen antara 0 dan 100.",
    );
    expect(bookings.setSessionCrew).not.toHaveBeenCalled();
  });

  it("does not offer a split on a turn with one person on it", () => {
    show(session({ groomers: [{ ...sinta, sharePercent: 100 }] }));

    expect(box("Sinta")).toBeDisabled();
    expect(box("Sinta")).toHaveValue("100");
  });

  it("drops the controls on a finished turn and reads the split out", () => {
    show(session({ status: "done" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByText("50 %")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /hapus/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /tambah groomer/i }),
    ).not.toBeInTheDocument();
  });

  it("reads the split to somebody who may not change it", () => {
    show(session(), READ_ONLY);

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByText("50 %")).toHaveLength(2);
  });

  it("falls back to an even split when a response carries no percent", () => {
    show(
      session({
        groomers: [
          { _id: "u-sinta", name: "Sinta", offReason: null },
          { _id: "u-rio", name: "Rio", offReason: null },
        ],
      }),
    );

    expect(box("Sinta")).toHaveValue("50");
    expect(box("Rio")).toHaveValue("50");
  });
});
