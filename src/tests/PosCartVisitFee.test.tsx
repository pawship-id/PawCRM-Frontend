import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosCart } from "@/features/pos/components/PosCart";
import type { PosItem, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * THE HOME-VISIT FEE IS A ROW OF ITS OWN in the basket (11 October 2026). It
 * still bills as an add-on of Cilang's grooming (`parentServiceId`), but it is
 * drawn under "Perjalanan home grooming", not as "+ Biaya kunjungan" under the
 * bath — and it leaves the basket with the booking that carries it.
 */
const line = (over: Partial<PosItem>): PosItem =>
  ({
    kind: "service",
    sku: null,
    qty: "1.0000",
    discount: null,
    bookingDiscount: null,
    parentServiceId: null,
    visitFee: null,
    bookingStatus: "confirmed",
    bookingOwned: false,
    ...over,
  }) as PosItem;

const cart = () =>
  ({
    _id: "cart-1",
    status: "active",
    customer: null,
    items: [
      line({
        refId: "svc-groom",
        name: "Full Grooming",
        unitPrice: "120000.0000",
        lineTotal: "120000.0000",
        bookingId: "bk-1",
        bookingNumber: "BK-261011-001",
        petId: "pet-cilang",
        petName: "Cilang",
      }),
      line({
        refId: "svc-fee",
        name: "Biaya kunjungan · Zona B",
        unitPrice: "70000.0000",
        lineTotal: "70000.0000",
        bookingId: "bk-1",
        bookingNumber: "BK-261011-001",
        parentServiceId: "svc-groom",
        petId: "pet-cilang",
        petName: "Cilang",
        visitFee: {
          petNames: ["Cilang", "Coco"],
          zoneName: "Zona B",
          distanceKm: 3.915,
          unit: "per_visit",
          homeTripId: "trip-1",
        },
      }),
      line({
        refId: "svc-groom",
        name: "Full Grooming",
        unitPrice: "120000.0000",
        lineTotal: "120000.0000",
        bookingId: "bk-2",
        bookingNumber: "BK-261011-002",
        petId: "pet-coco",
        petName: "Coco",
      }),
    ],
    otherCharges: [],
    cartDiscount: null,
    note: null,
    runningTotals: {
      subtotal: "310000.0000",
      itemDiscount: "0.0000",
      cartDiscount: "0.0000",
      otherCharges: "0.0000",
      net: "310000.0000",
    },
  }) as unknown as PosTransaction;

const open = (onRemove = jest.fn()) => {
  const view = renderWithAuth(
    <PosCart
      cart={cart()}
      busy={false}
      error={null}
      onQtyChange={jest.fn()}
      onRemove={onRemove}
      onItemDetails={jest.fn()}
      onLinePrice={jest.fn()}
      onCartDiscount={jest.fn()}
      onCharges={jest.fn()}
      onHold={jest.fn()}
      onCheckout={jest.fn()}
      onNote={jest.fn()}
      onPickCustomer={jest.fn()}
      onClearCustomer={jest.fn()}
    />,
  );
  return { ...view, onRemove };
};

describe("PosCart — the home-visit fee", () => {
  it("draws the fee under its own trip header, not under the grooming", () => {
    const { container } = open();

    expect(screen.queryByText("+ Biaya kunjungan · Zona B")).not.toBeInTheDocument();

    const trip = container.querySelector("[data-trip-group]") as HTMLElement;
    expect(trip).toHaveTextContent("Perjalanan home grooming");
    expect(trip).toHaveTextContent("Biaya kunjungan · Zona B");
    /* Every animal on the trip, not only the one whose booking carries the line. */
    expect(trip).toHaveTextContent("Untuk Cilang, Coco · 3,9 km");
    expect(within(trip).getByText("Perjalanan")).toBeInTheDocument();
    /* No bin of its own — it leaves with its booking. */
    expect(within(trip).queryByRole("button", { name: /Hapus/ })).not.toBeInTheDocument();
  });

  it("takes the fee out with the grooming of the booking that carries it", async () => {
    const { onRemove } = open();

    const bins = screen.getAllByRole("button", { name: "Hapus Full Grooming" });
    await userEvent.click(bins[0]);

    expect(onRemove).toHaveBeenCalledWith([0, 1]);
  });

  it("leaves the fee alone when another booking's grooming goes", async () => {
    const { onRemove } = open();

    const bins = screen.getAllByRole("button", { name: "Hapus Full Grooming" });
    await userEvent.click(bins[1]);

    expect(onRemove).toHaveBeenCalledWith([2]);
  });
});

describe("PosCart — a trip's own line (homeTripId)", () => {
  const tripCart = () =>
    ({
      ...cart(),
      items: [
        cart().items[0],
        line({
          refId: "svc-fee",
          name: "Biaya kunjungan · Zona B",
          unitPrice: "70000.0000",
          lineTotal: "70000.0000",
          bookingId: null,
          homeTripId: "trip-1",
          visitFee: {
            petNames: ["Cilang", "Coco"],
            zoneName: "Zona B",
            distanceKm: 3.9,
            unit: "per_visit",
            homeTripId: "trip-1",
          },
        }),
      ],
    }) as unknown as PosTransaction;

  const openTrip = (onRemove = jest.fn()) => {
    renderWithAuth(
      <PosCart
        cart={tripCart()}
        busy={false}
        error={null}
        onQtyChange={jest.fn()}
        onRemove={onRemove}
        onItemDetails={jest.fn()}
        onLinePrice={jest.fn()}
        onCartDiscount={jest.fn()}
        onCharges={jest.fn()}
        onHold={jest.fn()}
        onCheckout={jest.fn()}
        onNote={jest.fn()}
        onPickCustomer={jest.fn()}
        onClearCustomer={jest.fn()}
      />,
    );
    return onRemove;
  };

  it("has a bin of its own that takes only the trip off", async () => {
    const onRemove = openTrip();

    const trip = document.querySelector("[data-trip-group]") as HTMLElement;
    await userEvent.click(within(trip).getByRole("button", { name: /Hapus Biaya kunjungan/ }));

    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("leaves the trip on the basket when a grooming goes", async () => {
    const onRemove = openTrip();

    await userEvent.click(screen.getByRole("button", { name: "Hapus Full Grooming" }));

    expect(onRemove).toHaveBeenCalledWith([0]);
  });
});

describe("PosCart — a trip still owed", () => {
  it("says the trip is not billed and offers to add it", async () => {
    const onAddTrip = jest.fn();
    renderWithAuth(
      <PosCart
        cart={
          {
            ...cart(),
            items: [cart().items[0], cart().items[2]],
            owedTrips: [
              {
                tripId: "trip-1",
                name: "Biaya kunjungan · Zona B",
                amount: "70000.0000",
                petNames: ["Cilang", "Coco"],
              },
            ],
          } as unknown as PosTransaction
        }
        busy={false}
        error={null}
        onQtyChange={jest.fn()}
        onRemove={jest.fn()}
        onItemDetails={jest.fn()}
        onLinePrice={jest.fn()}
        onCartDiscount={jest.fn()}
        onCharges={jest.fn()}
        onHold={jest.fn()}
        onCheckout={jest.fn()}
        onNote={jest.fn()}
        onPickCustomer={jest.fn()}
        onClearCustomer={jest.fn()}
        onAddTrip={onAddTrip}
      />,
    );

    const owed = document.querySelector("[data-owed-trip]") as HTMLElement;
    expect(owed).toHaveTextContent("Biaya perjalanan belum ditagih");
    expect(owed).toHaveTextContent("Biaya kunjungan · Zona B · Rp 70.000 · untuk Cilang, Coco");

    await userEvent.click(within(owed).getByRole("button", { name: /Tambahkan/ }));

    expect(onAddTrip).toHaveBeenCalledWith("trip-1");
  });
});

describe("PosCart — the trip goes with its last grooming", () => {
  const tripCart = (bothGroomings: boolean) =>
    ({
      ...cart(),
      items: [
        { ...cart().items[0], bookingTripId: "trip-1" },
        ...(bothGroomings ? [{ ...cart().items[2], bookingTripId: "trip-1" }] : []),
        line({
          refId: "svc-fee",
          name: "Biaya kunjungan · Zona B",
          unitPrice: "70000.0000",
          lineTotal: "70000.0000",
          bookingId: null,
          homeTripId: "trip-1",
          visitFee: {
            petNames: ["Cilang", "Coco"],
            zoneName: "Zona B",
            distanceKm: 3.9,
            unit: "per_visit",
            homeTripId: "trip-1",
          },
        }),
      ],
    }) as unknown as PosTransaction;

  const openWith = (value: PosTransaction) => {
    const onRemove = jest.fn();
    renderWithAuth(
      <PosCart
        cart={value}
        busy={false}
        error={null}
        onQtyChange={jest.fn()}
        onRemove={onRemove}
        onItemDetails={jest.fn()}
        onLinePrice={jest.fn()}
        onCartDiscount={jest.fn()}
        onCharges={jest.fn()}
        onHold={jest.fn()}
        onCheckout={jest.fn()}
        onNote={jest.fn()}
        onPickCustomer={jest.fn()}
        onClearCustomer={jest.fn()}
      />,
    );
    return onRemove;
  };

  it("takes the trip's line off with the last grooming of it", async () => {
    const onRemove = openWith(tripCart(false));

    await userEvent.click(screen.getByRole("button", { name: "Hapus Full Grooming" }));

    expect(onRemove).toHaveBeenCalledWith([0, 1]);
  });

  it("keeps the trip while another grooming of it stays", async () => {
    const onRemove = openWith(tripCart(true));

    await userEvent.click(screen.getAllByRole("button", { name: "Hapus Full Grooming" })[0]);

    expect(onRemove).toHaveBeenCalledWith([0]);
  });
});
