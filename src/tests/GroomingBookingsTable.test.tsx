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
  usePathname: () => "/dashboard/layanan/grooming",
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
    expect(detail.getByText(`− ${formatMoney("5000.0000")}`)).toBeInTheDocument();
    expect(detail.getByText(`− ${formatMoney("2000.0000")}`)).toBeInTheDocument();

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
