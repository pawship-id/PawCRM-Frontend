import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CashTransactionDetail } from "@/features/cash-transactions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { paymentChannelService } from "@/services/paymentChannel.service";

import { cashTx, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * ONE TRANSACTION. What it guards: the number is the heading (and something
 * still names one that has none), the document and journal link out, Ubah and
 * Batalkan follow both the grant and the transaction's state, and cancelling
 * sends the reason and renders what the write returned.
 */
const renderPage = (options?: Parameters<typeof renderWithAuth>[1]) =>
  renderWithAuth(<CashTransactionDetail transactionId="ct1" />, options);

beforeEach(() => {
  jest.clearAllMocks();
  asMock(cashTransactionService.getById).mockResolvedValue(cashTx());
  asMock(paymentChannelService.list).mockResolvedValue(channelPage([]));
});

describe("CashTransactionDetail — what it shows", () => {
  it("names the transaction by its number and links its invoice and journal", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "BKM/CBS/2609/0001" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tercatat")).toBeInTheDocument();
    expect(screen.getByText("Kas Laci")).toBeInTheDocument();
    expect(screen.getByText("Back office")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /INV\/CBS\/2609\/0012/ }),
    ).toHaveAttribute("href", "/dashboard/sales/inv1");
    expect(
      screen.getByRole("link", { name: "JE-2026-09-0001" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je1");
    // No MDR on a cash receipt, so no net line either.
    expect(screen.queryByText("Masuk bersih")).not.toBeInTheDocument();
  });

  it("falls back to the kind and amount for migrated history with no number", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({ number: null }),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Penerimaan piutang Rp 150.000" }),
    ).toBeInTheDocument();
  });

  it("shows the MDR and what actually arrived when the channel took a cut", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({
        channelType: "qris",
        channelName: "QRIS BCA",
        mdrAmount: "1050.0000",
        netAmount: "148950.0000",
      }),
    );

    renderPage();

    expect(await screen.findByText("Masuk bersih")).toBeInTheDocument();
    expect(screen.getByText("Rp 1.050")).toBeInTheDocument();
    expect(screen.getByText("Rp 148.950")).toBeInTheDocument();
  });

  it("shows what was handed over and the change for cash taken at the till", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({
        recordedVia: "pos",
        channelType: "cash",
        amount: "210000.0000",
        netAmount: "210000.0000",
        tenderedAmount: "260000.0000",
        changeAmount: "50000.0000",
      }),
    );

    renderPage();

    const handedOver = await screen.findByText("Diserahkan");
    expect(handedOver.parentElement).toHaveTextContent("Rp 260.000");
    expect(screen.getByText("Kembalian").parentElement).toHaveTextContent(
      "Rp 50.000",
    );
  });

  it("shows neither for a payment recorded in the back office", async () => {
    renderPage();

    await screen.findByText("Rincian transaksi");
    expect(screen.queryByText("Diserahkan")).not.toBeInTheDocument();
    expect(screen.queryByText("Kembalian")).not.toBeInTheDocument();
  });

  it("links a supplier payment to its payable", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({
        number: "BBK/CBS/2609/0002",
        direction: "out",
        kind: "supplier_payment",
        document: { type: "purchase_invoice", id: "pi1", number: "INV/2026/VIII/0142" },
        party: { type: "supplier", id: "s1", name: "PT Pakan" },
      }),
    );

    renderPage();

    expect(
      await screen.findByRole("link", { name: /INV\/2026\/VIII\/0142/ }),
    ).toHaveAttribute("href", "/dashboard/purchasing/payables/pi1");
  });

  it("lists an expense's account lines, with Bersama for no business line", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({
        number: "BKK/CBS/2609/0003",
        direction: "out",
        kind: "expense",
        document: null,
        party: null,
        amount: "75000.0000",
        lines: [
          {
            accountId: "acc-listrik",
            accountCode: "5401",
            accountName: "Beban Listrik",
            amount: "75000.0000",
            businessLineId: null,
            businessLineName: null,
            memo: "Agustus",
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText("Beban Listrik")).toBeInTheDocument();
    expect(screen.getByText("Bersama (HQ)")).toBeInTheDocument();
    expect(screen.getByText("Agustus")).toBeInTheDocument();
  });

  it("keeps every earlier version with what it said and both journal links", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({
        revisions: [
          {
            at: "2026-09-10T08:00:00.000Z",
            by: "u2",
            byName: "Jess",
            reason: "Salah tanggal",
            before: {
              at: "2026-09-09T03:00:00.000Z",
              amount: "120000.0000",
              channelId: "ch-cash",
              channelName: "Kas Laci",
              ref: "TRF-9",
              note: null,
            },
            journalEntryId: "je0",
            journalEntryNumber: "JE-2026-09-0000",
            reversalJournalEntryId: "je0r",
            reversalJournalEntryNumber: "JE-2026-09-0002",
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText("Riwayat perubahan")).toBeInTheDocument();
    expect(screen.getByText("Alasan: Salah tanggal")).toBeInTheDocument();
    expect(screen.getByText(/Rp 120\.000/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "JE-2026-09-0000" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je0");
    expect(
      screen.getByRole("link", { name: "JE-2026-09-0002" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je0r");
  });
});

describe("CashTransactionDetail — Ubah and Batalkan", () => {
  it("offers both to a role holding both grants", async () => {
    renderPage();

    expect(await screen.findByRole("button", { name: "Ubah" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Batalkan transaksi" }),
    ).toBeInTheDocument();
  });

  it("offers neither to a role that may only read", async () => {
    renderPage({
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });

    await screen.findByRole("heading", { name: "BKM/CBS/2609/0001" });
    expect(screen.queryByRole("button", { name: "Ubah" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batalkan transaksi" }),
    ).not.toBeInTheDocument();
  });

  it("gates each on its own grant", async () => {
    renderPage({
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read", "update"] }],
    });

    expect(await screen.findByRole("button", { name: "Ubah" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batalkan transaksi" }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["a cancelled transaction", { status: "void" as const, isVoided: true }],
    ["migrated history", { legacy: true }],
    ["a till refund", { kind: "pos_refund" as const, direction: "out" as const }],
  ])("hides both on %s", async (_label, overrides) => {
    asMock(cashTransactionService.getById).mockResolvedValue(cashTx(overrides));

    renderPage();

    await screen.findByRole("heading", { name: "BKM/CBS/2609/0001" });
    expect(screen.queryByRole("button", { name: "Ubah" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batalkan transaksi" }),
    ).not.toBeInTheDocument();
  });

  it("shows who cancelled it, why, and the reversing entry", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({
        status: "void",
        isVoided: true,
        voidedAt: "2026-09-11T02:00:00.000Z",
        voidedByName: "Jess",
        voidReason: "Dobel input",
        reversalJournalEntryId: "je-rev",
        reversalJournalEntryNumber: "JE-2026-09-0009",
      }),
    );

    renderPage();

    expect(await screen.findByText("Alasan: Dobel input")).toBeInTheDocument();
    expect(screen.getByText(/oleh Jess/)).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "JE-2026-09-0009" })[0],
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je-rev");
  });
});

describe("CashTransactionDetail — cancelling", () => {
  async function openCancel(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Batalkan transaksi" }),
    );
    return within(await screen.findByRole("dialog"));
  }

  it("requires a reason before spending a round trip", async () => {
    const user = userEvent.setup();
    renderPage();
    const dialog = await openCancel(user);

    await user.click(dialog.getByRole("button", { name: "Batalkan transaksi" }));

    expect(await dialog.findByText(/Isi alasannya/)).toBeInTheDocument();
    expect(cashTransactionService.cancel).not.toHaveBeenCalled();
  });

  it("posts the reason and renders the cancelled transaction it gets back", async () => {
    const user = userEvent.setup();
    asMock(cashTransactionService.cancel).mockResolvedValue(
      cashTx({
        status: "void",
        isVoided: true,
        voidReason: "Dobel input",
        voidedByName: "Owner",
        voidedAt: "2026-09-11T02:00:00.000Z",
      }),
    );

    renderPage();
    const dialog = await openCancel(user);

    // "Kembali", not "Batal", beside the destructive button.
    expect(dialog.getByRole("button", { name: "Kembali" })).toBeInTheDocument();

    await user.type(dialog.getByLabelText(/Alasan pembatalan/), "Dobel input");
    await user.click(dialog.getByRole("button", { name: "Batalkan transaksi" }));

    await waitFor(() =>
      expect(cashTransactionService.cancel).toHaveBeenCalledWith("ct1", {
        reason: "Dobel input",
      }),
    );
    expect(swalToast).toHaveBeenCalledWith(
      "Transaksi BKM/CBS/2609/0001 dibatalkan.",
    );
    expect(await screen.findByText("Alasan: Dobel input")).toBeInTheDocument();
    expect(screen.getByText("Dibatalkan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Batalkan transaksi" }),
    ).not.toBeInTheDocument();
    expect(cashTransactionService.getById).toHaveBeenCalledTimes(1);
  });

  it("keeps the server's refusal on screen in the dialog", async () => {
    const user = userEvent.setup();
    asMock(cashTransactionService.cancel).mockRejectedValue(
      new ApiError("The shift this cash belongs to is closed", 409),
    );

    renderPage();
    const dialog = await openCancel(user);

    await user.type(dialog.getByLabelText(/Alasan pembatalan/), "Salah laci");
    await user.click(dialog.getByRole("button", { name: "Batalkan transaksi" }));

    expect(
      await dialog.findByText(/shift this cash belongs to is closed/),
    ).toBeInTheDocument();
  });
});
