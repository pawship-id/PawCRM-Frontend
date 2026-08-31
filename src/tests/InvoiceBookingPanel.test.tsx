import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InvoiceBookingPanel } from "@/features/sales/components/InvoiceBookingPanel";
import { bookingService } from "@/services/booking.service";
import { ApiError } from "@/services/api-error";
import type { Booking } from "@/types/api";

jest.mock("@/services/booking.service");

/**
 * The customer's bookings, offered for billing on an invoice — PCR-034.
 *
 * WHAT THIS PROTECTS is the double-billing case with no downstream symptom. The
 * SERVER decides what is offerable — confirmed, this customer's, not already in
 * a basket or on another invoice — and this panel must not second-guess it. A
 * filter here would be a second definition of "already billed", and the two
 * would eventually disagree about whether a grooming had been paid for.
 */
const booking = (overrides: Partial<Booking> = {}): Booking =>
  ({
    _id: "bk1",
    bookingNumber: "BK-260828-001",
    petId: "pet1",
    petName: "Miko",
    scheduledAt: "2026-08-28T02:00:00.000Z",
    items: [
      {
        serviceId: "svc1",
        name: "Grooming Full",
        price: "150000",
        groomerUserId: "u1",
        groomerName: "Rina",
      },
    ],
    ...overrides,
  }) as unknown as Booking;

const onChange = jest.fn();

const open = (props = {}) =>
  render(
    <InvoiceBookingPanel
      customerId="c1"
      selected={[]}
      onChange={onChange}
      {...props}
    />,
  );

beforeEach(() => {
  onChange.mockClear();
  (bookingService.bridge as jest.Mock).mockResolvedValue([booking()]);
});

describe("what it asks the server for", () => {
  /*
    A WIDER WINDOW THAN THE TILL'S. A cashier bills what is happening in front of
    them; an invoice bills what has already happened — a month of boarding, last
    week's grooming. Today alone would leave this panel empty for exactly the
    cases it exists to serve.
  */
  it("asks for a month, not just today", async () => {
    open();

    await waitFor(() => expect(bookingService.bridge).toHaveBeenCalled());
    expect(bookingService.bridge).toHaveBeenCalledWith("c1", 30);
  });
});

describe("what it shows", () => {
  it("leads with the animal, not the booking number", async () => {
    // Somebody billing a grooming thinks in pets; the number is what they quote
    // afterwards.
    open();

    expect(await screen.findByText("Miko")).toBeInTheDocument();
    expect(screen.getByText("BK-260828-001")).toBeInTheDocument();
  });

  it("lists every service with who is doing it", async () => {
    open();

    expect(await screen.findByText(/Grooming Full · Rina/)).toBeInTheDocument();
  });

  it("adds the booking up", async () => {
    open();

    expect(await screen.findByText("Rp 150.000")).toBeInTheDocument();
  });

  it("says so plainly when there is nothing to bill", async () => {
    (bookingService.bridge as jest.Mock).mockResolvedValue([]);
    open();

    expect(
      await screen.findByText(/tidak ada booking pelanggan ini/i),
    ).toBeInTheDocument();
  });

  /*
    ONE ROW PER ANIMAL. A bill for three cats has to say which three — the
    customer checking it and the groomer reading it both need the names.
  */
  it("shows one row per animal", async () => {
    (bookingService.bridge as jest.Mock).mockResolvedValue([
      booking(),
      booking({ _id: "bk2", petName: "Oyen", bookingNumber: "BK-260828-002" }),
    ]);
    open();

    expect(await screen.findByText("Miko")).toBeInTheDocument();
    expect(screen.getByText("Oyen")).toBeInTheDocument();
  });
});

describe("choosing", () => {
  /*
    REPORTS THE WHOLE BOOKING, not just its id. The form sends ids and nothing
    else — the server reads each booking's own frozen prices — but it still has
    to SHOW what the bill comes to before anybody approves it. Ids alone left the
    recap reading Rp 0 with two groomings ticked.
  */
  it("reports the booking when it is ticked", async () => {
    open();
    await userEvent.click(await screen.findByRole("checkbox"));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ _id: "bk1", petName: "Miko" }),
    ]);
  });

  it("takes it back out when it is unticked", async () => {
    open({ selected: ["bk1"] });
    await userEvent.click(await screen.findByRole("checkbox"));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  /*
    THE PRICE ARRIVES AS A PLAIN DECIMAL STRING, and this suite says so because
    it did not. Booking prices are Decimal128 and serialised as
    `{ "$numberDecimal": "120000" }` — an object, where the type says `string`.
    Every booking's total rendered as an em dash and the recap stood at Rp 0.
    Fixed on the server; asserted here so a change back would be caught.
  */
  it("adds up a price that arrives as a decimal string", async () => {
    (bookingService.bridge as jest.Mock).mockResolvedValue([
      booking({
        items: [
          { serviceId: "svc1", name: "Grooming", price: "120000.0000", groomerUserId: null, groomerName: "Belum ditentukan" },
          { serviceId: "svc2", name: "Potong kuku", price: "30000.0000", groomerUserId: null, groomerName: "Belum ditentukan" },
        ],
      } as never),
    ]);
    open();

    expect(await screen.findByText("Rp 150.000")).toBeInTheDocument();
  });

  it("counts what will be billed", async () => {
    open({ selected: ["bk1"] });

    expect(
      await screen.findByText(/1 booking akan ditagih/i),
    ).toBeInTheDocument();
  });

  it("clears the lot in one click", async () => {
    open({ selected: ["bk1"] });
    await userEvent.click(
      await screen.findByRole("button", { name: /kosongkan/i }),
    );

    expect(onChange).toHaveBeenCalledWith([]);
  });
});

/*
  `bookings:read` IS A SEPARATE GRANT. A role that raises invoices without seeing
  the schedule is an ordinary arrangement rather than a misconfiguration — so the
  panel explains itself and the invoice can still be typed by hand.
*/
describe("when the bookings cannot be read", () => {
  it("explains a 403 without taking down the form", async () => {
    (bookingService.bridge as jest.Mock).mockRejectedValue(
      new ApiError("Forbidden", 403),
    );
    open();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/tidak punya akses ke Booking/i);
    expect(alert).toHaveTextContent(/faktur tetap bisa dibuat/i);
  });

  it("reports any other failure as what it was", async () => {
    (bookingService.bridge as jest.Mock).mockRejectedValue(
      new ApiError("Server error", 500),
    );
    open();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /gagal dimuat/i,
    );
  });
});

describe("without a customer", () => {
  /*
    "WHICH BOOKINGS" HAS NO MEANING UNTIL "WHOSE" IS ANSWERED. An empty panel
    above an unanswered question reads as "this customer has none".
  */
  it("renders nothing and asks the server nothing", () => {
    const { container } = render(
      <InvoiceBookingPanel customerId="" selected={[]} onChange={onChange} />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(bookingService.bridge).not.toHaveBeenCalled();
  });
});
