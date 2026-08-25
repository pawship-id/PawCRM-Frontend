import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ReturnDialog } from "@/features/pos/components/ReturnDialog";
import { TodayTransactionsDialog } from "@/features/pos/components/TodayTransactionsDialog";
import { VoidTransactionDialog } from "@/features/pos/components/VoidTransactionDialog";
import { paymentChannelService } from "@/services/paymentChannel.service";
import { posService } from "@/services/pos.service";
import { ApiError } from "@/services/api-error";
import type { PosTransaction } from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/pos.service");
jest.mock("@/services/paymentChannel.service");

const mockedPos = posService as jest.Mocked<typeof posService>;
const mockedChannels = paymentChannelService as jest.Mocked<
  typeof paymentChannelService
>;

const SALE_ID = "5a7f1f77bcf86cd7994390e1";
const PRODUCT_ID = "5a7f1f77bcf86cd7994390f1";
const SERVICE_ID = "5a7f1f77bcf86cd799439101";
const CASH_ID = "5a7f1f77bcf86cd799439201";

const item = (overrides = {}) => ({
  kind: "product" as const,
  refId: PRODUCT_ID,
  name: "Royal Canin Adult 2kg",
  sku: "RC-ADULT-2KG",
  qty: "2.0000",
  unitPrice: "150000.0000",
  lineTotal: "300000.0000",
  discount: null,
  hppAtTime: null,
  bookingId: null,
  petId: null,
  petName: null,
  groomerName: null,
  ...overrides,
});

const sale = (overrides: Partial<PosTransaction> = {}): PosTransaction => ({
  _id: SALE_ID,
  tenantId: "t1",
  branchId: "b1",
  warehouseId: "w1",
  shiftId: "s1",
  transactionNumber: "POS-20260825-0001",
  customerId: null,
  customer: null,
  items: [item()],
  cartDiscount: null,
  otherCharges: [],
  note: null,
  payments: [],
  totals: {
    subtotal: "300000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    dpp: "270270.2703",
    tax: "29729.7297",
    grandTotal: "300000.0000",
  },
  runningTotals: {
    subtotal: "300000.0000",
    itemDiscount: "0.0000",
    cartDiscount: "0.0000",
    otherCharges: "0.0000",
    net: "300000.0000",
  },
  status: "paid",
  heldLabel: null,
  bookingIds: [],
  paidAt: "2026-08-25T03:00:00.000Z",
  createdAt: "2026-08-25T02:00:00.000Z",
  updatedAt: "2026-08-25T03:00:00.000Z",
  ...overrides,
});

