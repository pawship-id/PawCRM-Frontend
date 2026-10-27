import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OfflineReviewScreen } from "@/features/pos";
import { PosHeldCartsDialog } from "@/features/pos/components/PosHeldCartsDialog";
import { posOfflineService } from "@/services/posOffline.service";
import type { PosTransaction } from "@/types/api";
import type { OfflineSubmission } from "@/types/posOffline";

jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("@/services/posOffline.service", () => ({
  posOfflineService: { listSubmissions: jest.fn(), resolve: jest.fn() },
}));

const mocked = posOfflineService as jest.Mocked<typeof posOfflineService>;

function submission(over: Partial<OfflineSubmission> = {}): OfflineSubmission {
  return {
    _id: "sub-1",
    branchId: "b1",
    deviceId: "dev-1",
    deviceCode: "K1",
    clientTxnId: "c1",
    transactionNumber: "POS-K1-0001",
    cashierUserId: "u1",
    cashierName: "Ani",
    shiftId: "s1",
    paidAt: "2026-10-27T03:00:00.000Z",
    grandTotal: "50000",
    status: "synced",
    reasons: [],
    flags: [{ code: "negative_stock", message: "Stok sampo tinggal -2 setelah transaksi ini diposting ke gudang utama cabang" }],
    reviewOpen: true,
    posTransactionId: "t1",
    attempts: 1,
    receivedAt: "2026-10-27T03:00:00.000Z",
    syncedAt: "2026-10-27T03:00:00.000Z",
    resolvedBy: null,
    resolvedAt: null,
    resolutionNote: null,
    payload: { customerId: null, items: [], payments: [], totals: null },
    ...over,
  } as OfflineSubmission;
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.resolve.mockResolvedValue(submission({ reviewOpen: false }) as never);
});

describe("Perlu dicek", () => {
  it("lets the notes column wrap so the action buttons stay on the card", async () => {
    mocked.listSubmissions.mockResolvedValue({ items: [submission()], pagination: { total: 1, totalPages: 1 } } as never);
    render(<OfflineReviewScreen />);
    const note = await screen.findByText(/Stok sampo tinggal -2/);
    expect(note.closest("td")).toHaveClass("whitespace-normal");
  });

  it("asks before Tandai sudah dicek, and does nothing on Batal", async () => {
    mocked.listSubmissions.mockResolvedValue({ items: [submission()], pagination: { total: 1, totalPages: 1 } } as never);
    const user = userEvent.setup();
    render(<OfflineReviewScreen />);

    await user.click(await screen.findByRole("button", { name: "Tandai sudah dicek" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Tandai POS-K1-0001 sudah dicek?")).toBeInTheDocument();
    expect(mocked.resolve).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Batal" }));
    expect(mocked.resolve).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Tandai sudah dicek" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Tandai sudah dicek" }));
    await waitFor(() => expect(mocked.resolve).toHaveBeenCalledWith("sub-1", { action: "accept", note: null }));
  });

  it("retries a failed sale straight away — it only re-runs the posting", async () => {
    mocked.listSubmissions.mockResolvedValue({
      items: [submission({ status: "needs_review", reviewOpen: true, reasons: [{ code: "posting_failed", message: "Produk nonaktif" }], flags: [] })],
      pagination: { total: 1, totalPages: 1 },
    } as never);
    const user = userEvent.setup();
    render(<OfflineReviewScreen />);

    await user.click(await screen.findByRole("button", { name: "Coba lagi" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(mocked.resolve).toHaveBeenCalledWith("sub-1", { action: "retry", note: null }));
  });
});

function cart(over: Partial<PosTransaction> = {}): PosTransaction {
  return {
    _id: "cart-1",
    heldLabel: null,
    customer: { name: "Ibu Sri", phone: "0812" },
    cartNumber: 3,
    items: [{}, {}],
    runningTotals: { net: "75000" },
    updatedAt: "2026-10-27T03:00:00.000Z",
    syncOnline: false,
    ...over,
  } as unknown as PosTransaction;
}

describe("Keranjang tersimpan", () => {
  function renderDialog(carts: PosTransaction[], onDiscard = jest.fn()) {
    render(
      <PosHeldCartsDialog
        open
        carts={carts}
        loading={false}
        error={null}
        onResume={jest.fn()}
        onDiscard={onDiscard}
        onOpenChange={jest.fn()}
      />,
    );
    return onDiscard;
  }

  it("names sharing the way the switch does", () => {
    renderDialog([cart()]);
    expect(screen.getByText(/Keranjang yang Anda simpan di shift ini, ditambah keranjang yang dibagikan kasir lain/)).toBeInTheDocument();
    expect(screen.queryByText(/\bkamu\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sync online/i)).not.toBeInTheDocument();
  });

  it("asks before throwing a parked basket away", async () => {
    const user = userEvent.setup();
    const onDiscard = renderDialog([cart()]);

    await user.click(screen.getByRole("button", { name: "Hapus Ibu Sri" }));
    expect(onDiscard).not.toHaveBeenCalled();
    expect(await screen.findByText("Hapus keranjang Ibu Sri?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Batal" }));
    expect(onDiscard).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Hapus Ibu Sri" }));
    await user.click(await screen.findByRole("button", { name: "Hapus keranjang" }));
    await waitFor(() => expect(onDiscard).toHaveBeenCalledTimes(1));
  });

  it("does not say keranjang twice for an unnamed basket", async () => {
    const user = userEvent.setup();
    renderDialog([cart({ customer: null } as never)]);
    await user.click(screen.getByRole("button", { name: "Hapus Keranjang 3" }));
    expect(await screen.findByText("Hapus Keranjang 3?")).toBeInTheDocument();
  });
});
