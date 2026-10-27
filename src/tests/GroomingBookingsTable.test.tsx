import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { toGroomingRows, type GroomingScope } from "@/features/grooming/board";
import { GroomingBookingsTable } from "@/features/grooming/components/GroomingBookingsTable";
import { formatMoney } from "@/utils/decimal";
import type { Booking, BookingMainService } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/booking.service");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/service/grooming/booking",
}));

const scope: GroomingScope = {
  serviceIds: new Set(["svc-groom"]),
  lineName: "Grooming",
};

function service(over: Partial<BookingMainService> = {}): BookingMainService {
  return {
    serviceId: "svc-groom",
    name: "Basic Grooming",
    serviceType: "Grooming",
    price: "120000.0000",
    durationMin: 60,
    status: "pending",
    statusHistory: [],
    startedAt: null,
    finishedAt: null,
    sessions: [],
    addons: [
      {
        itemId: "addon-1",
        serviceId: "svc-extra",
        name: "Extra Handling",
        price: "20000.0000",
        durationMin: 20,
      },
    ],
    ...over,
  };
}

function booking(over: Partial<Booking> = {}): Booking {
  return {
    _id: "bk-1",
    bookingNumber: "BK-260915-001",
    customerName: "Rina",
    petId: "pet-1",
    petName: "Mochi",
    status: "confirmed",
    statusHistory: [],
    nextStatuses: [],
    scheduledAt: "2026-09-15T09:00:00",
    location: "in_store",
    pickupRequested: false,
    deliveryRequested: false,
    posTransactionId: null,
    pulledToCartAt: null,
    pulledToInvoiceAt: null,
    internalNotes: null,
    groomerName: "Belum ditentukan",
    totalAmount: "140000.0000",
    service: service(),
    ...over,
  } as Booking;
}

async function openBreakdown(one: Booking) {
  renderWithAuth(
    <GroomingBookingsTable
      rows={toGroomingRows([one], scope)}
      loading={false}
      sort="schedule_asc"
      onSortChange={jest.fn()}
      onChanged={jest.fn()}
      emptyMessage="—"
    />,
  );

  await userEvent.click(screen.getByRole("button", { name: /buka rincian mochi/i }));

  return within(screen.getByRole("region", { name: "Rincian" }));
}

/**
 * The board's opened row — "Rincian".
 *
 * WHAT IS PINNED HERE: with a discount on the booking (15 September 2026), each
 * line shows what its bill takes off, the subtotal keeps the "Nilai" figure, and
 * the TOTAL is what the till and the invoice will bill. Without one, nothing
 * about the breakdown changes.
 */
describe("GroomingBookingsTable — Rincian", () => {
  /*
    Basic Grooming 120.000 with 5.000 off, Extra Handling 20.000 with 2.000 off,
    and a 3.000 share of "Diskon seluruh booking". The share is NOT added to the
    lines — `discountAmount` on them carries it, and is deliberately not what
    they show — it sits under the subtotal on its own.
  */
  it("shows each line's own discount, and the booking's discount under the subtotal", async () => {
    const detail = await openBreakdown(
      booking({
        service: {
          ...service(),
          discount: { mode: "amount", value: "5000", resolvedAmount: "5000.0000" },
          discountAmount: "7571.4286",
          addons: [
            {
              ...service().addons[0],
              discount: { mode: "amount", value: "2000", resolvedAmount: "2000.0000" },
              discountAmount: "2428.5714",
            },
          ],
        },
        bookingDiscount: { mode: "amount", value: "9000", resolvedAmount: "3000.0000" },
        discountAmount: "10000.0000",
        netAmount: "130000.0000",
      }),
    );

    expect(detail.getAllByText("Diskon item")).toHaveLength(2);
    expect(detail.getByText(`−${formatMoney("5000.0000")}`)).toBeInTheDocument();
    expect(detail.getByText(`−${formatMoney("2000.0000")}`)).toBeInTheDocument();

    /* The lines after their own discounts: 140.000 − 7.000. */
    expect(detail.getByText("Subtotal").nextSibling).toHaveTextContent(
      formatMoney("133000.0000"),
    );
    expect(detail.getByText("Diskon booking").nextSibling).toHaveTextContent(
      formatMoney("3000.0000"),
    );
    expect(detail.getByText("Total").nextSibling).toHaveTextContent(
      formatMoney("130000.0000"),
    );
  });

  it("stays as it was for a booking with no discount", async () => {
    const detail = await openBreakdown(booking());

    expect(detail.queryByText("Diskon item")).not.toBeInTheDocument();
    expect(detail.queryByText("Diskon booking")).not.toBeInTheDocument();
    expect(detail.queryByText("Subtotal")).not.toBeInTheDocument();
    expect(detail.getByText("Total").nextSibling).toHaveTextContent(
      formatMoney("140000.0000"),
    );
  });
});

