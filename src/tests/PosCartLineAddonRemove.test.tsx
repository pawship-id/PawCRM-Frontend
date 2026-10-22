import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosCartLine } from "@/features/pos/components/PosCartLine";
import type { PosItem } from "@/types/api";

/**
 * ONE ADD-ON OFF, NOT THE WHOLE GROOMING (21 October 2026, on request). An
 * add-on nested under its service has its own × — the bin on the service still
 * takes the service and every add-on with it.
 */
const line = (overrides: Partial<PosItem> = {}) =>
  ({
    kind: "service",
    refId: "svc-groom",
    name: "Basic Grooming In Store",
    qty: "1.0000",
    unitPrice: "160000.0000",
    lineTotal: "160000.0000",
    discount: null,
    petId: "pet-1",
    bookingId: "bk-1",
    bookingOwned: true,
    bookingStatus: "draft",
    ...overrides,
  }) as unknown as PosItem;

const addon = line({
  refId: "svc-parfum",
  name: "Tes Add on 2",
  unitPrice: "50000.0000",
  lineTotal: "50000.0000",
  parentServiceId: "svc-groom",
} as Partial<PosItem>);

function renderLine(overrides: Partial<PosItem> = {}) {
  const onRemove = jest.fn();
  render(
    <PosCartLine
      item={line(overrides)}
      index={0}
      addons={[{ item: addon, index: 1 }]}
      onQtyChange={jest.fn()}
      onRemove={onRemove}
      onEdit={jest.fn()}
    />,
  );
  return onRemove;
}

it("takes a single add-on off with its own ×", async () => {
  const user = userEvent.setup();
  const onRemove = renderLine();

  await user.click(screen.getByRole("button", { name: "Hapus add-on Tes Add on 2" }));
  expect(onRemove).toHaveBeenCalledWith(1);
});

it("still takes the service and its add-ons off with the service's bin", async () => {
  const user = userEvent.setup();
  const onRemove = renderLine();

  await user.click(screen.getByRole("button", { name: "Hapus Basic Grooming In Store" }));
  expect(onRemove).toHaveBeenCalledWith([0, 1]);
});

it("locks the × once the service has started", () => {
  renderLine({ bookingStatus: "in_progress" } as Partial<PosItem>);
  expect(screen.getByRole("button", { name: "Hapus add-on Tes Add on 2" })).toBeDisabled();
});
