import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CashTransactionEditDialog,
  CashTransactionEditScreen,
} from "@/features/cash-transactions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { businessLineService } from "@/services/businessLine.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { ChartOfAccountNode } from "@/types/accounting";
import { accountTypeOf } from "@/types/accounting";
import type { CashTransaction } from "@/types/api";

import { cashTx, channel, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * UBAH — the shared edit dialog. What it guards: the cash-side picker never
 * offers a move across kas ↔ bank (the number would lie), a TILL row still moves
 * by its channel while everything else moves by its ACCOUNT, the dialog says the
 * number stays and the journal is reversed, it sends only what changed, and a
 * server refusal stays readable in the dialog.
 */
const CHANNELS = [
  channel({ _id: "ch-cash", name: "Kas Laci", type: "cash" }),
  channel({ _id: "ch-cash2", name: "Kas Cabang Dua", type: "cash" }),
  channel({ _id: "ch-bca", name: "BCA Operasional", type: "transfer" }),
  channel({ _id: "ch-qris", name: "QRIS BCA", type: "qris" }),
];

/** The chart the pickers are built from — `cashType` is what sorts kas from bank. */
const account = (
  overrides: Partial<ChartOfAccountNode> &
    Pick<ChartOfAccountNode, "_id" | "code" | "name" | "accountCategory">,
): ChartOfAccountNode => ({
  parentAccountId: null,
  allocations: [],
  isDefault: false,
  isActive: true,
  children: [],
  accountType: accountTypeOf(overrides.accountCategory),
  ...overrides,
});

const CHART: ChartOfAccountNode[] = [
  account({
    _id: "acc-cash",
    code: "1101",
    name: "Kas",
    accountCategory: "cash_bank",
    cashType: "cash",
  }),
  account({
    _id: "acc-cash2",
    code: "1102",
    name: "Kas Cabang Dua",
    accountCategory: "cash_bank",
    cashType: "cash",
  }),
  account({
    _id: "acc-bca",
    code: "1103",
    name: "Bank BCA",
    accountCategory: "cash_bank",
    cashType: "bank",
  }),
  account({
    _id: "acc-listrik",
    code: "5401",
    name: "Beban Listrik",
    accountCategory: "biaya",
  }),
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
  // Read on every edit now — it is what the Akun Kas/Bank picker is built from.
  asMock(chartOfAccountsService.tree).mockResolvedValue(CHART);
  asMock(businessLineService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
});

/** Open a picker anywhere on screen and choose one of its options. */
async function pick(
  user: ReturnType<typeof userEvent.setup>,
  trigger: string,
  option: string,
) {
  const button = await screen.findByRole("button", { name: trigger });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await user.click(await screen.findByRole("option", { name: option }));
}

async function openAccounts(user: ReturnType<typeof userEvent.setup>) {
  const dialog = within(await screen.findByRole("dialog"));
  const trigger = await dialog.findByRole("button", { name: "Akun Kas/Bank" });
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
  return dialog;
}

describe("CashTransactionEditDialog — the same-class cash side", () => {
  it("offers only kas accounts for a kas transaction", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog(cashTx());

    await openAccounts(user);

    expect(
      await screen.findByRole("option", { name: "1102 · Kas Cabang Dua" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "1101 · Kas" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "1103 · Bank BCA" }),
    ).not.toBeInTheDocument();
    // And nothing that is not a Kas & Bank account at all.
    expect(
      screen.queryByRole("option", { name: /Beban Listrik/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Hanya akun kas/)).toBeInTheDocument();
  });

  it("offers only bank accounts for a bank transaction", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog(
      cashTx({
        number: "BBM/CBS/2609/0005",
        cashAccountId: "acc-bca",
        cashAccountCode: "1103",
        cashAccountName: "Bank BCA",
        channelId: "ch-bca",
        channelType: "transfer",
        channelName: "BCA Operasional",
      }),
    );

    await openAccounts(user);

    expect(
      await screen.findByRole("option", { name: "1103 · Bank BCA" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "1101 · Kas" }),
    ).not.toBeInTheDocument();
  });

  /**
   * A shift is reconciled against the buttons a cashier pressed, so a till row
   * is moved by its CHANNEL — the thing that was actually wrong — and never onto
   * a bare account. The server refuses the other way round.
   */
  it("keeps the channel picker for a payment recorded at the till", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog(cashTx({ recordedVia: "pos" }));

    const dialog = within(await screen.findByRole("dialog"));
    await waitFor(() => expect(paymentChannelService.list).toHaveBeenCalled());
    expect(
      dialog.queryByRole("button", { name: "Akun Kas/Bank" }),
    ).not.toBeInTheDocument();

    await user.click(dialog.getByRole("button", { name: "Channel" }));
    expect(
      await screen.findByRole("option", { name: "Kas Cabang Dua" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "BCA Operasional" }),
    ).not.toBeInTheDocument();
  });

  it("asks only for channels usable in the transaction's direction at its branch", async () => {
    renderDialog(
      cashTx({ direction: "out", kind: "supplier_payment", recordedVia: "pos" }),
    );

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

  /** Nothing to reconcile at a till, so no channel list is asked for at all. */
  it("does not read the channel list for a back-office transaction", async () => {
    renderDialog(cashTx());

    await screen.findByRole("button", { name: "Akun Kas/Bank" });
    expect(paymentChannelService.list).not.toHaveBeenCalled();
  });
});

describe("CashTransactionEditDialog — saving", () => {
  it("says the number stays and names what causes a reversal, and waits for a change", async () => {
    renderDialog(cashTx());

    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/tetap sama/)).toBeInTheDocument();
    // The fields that DO reverse are named, rather than promising it for any
    // edit at all.
    expect(
      dialog.getByText(/akun, nominal, tanggal, atau no. referensi/i),
    ).toBeInTheDocument();
    expect(dialog.getByText("dibalik")).toBeInTheDocument();
    expect(dialog.getByText("Belum ada yang diubah")).toBeInTheDocument();
    expect(
      dialog.getByRole("button", { name: "Simpan transaksi" }),
    ).toBeDisabled();
  });

  /*
    THE NOTICE SAYS WHAT THIS EDIT WILL DO, not what an edit does in general.
    The unconditional copy was written when every edit reversed; since a
    note-only edit posts nothing, it would promise two journal entries for
    correcting a typo.
  */
  it("promises no journal at all once only the note has changed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog(cashTx());

    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText(/Catatan/), " sore");

    expect(
      dialog.getByText(/buku besar tidak pernah mencatat catatan/i),
    ).toBeInTheDocument();
    expect(dialog.queryByText("dibalik")).not.toBeInTheDocument();
    expect(dialog.queryByText("diposting ulang")).not.toBeInTheDocument();
  });

  /* `ref` IS the ledger's — the server writes it into the cash line's memo. */
  it("goes back to promising a reversal when the reference changes too", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderDialog(cashTx());

    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText(/Catatan/), " sore");
    await user.type(dialog.getByLabelText(/No. referensi/), "TRF-99");

    expect(dialog.getByText("dibalik")).toBeInTheDocument();
    expect(dialog.getByText("diposting ulang")).toBeInTheDocument();
    // The reversal wording keeps its closing sentence about notes — it is the
    // rule, not a claim about this edit — so the distinguishing phrase is the
    // one the note-only branch owns.
    expect(
      dialog.queryByText(/buku besar tidak pernah mencatat catatan/i),
    ).not.toBeInTheDocument();
  });

  it("sends only what changed, with the reason", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const updated = cashTx({
      cashAccountId: "acc-cash2",
      cashAccountName: "Kas Cabang Dua",
    });
    asMock(cashTransactionService.update).mockResolvedValue(updated);

    renderDialog(cashTx());
    const dialog = await openAccounts(user);
    await user.click(
      await screen.findByRole("option", { name: "1102 · Kas Cabang Dua" }),
    );
    await user.type(dialog.getByLabelText(/Alasan perubahan/), "Salah laci");
    await user.click(dialog.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.update).toHaveBeenCalledWith("ct1", {
        accountId: "acc-cash2",
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
            allocationId: null,
            allocationName: null,
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
        // `allocationId: null` — the account carries no Detil Akun to pick from.
        lines: [
          {
            accountId: "acc-listrik",
            amount: "80000",
            businessLineId: null,
            allocationId: null,
          },
        ],
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

/**
 * THE SAME FORM, ON A PAGE (20 September 2026, on request). Only the chrome
 * differs — the buttons move to a `FormActionBar` at the head of the form, per
 * §16, and there is no overlay to scroll inside.
 */
describe("CashTransactionEditScreen — the form as a page", () => {
  it("loads the transaction and saves it, then returns to the detail", async () => {
    const user = userEvent.setup();
    asMock(cashTransactionService.getById).mockResolvedValue(cashTx());
    asMock(cashTransactionService.update).mockResolvedValue(cashTx());

    renderWithAuth(<CashTransactionEditScreen transactionId="ct1" />);

    // No dialog anywhere — the point of the change.
    expect(
      await screen.findByRole("heading", { name: /Ubah uang masuk/ }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // The bar is at the HEAD of the form and says why Simpan is off.
    expect(screen.getByText(/Belum ada yang diubah/)).toBeInTheDocument();

    await pick(user, "Akun Kas/Bank", "1102 · Kas Cabang Dua");
    await user.click(screen.getByRole("button", { name: "Simpan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.update).toHaveBeenCalledWith("ct1", {
        accountId: "acc-cash2",
      }),
    );
    expect(mockPush).toHaveBeenCalledWith(
      "/dashboard/keuangan/kas-bank/transaksi/ct1",
    );
  });

  it("returns to the detail on Batal, without writing", async () => {
    const user = userEvent.setup();
    asMock(cashTransactionService.getById).mockResolvedValue(cashTx());

    renderWithAuth(<CashTransactionEditScreen transactionId="ct1" />);

    await user.click(await screen.findByRole("button", { name: "Batal" }));

    expect(mockPush).toHaveBeenCalledWith(
      "/dashboard/keuangan/kas-bank/transaksi/ct1",
    );
    expect(cashTransactionService.update).not.toHaveBeenCalled();
  });
});