beforeEach(() => {
  mockedPos.listTransactions.mockResolvedValue({
    items: [sale()],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });
  mockedPos.voidSale.mockResolvedValue(sale({ status: "void" }));
  mockedPos.returnable.mockResolvedValue({
    posTransactionId: SALE_ID,
    transactionNumber: "POS-20260825-0001",
    status: "paid",
    items: [
      {
        posItemIndex: 0,
        kind: "product",
        name: "Royal Canin Adult 2kg",
        soldQty: "2.0000",
        remainingQty: "2.0000",
      },
    ],
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mockedPos.createReturn.mockResolvedValue({ returnNumber: "RTN-2026-0001" } as any);
  mockedChannels.list.mockResolvedValue({
    items: [
      {
        _id: CASH_ID,
        tenantId: "t1",
        type: "cash",
        name: "Kas Toko",
        accountId: "acc-1",
        mdrPercent: 0,
        branchId: "b1",
        requiresReference: false,
        sortOrder: 0,
        isActive: true,
        deletedAt: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
});

describe("TodayTransactionsDialog", () => {
  it("lists today's sales, not everything", async () => {
    renderWithAuth(
      <TodayTransactionsDialog
        open
        onVoid={jest.fn()}
        onReturn={jest.fn()}
        onReceipt={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockedPos.listTransactions).toHaveBeenCalled());

    const [query] = mockedPos.listTransactions.mock.calls[0];
    // A cashier reaching for this has a customer at the counter; a full history
    // would make the common case a search.
    expect(query?.paidFrom).toBeDefined();
    expect(query?.status).toEqual(["paid", "void"]);
  });

  it("marks a voided sale with a word, not a colour alone", async () => {
    mockedPos.listTransactions.mockResolvedValue({
      items: [sale({ status: "void" })],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    renderWithAuth(
      <TodayTransactionsDialog
        open
        onVoid={jest.fn()}
        onReturn={jest.fn()}
        onReceipt={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    expect(await screen.findByText("Dibatalkan")).toBeInTheDocument();
  });

  it("offers neither void nor return on an already-voided sale", async () => {
    mockedPos.listTransactions.mockResolvedValue({
      items: [sale({ status: "void" })],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    renderWithAuth(
      <TodayTransactionsDialog
        open
        onVoid={jest.fn()}
        onReturn={jest.fn()}
        onReceipt={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await screen.findByText("Dibatalkan");

    expect(
      screen.queryByRole("button", { name: /batalkan/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retur/i })).not.toBeInTheDocument();
    // The receipt stays reachable: a void leaves the sale on the record.
    expect(screen.getByRole("button", { name: /struk/i })).toBeInTheDocument();
  });

  it("hides both actions from a role that holds neither grant", async () => {
    renderWithAuth(
      <TodayTransactionsDialog
        open
        onVoid={jest.fn()}
        onReturn={jest.fn()}
        onReceipt={jest.fn()}
        onOpenChange={jest.fn()}
      />,
      { isSuperAdmin: false, permissions: [] },
    );

    await screen.findByText("POS-20260825-0001");

    // Showing a button that will refuse is worse than not showing it.
    expect(
      screen.queryByRole("button", { name: /batalkan/i }),
    ).not.toBeInTheDocument();
  });
});

/**
 * FR-11's void.
 *
 * The dangerous failure is a cashier voiding something without understanding
 * that money and stock both move — so most of what this dialog does is SAY so.
 */
describe("VoidTransactionDialog", () => {
  it("blocks until a reason is given", async () => {
    renderWithAuth(
      <VoidTransactionDialog
        sale={sale()}
        onVoided={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /batalkan transaksi/i }),
    ).toBeDisabled();
  });

  it("says what will happen, and points at Retur for a partial", async () => {
    renderWithAuth(
      <VoidTransactionDialog
        sale={sale()}
        onVoided={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    expect(screen.getByText(/stoknya kembali/i)).toBeInTheDocument();
    expect(screen.getByText(/pakai Retur/i)).toBeInTheDocument();
  });

  it("sends the reason", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <VoidTransactionDialog
        sale={sale()}
        onVoided={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/alasan/i), "Salah ketik");
    await user.click(screen.getByRole("button", { name: /batalkan transaksi/i }));

    await waitFor(() =>
      expect(mockedPos.voidSale).toHaveBeenCalledWith(SALE_ID, {
        reason: "Salah ketik",
      }),
    );
  });

  it("surfaces the server's refusal as written, so it can name Retur", async () => {
    const user = userEvent.setup();
    mockedPos.voidSale.mockRejectedValue(
      new ApiError("Conflict", 409, {
        reason:
          "Its cash has been counted and signed off. Process this as a return (Retur) instead.",
      }),
    );

    renderWithAuth(
      <VoidTransactionDialog
        sale={sale()}
        onVoided={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await user.type(screen.getByLabelText(/alasan/i), "Salah");
    await user.click(screen.getByRole("button", { name: /batalkan transaksi/i }));

    // Guessing the shift rule in the browser would mean two rules to keep in
    // step, and the browser's copy would be the one that drifted.
    expect(await screen.findByText(/Retur\) instead/)).toBeInTheDocument();
  });
});

/**
 * FR-11's return.
 *
 * A return is partial by nature, and these are mostly about that: what the form
 * offers, and what it refuses to compute.
 */
describe("ReturnDialog", () => {
  it("starts every line at zero — most returns are one item out of a basket", async () => {
    renderWithAuth(
      <ReturnDialog
        sale={sale()}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await screen.findByText("Royal Canin Adult 2kg");

    expect(screen.getByRole("button", { name: /proses retur/i })).toBeDisabled();
  });

  it("will not offer more than the server says is left", async () => {
    const user = userEvent.setup();
    mockedPos.returnable.mockResolvedValue({
      posTransactionId: SALE_ID,
      transactionNumber: "POS-20260825-0001",
      status: "paid",
      items: [
        {
          posItemIndex: 0,
          kind: "product",
          name: "Royal Canin Adult 2kg",
          soldQty: "2.0000",
          // One already came back on an earlier visit.
          remainingQty: "1.0000",
        },
      ],
    });

    renderWithAuth(
      <ReturnDialog
        sale={sale()}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    const add = await screen.findByRole("button", { name: /tambah royal/i });
    await user.click(add);

    // The form can only ever offer what the server would accept.
    expect(add).toBeDisabled();
  });

  it("shows no refund figure — the server owns that arithmetic", async () => {
    renderWithAuth(
      <ReturnDialog
        sale={sale()}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await screen.findByText("Royal Canin Adult 2kg");

    // A number computed here that disagreed with the refund would be discovered
    // by a customer at the counter.
    expect(screen.getByText(/dihitung dari harga yang dibayar/i)).toBeInTheDocument();
  });

  it("asks whether each line goes back on the shelf, once something is chosen", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ReturnDialog
        sale={sale()}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /tambah royal/i }));

    // One bag holds an unopened sack and a chewed toy.
    expect(screen.getByLabelText(/masih layak jual/i)).toBeInTheDocument();
  });

  it("offers no restock choice on a service", async () => {
    const user = userEvent.setup();
    mockedPos.returnable.mockResolvedValue({
      posTransactionId: SALE_ID,
      transactionNumber: "POS-20260825-0001",
      status: "paid",
      items: [
        {
          posItemIndex: 0,
          kind: "service",
          name: "Grooming Full",
          soldQty: "1.0000",
          remainingQty: "1.0000",
        },
      ],
    });

    renderWithAuth(
      <ReturnDialog
        sale={sale({
          items: [
            item({
              kind: "service",
              refId: SERVICE_ID,
              name: "Grooming Full",
              qty: "1.0000",
            }),
          ],
        })}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await user.click(
      await screen.findByRole("button", { name: /tambah grooming/i }),
    );

    // A grooming that already happened is not on a shelf, and a control that
    // does nothing is worse than none.
    expect(screen.queryByLabelText(/masih layak jual/i)).not.toBeInTheDocument();
  });

  it("says whose drawer the money comes out of", async () => {
    renderWithAuth(
      <ReturnDialog
        sale={sale()}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    // It changes who is short tonight: the till open now, not the one that made
    // the sale.
    expect(
      await screen.findByText(/laci yang sedang dibuka sekarang/i),
    ).toBeInTheDocument();
  });

  it("sends only the lines with something on them", async () => {
    const user = userEvent.setup();
    renderWithAuth(
      <ReturnDialog
        sale={sale()}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    await user.click(await screen.findByRole("button", { name: /tambah royal/i }));
    await user.type(screen.getByLabelText(/alasan/i), "Kemasan sobek");
    await user.click(screen.getByRole("button", { name: /proses retur/i }));

    await waitFor(() =>
      expect(mockedPos.createReturn).toHaveBeenCalledWith({
        posTransactionId: SALE_ID,
        items: [{ posItemIndex: 0, qty: "1", returnToStock: true }],
        refundMethod: "cash",
        refundChannelId: CASH_ID,
        reason: "Kemasan sobek",
      }),
    );
  });

  it("says so when the branch has no cash channel to refund from", async () => {
    mockedChannels.list.mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    renderWithAuth(
      <ReturnDialog
        sale={sale()}
        onReturned={jest.fn()}
        onOpenChange={jest.fn()}
      />,
    );

    expect(
      await screen.findByText(/belum ada channel tunai/i),
    ).toBeInTheDocument();
  });
});
