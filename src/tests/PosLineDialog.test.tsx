import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PosLineDialog } from "@/features/pos/components/PosLineDialog";
import { posService } from "@/services/pos.service";
import type { PosItem } from "@/types/api";

jest.mock("@/services/pos.service", () => ({
  posService: { lots: jest.fn() },
}));

const mockedLots = posService.lots as jest.Mock;

const item = (overrides: Partial<PosItem> = {}) =>
  ({
    kind: "product",
    refId: "prd-1",
    name: "Me-O Creamy Treats",
    sku: "MEOCREAMY:CHICKEN",
    qty: "2.0000",
    unitPrice: "22900.0000",
    lineTotal: "45800.0000",
    discount: null,
    ...overrides,
  }) as PosItem;

const LOTS = {
  hasExpiry: true,
  lots: [
    {
      _id: "lot-a",
      batchCode: "MEOCHICK-050328",
      supplierBatchCode: "MCTC:05/03/28",
      expiryDate: "2028-03-05T00:00:00.000Z",
      qtyRemaining: "16.0000",
    },
    {
      _id: "lot-b",
      batchCode: "MEOCHICK-180428",
      supplierBatchCode: "MCTC:18/04/28",
      expiryDate: "2028-04-18T00:00:00.000Z",
      qtyRemaining: "5.0000",
    },
  ],
};

beforeEach(() => {
  mockedLots.mockReset();
  mockedLots.mockResolvedValue(LOTS);
});

const renderDialog = (
  overrides: Partial<PosItem> = {},
  maySetPrice = false,
) => {
  const onSave = jest.fn().mockResolvedValue(true);

  render(
    <PosLineDialog
      item={item(overrides)}
      maySetPrice={maySetPrice}
      open
      onOpenChange={jest.fn()}
      onSave={onSave}
    />,
  );

  return onSave;
};

const simpan = () => screen.getByRole("button", { name: /^simpan$/i });

describe("PosLineDialog", () => {
  it("leaves the line to FEFO by default and saves the note", async () => {
    const onSave = renderDialog();
    const user = userEvent.setup();

    await screen.findByRole("button", { name: "Tambah batch" });
    await user.type(screen.getByLabelText("Catatan"), "dus penyok");
    await user.click(simpan());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        discount: null,
        qty: "2",
        lots: [],
        note: "dus penyok",
      }),
    );
  });

  it("starts the manual split from FEFO, earliest expiry first", async () => {
    renderDialog({ qty: "3.0000" });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Tambah batch" }),
    );

    // 16 on the first lot covers all three.
    // Covered: nothing left to add, so the button is gone rather than greyed.
    expect(screen.queryByRole("button", { name: /^tambah batch$/i })).toBeNull();
    expect(simpan()).toBeEnabled();
  });

  it("refuses Simpan, with an alert, until the lots add up to the quantity", async () => {
    const onSave = renderDialog({ qty: "3.0000" });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Tambah batch" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Kurangi jumlah batch 1" }),
    );

    // 2 of 3 — the error the cashier asked to see before submitting.
    // Nothing is said until Simpan is pressed — and then the dialog stays open.
    expect(screen.queryByText(/Total keseluruhan batch number/)).toBeNull();
    expect(simpan()).toBeEnabled();
    await user.click(simpan());
    expect(
      await screen.findByText(
        /Total keseluruhan batch number harus sama dengan jumlah produk yang dibeli/,
      ),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();

    // Add a row for the remaining one and pick the second lot.
    await user.click(screen.getByRole("button", { name: /^tambah batch$/i }));
    await user.click(screen.getByRole("combobox", { name: "Batch 2" }));
    await user.click(
      await screen.findByRole("option", { name: /MCTC:18\/04\/28/ }),
    );

    expect(screen.queryByRole("button", { name: /^tambah batch$/i })).toBeNull();
    expect(simpan()).toBeEnabled();

    await user.click(simpan());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          qty: "3",
          lots: [
            { batchId: "lot-a", qty: "2" },
            { batchId: "lot-b", qty: "1" },
          ],
        }),
      ),
    );
  });

  it("clamps a typed batch quantity to the lot's stock and the line's quantity", async () => {
    renderDialog({ qty: "3.0000" });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Tambah batch" }),
    );
    const input = screen.getByRole("textbox", { name: "Jumlah batch 1" });

    await user.clear(input);
    await user.type(input, "99");

    // Not more than the 3 being sold, even though the lot holds 16.
    expect(input).toHaveValue("3");
  });

  it("greys the + of a batch row, and hides Tambah baris, once the batches cover the quantity", async () => {
    renderDialog({ qty: "3.0000" });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Tambah batch" }),
    );

    expect(
      screen.getByRole("button", { name: "Tambah jumlah batch 1" }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^tambah batch$/i })).toBeNull();
  });

  it("follows the quantity: raising it leaves the split short of it", async () => {
    renderDialog({ qty: "2.0000" });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Tambah batch" }),
    );
    expect(simpan()).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Tambah jumlah" }));

    // Short by one: the way to add the missing row is offered.
    expect(
      screen.getByRole("button", { name: /^tambah batch$/i }),
    ).toBeInTheDocument();
  });

  it("offers each lot by its name and stock, without the expiry date", async () => {
    renderDialog({ qty: "3.0000" });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole("button", { name: "Tambah batch" }),
    );
    await user.click(screen.getByRole("combobox", { name: "Batch 1" }));

    expect(
      await screen.findByRole("option", { name: "MCTC:18/04/28 · sisa 5" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Exp/)).toBeNull();
    expect(screen.queryByText(/maks\./)).toBeNull();
  });

  it("sends a typed price, and only when it moved", async () => {
    const onSave = renderDialog({}, true);
    const user = userEvent.setup();

    await screen.findByRole("button", { name: "Tambah batch" });
    await user.click(simpan());
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0]).not.toHaveProperty("unitPrice");

    onSave.mockClear();
    const box = screen.getByLabelText("Harga");
    await user.clear(box);
    await user.type(box, "20000");
    await user.click(simpan());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ unitPrice: "20000" }),
      ),
    );
  });

  it("shows the price as plain text to a cashier who may not re-price", async () => {
    renderDialog({}, false);

    await screen.findByRole("button", { name: "Tambah batch" });
    expect(screen.queryByLabelText("Harga")).toBeNull();
  });

  it("shows no batch section for a product that does not expire", async () => {
    mockedLots.mockResolvedValue({ hasExpiry: false, lots: [] });
    renderDialog();

    await waitFor(() => expect(mockedLots).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Tambah batch" })).toBeNull();
  });

  it("never asks for lots, nor shows a quantity, on a service", async () => {
    renderDialog({ kind: "service" });

    expect(mockedLots).not.toHaveBeenCalled();
    expect(screen.queryByText("Jumlah")).not.toBeInTheDocument();
  });
});
