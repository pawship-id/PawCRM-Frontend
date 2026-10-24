import { screen, within } from "@testing-library/react";

import { PosCart } from "@/features/pos/components/PosCart";
import { groupByPet, plannedExtrasOf } from "@/features/pos/membershipCart";
import type { PosItem, PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

/**
 * "BENEFIT YANG AKAN DIBERIKAN" AT THE TILL (22 October 2026) — a pulled
 * booking's `plannedExtras` (as `bookingPlannedExtras` on its lines) are named
 * under the animal's header. A reminder only: nothing is applied.
 */
const EXTRAS = [
  { membershipId: "mem-1", benefitId: "ben-prio", label: "Prioritas booking" },
  { membershipId: "mem-1", benefitId: "ben-food", label: "Gratis makanan" },
];

const line = (over: Partial<PosItem> = {}): PosItem =>
  ({
    kind: "service",
    refId: "svc-groom",
    name: "Basic Grooming",
    sku: null,
    qty: "1.0000",
    unitPrice: "120000.0000",
    lineTotal: "120000.0000",
    discount: null,
    bookingId: "bk-3",
    bookingNumber: "BK-260915-003",
    parentServiceId: null,
    petId: "pet-cici",
    petName: "Cici",
    bookingPlannedExtras: EXTRAS,
    ...over,
  }) as unknown as PosItem;

const cart = (items: PosItem[]) =>
  ({
    _id: "cart-1",
    status: "active",
    customer: null,
    items,
    otherCharges: [],
    cartDiscount: null,
    note: null,
    runningTotals: {
      subtotal: "140000.0000",
      itemDiscount: "0.0000",
      cartDiscount: "0.0000",
      otherCharges: "0.0000",
      net: "140000.0000",
    },
  }) as unknown as PosTransaction;

const open = (items: PosItem[]) =>
  renderWithAuth(
    <PosCart
      cart={cart(items)}
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
    />,
  );

describe("plannedExtrasOf", () => {
  it("names each noted benefit once across the group's lines, skipping retail", () => {
    const items = [
      line(),
      line({ refId: "svc-extra", name: "Extra", parentServiceId: "svc-groom" } as Partial<PosItem>),
      line({ kind: "product", bookingId: null, bookingPlannedExtras: [] } as Partial<PosItem>),
    ];
    const [group] = groupByPet(items);
    expect(plannedExtrasOf(group.lines)).toEqual(["Prioritas booking", "Gratis makanan"]);
    expect(plannedExtrasOf([])).toEqual([]);
  });
});

describe("PosCart — benefit dari booking", () => {
  it("reminds the cashier under the animal's header", () => {
    open([line(), line({ refId: "svc-extra", name: "Extra", parentServiceId: "svc-groom" } as Partial<PosItem>)]);

    const group = document.querySelector("[data-pet-group]") as HTMLElement;
    const note = within(group).getByText(/Benefit dari booking:/).closest("[data-planned-extras]");
    expect(note).toHaveTextContent("Benefit dari booking: Prioritas booking, Gratis makanan");
    /* Once per animal, not per line. */
    expect(document.querySelectorAll("[data-planned-extras]")).toHaveLength(1);
  });

  it("says nothing when the booking noted nothing", () => {
    open([line({ bookingPlannedExtras: [] } as Partial<PosItem>)]);

    expect(document.querySelector("[data-planned-extras]")).toBeNull();
    expect(screen.queryByText(/Benefit dari booking/)).not.toBeInTheDocument();
  });
});