/* Tipe and the trip behind a house call (12 October 2026, on request). */
describe("GroomingBookingsTable — Tipe and Perjalanan", () => {
  const show = (one: Booking) =>
    renderWithAuth(
      <GroomingBookingsTable
        rows={toGroomingRows([one], scope)}
        loading={false}
        sort="schedule_asc"
        onSortChange={jest.fn()}
        onChanged={jest.fn()}
        emptyMessage="—"
      />,
    );

  it("names a home grooming and links to its trip", () => {
    /* The list presents the trip as `homeTrip`, not the stored `homeTripId`. */
    show(
      booking({
        location: "in_home",
        homeTrip: { _id: "trip-9" } as NonNullable<Booking["homeTrip"]>,
      }),
    );

    expect(screen.getByText("Home grooming")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Buka perjalanan" })).toHaveAttribute(
      "href",
      "/dashboard/booking/rides/trip-9",
    );
  });

  it("names a grooming at the shop, with no trip to open", () => {
    show(booking());

    expect(screen.getByText("Di toko")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Buka perjalanan" })).not.toBeInTheDocument();
  });
});

/*
  SORTED FROM TWO HEADERS (BO, 20 October 2026): Booking, A first, and Nilai,
  largest first. Every other header is plain text, not a button.
*/
describe("GroomingBookingsTable — header sorting", () => {
  function drawSorted(sort: "schedule_asc" | "booking_asc" | "value_desc" = "schedule_asc") {
    const onSortChange = jest.fn();
    renderWithAuth(
      <GroomingBookingsTable
        rows={toGroomingRows([booking()], scope)}
        loading={false}
        sort={sort}
        onSortChange={onSortChange}
        onChanged={jest.fn()}
        emptyMessage="—"
      />,
    );
    return onSortChange;
  }

  it("sorts Booking A first and Nilai largest first on the first click", async () => {
    const onSortChange = drawSorted();

    await userEvent.click(screen.getByRole("button", { name: "Booking" }));
    expect(onSortChange).toHaveBeenLastCalledWith("booking_asc");

    await userEvent.click(screen.getByRole("button", { name: "Nilai" }));
    expect(onSortChange).toHaveBeenLastCalledWith("value_desc");
  });

  it("flips the active column on the next click", async () => {
    const onSortChange = drawSorted("booking_asc");

    expect(screen.getByRole("columnheader", { name: "Booking" })).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    await userEvent.click(screen.getByRole("button", { name: "Booking" }));
    expect(onSortChange).toHaveBeenLastCalledWith("booking_desc");
  });

  it("lights no header for the default schedule order, and leaves the rest plain", () => {
    drawSorted();

    for (const name of ["Booking", "Nilai"]) {
      expect(screen.getByRole("columnheader", { name })).toHaveAttribute("aria-sort", "none");
    }
    for (const name of ["Hewan", "Layanan", "Tipe", "Perjalanan", "Jam", "Groomer", "Faktur", "Status"]) {
      expect(screen.getByRole("columnheader", { name })).not.toHaveAttribute("aria-sort");
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });

  it("still folds the row open on a click, and not from the status control", async () => {
    renderWithAuth(
      <GroomingBookingsTable
        rows={toGroomingRows([booking({ nextStatuses: ["arrived"] })], scope)}
        loading={false}
        sort="schedule_asc"
        onSortChange={jest.fn()}
        onChanged={jest.fn()}
        emptyMessage="—"
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^Status / }));
    expect(screen.queryByRole("region", { name: "Rincian" })).toBeNull();

    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByText("Rina"));
    expect(screen.getByRole("region", { name: "Rincian" })).toBeInTheDocument();
  });
});
