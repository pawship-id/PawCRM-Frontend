import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InvoiceExecutionPanel } from "@/features/sales/components/InvoiceExecutionPanel";
import { bookingService } from "@/services/booking.service";
import { userService } from "@/services/user.service";
import { ApiError } from "@/services/api-error";
import { swalToast } from "@/lib/swal";
import type { CustomerInvoiceDetail, InvoiceBooking } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");
jest.mock("@/services/user.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const toast = swalToast as jest.MockedFunction<typeof swalToast>;

/**
 * The execution panel on an invoice — PCR-035.
 *
 * WHAT IT PROTECTS. A grooming that has been billed and not yet done is work
 * somebody owes, and until this panel the only record of it was a line on a bill
 * the customer took home. Three things here are load-bearing:
 *
 *  1. A SHADOW BOOKING SAYS SO. An appointment nobody remembers making is what
 *     an invoice-born booking looks like on a day sheet, and "Dari faktur ini" is
 *     the whole explanation;
 *  2. THE ACTIONS DISAPPEAR ON A FINAL BOOKING. The server refuses both on a
 *     completed one, so offering them is two buttons that only ever answer 409;
 *  3. THE PANEL DRAWS WITHOUT `bookings:read`. Its data rides in with the
 *     invoice, so a role that raises bills and does not run the schedule still
 *     sees what is outstanding — only the two actions need the grant.
 */
const booking = (overrides: Partial<InvoiceBooking> = {}): InvoiceBooking => ({
  _id: "bk1",
  bookingNumber: "BK-260830-001",
  status: "confirmed",
  origin: "invoice_adhoc",
  scheduledAt: "2026-08-30T02:00:00.000Z",
  petId: "pet1",
  petName: "Miko",
  items: [
    {
      serviceId: "svc1",
      name: "Grooming Full",
      price: "150000.0000",
      groomerUserId: null,
      groomerName: "Belum ditentukan",
    },
  ],
  ...overrides,
});

const invoice = (bookings: InvoiceBooking[]) =>
  ({ bookings }) as unknown as CustomerInvoiceDetail;

const onChanged = jest.fn();

const open = (bookings = [booking()], auth = {}) =>
  renderWithAuth(
    <InvoiceExecutionPanel invoice={invoice(bookings)} onChanged={onChanged} />,
    auth,
  );

beforeEach(() => {
  onChanged.mockClear();
  toast.mockClear();
  (userService.list as jest.Mock).mockResolvedValue({
    items: [{ _id: "u1", fullName: "Rani" }],
    total: 1,
    page: 1,
    limit: 200,
    totalPages: 1,
  });
  (bookingService.assignGroomer as jest.Mock).mockResolvedValue({
    status: "confirmed",
    items: [
      {
        serviceId: "svc1",
        name: "Grooming Full",
        price: "150000.0000",
        groomerUserId: "u1",
        groomerName: "Rani",
      },
    ],
  });
  (bookingService.changeStatus as jest.Mock).mockResolvedValue({
    status: "completed",
    items: [],
  });
});

describe("what it shows", () => {
  it("names the animal and the service that has to happen", async () => {
    open();

    expect(await screen.findByText("Miko")).toBeInTheDocument();
    expect(
      screen.getByText(/Grooming Full · Belum ditentukan/),
    ).toBeInTheDocument();
  });

  /*
    THE EXPLANATION FOR AN APPOINTMENT NOBODY MADE. Without it a receptionist
    finds a booking on the day sheet with no idea where it came from.
  */
  it("says when the invoice itself raised the booking", async () => {
    open();

    expect(await screen.findByText("Dari faktur ini")).toBeInTheDocument();
  });

  it("says nothing of the kind for an appointment that existed first", async () => {
    open([booking({ origin: "booking" })]);

    expect(await screen.findByText("Miko")).toBeInTheDocument();
    expect(screen.queryByText("Dari faktur ini")).not.toBeInTheDocument();
  });

  it("draws nothing at all when the bill carries no services", () => {
    const { container } = open([]);

    expect(container).toBeEmptyDOMElement();
  });
});

describe("what it lets somebody do", () => {
  it("assigns a groomer without touching the price", async () => {
    const user = userEvent.setup();
    open();

    // The picker only exists once the staff list has landed — it is not
    // rendered disabled in the meantime.
    await user.click(await screen.findByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Rani" }));

    await waitFor(() =>
      expect(bookingService.assignGroomer).toHaveBeenCalledWith("bk1", "u1"),
    );
  });

  it("unassigns by choosing the empty slot back", async () => {
    const user = userEvent.setup();
    open([
      booking({
        items: [
          {
            serviceId: "svc1",
            name: "Grooming Full",
            price: "150000.0000",
            groomerUserId: "u1",
            groomerName: "Rani",
          },
        ],
      }),
    ]);

    // The picker only exists once the staff list has landed — it is not
    // rendered disabled in the meantime.
    await user.click(await screen.findByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Belum ditentukan" }),
    );

    await waitFor(() =>
      expect(bookingService.assignGroomer).toHaveBeenCalledWith("bk1", null),
    );
  });

  it("marks the work done", async () => {
    const user = userEvent.setup();
    open();

    // The staff fetch is in flight; letting it land first keeps its state
    // update inside act() rather than after the test has moved on.
    await waitFor(() => expect(userService.list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Tandai selesai" }));

    await waitFor(() =>
      expect(bookingService.changeStatus).toHaveBeenCalledWith(
        "bk1",
        "completed",
      ),
    );
  });

  /*
    HANDS BACK JUST WHAT MOVED. The endpoints answer with a Booking document, not
    with the invoice's view of one — spreading the whole answer over the row
    would drop the fields the invoice read assembled and this panel draws.
  */
  it("reports the move as a patch, keyed by booking", async () => {
    const user = userEvent.setup();
    open();

    // The staff fetch is in flight; letting it land first keeps its state
    // update inside act() rather than after the test has moved on.
    await waitFor(() => expect(userService.list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Tandai selesai" }));

    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(onChanged).toHaveBeenCalledWith("bk1", {
      status: "completed",
      items: [],
    });
  });

  /*
    THE SERVER'S OWN REASON REACHES THE TOAST. A 409 here is nearly always
    somebody else having moved the booking first, and its message says which
    state it actually found — worth more than anything this screen could invent.
  */
  it("shows the server's refusal rather than a generic one", async () => {
    const user = userEvent.setup();
    (bookingService.changeStatus as jest.Mock).mockRejectedValue(
      new ApiError("Conflict", 409, { reason: "Booking ini sudah dibatalkan" }),
    );
    open();

    // The staff fetch is in flight; letting it land first keeps its state
    // update inside act() rather than after the test has moved on.
    await waitFor(() => expect(userService.list).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Tandai selesai" }));

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      "Booking ini sudah dibatalkan",
      "error",
      8000,
    );
  });
});

/*
  THE BUG THIS BLOCK EXISTS FOR shipped to the browser: `limit` was 200, the API
  caps it at 100, and the catch swallowed the 400 alike with every other failure.
  What reached the screen was a permanently DISABLED dropdown with nothing on it
  to explain why — a control that does nothing, which is worse than an error,
  because an error can be acted on.
*/
describe("when the staff list cannot be read", () => {
  it("asks for a page the API will actually serve", async () => {
    open();

    await waitFor(() => expect(userService.list).toHaveBeenCalled());
    expect(userService.list).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
  });

  it("says so when the request genuinely fails", async () => {
    (userService.list as jest.Mock).mockRejectedValue(
      new ApiError("Bad Request", 400),
    );
    open();

    expect(await screen.findByText(/gagal dimuat/i)).toBeInTheDocument();
  });

  /*
    A ROLE WITHOUT `users:read` IS AN ORDINARY ARRANGEMENT, not a fault — a
    banner over a working panel would be the wrong answer to it.
  */
  it("stays quiet about a role that may not read staff", async () => {
    (userService.list as jest.Mock).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );
    open();

    await waitFor(() => expect(userService.list).toHaveBeenCalled());
    expect(screen.queryByText(/gagal dimuat/i)).not.toBeInTheDocument();
  });

  /*
    ABSENT, NOT DISABLED. A disabled control says "not now" and invites somebody
    to keep clicking it; an absent one says "not here". "Tandai selesai" survives
    either way — it needs no staff list.
  */
  it.each([400, 403])(
    "hides the picker rather than greying it out (%s)",
    async (status) => {
      (userService.list as jest.Mock).mockRejectedValue(
        new ApiError("Nope", status),
      );
      open();

      await waitFor(() => expect(userService.list).toHaveBeenCalled());
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Tandai selesai" }),
      ).toBeInTheDocument();
    },
  );
});

describe("what it refuses to offer", () => {
  /*
    FINAL MEANS FINAL. The server refuses both actions on a completed booking, so
    offering them would be two controls that only ever answer 409.
  */
  it.each(["completed", "cancelled"] as const)(
    "offers no actions on a %s booking",
    async (status) => {
      open([booking({ status })]);

      expect(await screen.findByText("Miko")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Tandai selesai" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    },
  );

  /*
    THE PANEL STILL DRAWS. Its data rides in with the invoice, so a role holding
    `customerInvoices:read` and not `bookings:update` sees what is outstanding —
    and is told plainly why it cannot act, rather than finding out from a 403.
  */
  it("still shows the schedule to a role that may not change it", () => {
    open([booking()], {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    expect(screen.getByText("Miko")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Tandai selesai" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/bookings:update/)).toBeInTheDocument();
  });

  it("does not even ask for the staff list without the grant", () => {
    open([booking()], {
      isSuperAdmin: false,
      permissions: [{ feature: "customerInvoices", actions: ["read"] }],
    });

    expect(userService.list).not.toHaveBeenCalled();
  });
});
