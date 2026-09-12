import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CashTransactionEditDialog } from "@/features/cash-transactions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { CashTransaction } from "@/types/api";

import { cashTx, channel, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * UBAH — the shared edit dialog. What it guards: the channel picker never
 * offers a move across kas ↔ bank (the number would lie), the dialog says the
 * number stays and the journal is reversed, it sends only what changed, and a
 * server refusal stays readable in the dialog.
 */
const CHANNELS = [
  channel({ _id: "ch-cash", name: "Kas Laci", type: "cash" }),
  channel({ _id: "ch-cash2", name: "Kas Cabang Dua", type: "cash" }),
  channel({ _id: "ch-bca", name: "BCA Operasional", type: "transfer" }),
  channel({ _id: "ch-qris", name: "QRIS BCA", type: "qris" }),
];

const onClose = jest.fn();
const onSaved = jest.fn();

const renderDialog = (transaction: CashTransaction) =>
  renderWithAuth(
    <CashTransactionEditDialog
      open
      transaction={transaction}
      onClose={onClose}
      onSaved={onSaved}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  asMock(paymentChannelService.list).mockResolvedValue(channelPage(CHANNELS));
});

async function openChannels(user: ReturnType<typeof userEvent.setup>) {
  const dialog = within(await screen.findByRole("dialog"));
  // Wait for the list to arrive before opening the picker.
  await waitFor(() => expect(paymentChannelService.list).toHaveBeenCalled());
  await user.click(dialog.getByRole("button", { name: "Channel" }));
  return dialog;
}

describe("CashTransactionEditDialog — the same-class channel rule", () => {
  it("offers only cash channels for a cash transaction", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog(cashTx());

    await openChannels(user);

    expect(
      await screen.findByRole("option", { name: "Kas Cabang Dua" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kas Laci" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "BCA Operasional" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "QRIS BCA" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Hanya channel kas/)).toBeInTheDocument();
  });

  it("offers only bank-type channels for a bank transaction — transfer, QRIS, EDC, giro", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog(
      cashTx({
        number: "BBM/CBS/2609/0005",
        channelId: "ch-bca",
        channelType: "transfer",
        channelName: "BCA Operasional",
      }),
    );

    await openChannels(user);

    expect(await screen.findByRole("option", { name: "QRIS BCA" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "BCA Operasional" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Kas Laci" }),
    ).not.toBeInTheDocument();
  });

  it("asks only for channels usable in the transaction's direction at its branch", async () => {
    renderDialog(cashTx({ direction: "out", kind: "supplier_payment" }));

    await waitFor(() =>
      expect(paymentChannelService.list).toHaveBeenCalledWith(
        expect.objectContaining({
          usableFor: "out",
          branchId: "b1",
          isActive: true,
        }),
      ),
    );
  });
});

describe("CashTransactionEditDialog — saving", () => {
  it("says the number stays and the journal is reversed, and waits for a change", async () => {
    renderDialog(cashTx());

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/tetap sama/)).toBeInTheDocument();
    expect(dialog.getByText("dibalik")).toBeInTheDocument();
    expect(dialog.getByText("Belum ada yang diubah")).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Simpan transaksi" }),
    ).toBeDisabled();
  });

  it("sends only what changed, with the reason", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const updated = cashTx({ channelId: "ch-cash2", channelName: "Kas Cabang Dua" });
    asMock(cashTransactionService.update).mockResolvedValue(updated);

    renderDialog(cashTx());
    const dialog = await openChannels(user);
    await user.click(await screen.findByRole("option", { name: "Kas Cabang Dua" }));
    await user.type(dialog.getByLabelText(/Alasan perubahan/), "Salah laci");
    await user.click(dialog.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.update).toHaveBeenCalledWith("ct1", {
        channelId: "ch-cash2",
        reason: "Salah laci",
      }),
    );
    expect(swalToast).toHaveBeenCalledWith(
      "Perubahan BKM/CBS/2609/0001 tersimpan.",
    );
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps the server's refusal readable in the dialog", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    asMock(cashTransactionService.update).mockRejectedValue(
      new ApiError("Payment exceeds the invoice's outstanding amount", 400),
    );

    renderDialog(cashTx());
    const dialog = within(await screen.findByRole("dialog"));
    const amount = dialog.getByLabelText(/^Jumlah/);
    await user.clear(amount);
    await user.type(amount, "400000");
    await user.click(dialog.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.update).toHaveBeenCalledWith("ct1", {
        amount: "400000",
      }),
    );
    expect(
      await dialog.findByText(/exceeds the invoice's outstanding amount/),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not let a commission payment's amount be typed", async () => {
    renderDialog(
      cashTx({
        number: "BKK/CBS/2609/0006",
        direction: "out",
        kind: "commission_payment",
        document: null,
      }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByLabelText(/^Jumlah/)).toBeDisabled();
  });

  it("edits an expense through its lines, never through an amount", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    asMock(chartOfAccountsService.tree).mockResolvedValue([
      {
        _id: "acc-listrik",
        code: "5401",
        name: "Beban Listrik",
        accountType: "expense",
        parentAccountId: null,
        businessLineId: null,
        isDefault: false,
        isActive: true,
        children: [],
      },
    ]);
    asMock(businessLineService.list).mockResolvedValue({
      items: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
    });
    asMock(cashTransactionService.update).mockResolvedValue(cashTx());

    renderDialog(
      cashTx({
        number: "BKK/CBS/2609/0003",
        direction: "out",
        kind: "expense",
        document: null,
        amount: "75000.0000",
        lines: [
          {
            accountId: "acc-listrik",
            accountCode: "5401",
            accountName: "Beban Listrik",
            amount: "75000.0000",
            businessLineId: null,
            businessLineName: null,
            memo: null,
          },
        ],
      }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    const line = await dialog.findByLabelText("Jumlah baris 1");
    expect(dialog.queryByLabelText(/^Jumlah$|^Jumlah \*/)).not.toBeInTheDocument();
    // An untouched editor is not a change.
    expect(dialog.getByText("Belum ada yang diubah")).toBeInTheDocument();

    await user.clear(line);
    await user.type(line, "80000");
    await user.click(dialog.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.update).toHaveBeenCalledWith("ct1", {
        lines: [{ accountId: "acc-listrik", amount: "80000", businessLineId: null }],
      }),
    );
  });

  it("says plainly when a transaction cannot be changed", async () => {
    renderDialog(cashTx({ legacy: true }));

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/tidak bisa diubah/)).toBeInTheDocument();
    expect(
      dialog.queryByRole("button", { name: "Simpan transaksi" }),
    ).not.toBeInTheDocument();
  });

  it("loads the transaction itself when given only its id", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(cashTx());

    renderWithAuth(
      <CashTransactionEditDialog
        open
        transactionId="ct1"
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      await dialog.findByRole("button", { name: "Simpan transaksi" }),
    ).toBeInTheDocument();
    expect(cashTransactionService.getById).toHaveBeenCalledWith("ct1");
  });
});
