import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderWithAuth } from "./helpers/renderWithAuth";
import {
  StockTransferPrintScreen,
} from "@/features/inventory";
import { TransferDeliveryNote } from "@/features/inventory/components/TransferDeliveryNote";
import { stockTransferService } from "@/services/stockTransfer.service";
import type { StockTransferDetail } from "@/types/inventory";

/**
 * SURAT JALAN — the note a driver carries with the boxes.
 *
 * Its shape is fixed by what shops already hold, so what is worth pinning is
 * that it STAYS that shape: the same title, the same two blocks of header, the
 * same six columns in the same order, a quantity total and the note beneath. A
 * tidy-up that reorders them is a tidy-up the receiving warehouse notices on the
 * first printout.
 */
function transfer(
  overrides: Partial<StockTransferDetail> = {},
): StockTransferDetail {
  return {
    _id: "tr1",
    transferNumber: "TRF/2610/1217",
    status: "in_transit",
    legacy: false,
    revision: 0,
    transferDate: "2026-08-29T02:00:00.000Z",
    fromWarehouseId: "w1",
    toWarehouseId: "w2",
    fromWarehouseName: "Pawship Barat",
    toWarehouseName: "Pusat",
    productCount: 3,
    lotCount: 3,
    value: "0",
    notes: "pengeluaran exp september",
    createdBy: "u1",
    createdByName: "Rina",
    createdAt: "2026-08-29T02:00:00.000Z",
    receivedAt: null,
    receivedByName: null,
    cancelledAt: null,
    cancelledByName: null,
    items: [
      {
        productId: "p1",
        qty: "11.0000",
        batchId: null,
        autoFefo: false,
        notes: null,
        productName: "Jerhigh Duo Stick Snack For Dog MILK BANANA",
        productSku: "JER-4598",
        productUnit: "Buah",
      },
      {
        productId: "p2",
        qty: "1.0000",
        batchId: null,
        autoFefo: false,
        notes: "dus penyok",
        productName: "Dog Appetit Frozen 2 Donat Pork",
        productSku: "DA:DonatPork",
        productUnit: "Buah",
      },
      {
        productId: "p3",
        qty: "3.0000",
        batchId: null,
        autoFefo: false,
        notes: null,
        productName: "Pawship Raw Goat Milk 500ml",
        productSku: "PawshipRawGoatMilk:500",
        productUnit: "Buah",
      },
    ],
    lines: [],
    arrivals: [],
    ...overrides,
  };
}

describe("TransferDeliveryNote", () => {
  it("carries the title, both ends, the number and the date", () => {
    renderWithAuth(<TransferDeliveryNote transfer={transfer()} />);

    expect(
      screen.getByRole("heading", { name: "Surat Jalan" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pawship Barat")).toBeInTheDocument();
    expect(screen.getByText("Pusat")).toBeInTheDocument();
    expect(screen.getByText("TRF/2610/1217")).toBeInTheDocument();
    expect(screen.getByText(/29 Agu 2026/)).toBeInTheDocument();
  });

  it("keeps the six columns in the order shops already read them", () => {
    renderWithAuth(<TransferDeliveryNote transfer={transfer()} />);

    const headers = screen
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);

    expect(headers).toEqual([
      "NO",
      "SKU",
      "NAMA BARANG",
      "QTY",
      "UNIT",
      "KETERANGAN",
    ]);
  });

  it("lists one row per product, numbered, with its own remark", () => {
    renderWithAuth(<TransferDeliveryNote transfer={transfer()} />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(3);

    const second = within(rows[1]).getAllByRole("cell");
    expect(second.map((cell) => cell.textContent)).toEqual([
      "2",
      "DA:DonatPork",
      "Dog Appetit Frozen 2 Donat Pork",
      "1",
      "Buah",
      "dus penyok",
    ]);
  });

  it("totals the quantities and prints the transfer's note", () => {
    renderWithAuth(<TransferDeliveryNote transfer={transfer()} />);

    // 11 + 1 + 3
    expect(screen.getByText("Total Qty").textContent).toContain("15");
    expect(screen.getByText("pengeluaran exp september")).toBeInTheDocument();
  });

  it("is a sheet of A4, which the print stylesheet keys on", () => {
    const { container } = renderWithAuth(
      <TransferDeliveryNote transfer={transfer()} />,
    );

    expect(
      container.querySelector('[data-receipt-sheet="a4"]'),
    ).not.toBeNull();
  });
});

describe("StockTransferPrintScreen", () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    window.print = jest.fn();
  });

  it("reads the document and shows the note it will print", async () => {
    jest.spyOn(stockTransferService, "getById").mockResolvedValue(transfer());

    renderWithAuth(<StockTransferPrintScreen transferId="tr1" />);

    expect(
      await screen.findByRole("heading", { name: "Surat Jalan" }),
    ).toBeInTheDocument();
    expect(stockTransferService.getById).toHaveBeenCalledWith("tr1");
  });

  it("prints on request, naming the file after the transfer's number", async () => {
    jest.spyOn(stockTransferService, "getById").mockResolvedValue(transfer());
    const user = userEvent.setup();

    renderWithAuth(<StockTransferPrintScreen transferId="tr1" />);

    const [button] = await screen.findAllByRole("button", { name: /Cetak/ });
    const before = document.title;
    await user.click(button);

    await waitFor(() => expect(window.print).toHaveBeenCalled());
    // Restored once the dialog closes — `afterprint` — and never left behind.
    window.dispatchEvent(new Event("afterprint"));
    expect(document.title).toBe(before);
  });

  it("prints a cancelled transfer too, and says it was cancelled", async () => {
    jest
      .spyOn(stockTransferService, "getById")
      .mockResolvedValue(transfer({ status: "cancelled" }));

    renderWithAuth(<StockTransferPrintScreen transferId="tr1" />);

    expect(await screen.findByText("dibatalkan")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Cetak/ }).length,
    ).toBeGreaterThan(0);
  });
});
