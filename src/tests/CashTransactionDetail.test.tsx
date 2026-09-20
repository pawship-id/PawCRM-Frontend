import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CashTransactionDetail } from "@/features/cash-transactions";
import { swalToast } from "@/lib/swal";
import { ApiError } from "@/services/api-error";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { businessLineService } from "@/services/businessLine.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { JournalEntry } from "@/types/accounting";

import { cashTx, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/journalEntry.service");
jest.mock("@/services/businessLine.service");
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * ONE TRANSACTION. What it guards: the number is the heading (and something
 * still names one that has none), the document links out, the journal opens in
 * a dialog off the ≡ menu, Ubah and Batalkan follow both the grant and the
 * transaction's state, and cancelling sends the reason and renders what the
 * write returned.
 */
const renderPage = (options?: Parameters<typeof renderWithAuth>[1]) =>
  renderWithAuth(<CashTransactionDetail transactionId="ct1" />, options);

/** The entry `cashTx()` points at, as the Jurnal terkait dialog reads it. */
const ENTRY = {
  _id: "je1",
  entryNumber: "JE-2026-09-0001",
  date: "2026-09-10T03:00:00.000Z",
  description: "Penerimaan piutang",
  branchId: "b1",
  branchName: "Cabang Pusat",
  source: { type: "receipt", id: "ct1", reference: null },
  lines: [
    {
      accountId: "acc-cash",
      businessLineId: null,
      allocationId: null,
      debit: "150000.0000",
      credit: "0.0000",
      memo: null,
    },
    {
      accountId: "acc-ar",
      businessLineId: null,
      allocationId: null,
      debit: "0.0000",
      credit: "150000.0000",
      memo: null,
    },
  ],
  cashflowType: "operating",
  tags: [],
  attachmentUrl: null,
  recurring: { enabled: false, interval: null },
  reversedByEntryId: null,
  reversesEntryId: null,
  createdByName: "Rani",
  createdAt: "2026-09-10T03:00:00.000Z",
} as unknown as JournalEntry;

beforeEach(() => {
  jest.clearAllMocks();
  asMock(cashTransactionService.getById).mockResolvedValue(cashTx());
  asMock(paymentChannelService.list).mockResolvedValue(channelPage([]));
  asMock(journalEntryService.getById).mockResolvedValue(ENTRY);
  asMock(businessLineService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  asMock(chartOfAccountsService.tree).mockResolvedValue([
    {
      _id: "acc-cash",
      code: "1101",
      name: "Kas",
      accountType: "asset",
      accountCategory: "cash_bank",
      parentAccountId: null,
      allocations: [],
      isDefault: false,
      isActive: true,
      children: [],
    },
    {
      _id: "acc-ar",
      code: "1103",
      name: "Piutang Usaha",
      accountType: "asset",
      accountCategory: "piutang_dagang",
      parentAccountId: null,
      allocations: [],
      isDefault: false,
      isActive: true,
      children: [],
    },
  ]);
});

describe("CashTransactionDetail — what it shows", () => {
  it("names the transaction by its number and links its invoice and journal", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Uang masuk – BKM/CBS/2609/0001" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Tercatat")).toBeInTheDocument();
    // Akun Kas/Bank is the fact; the channel is how the money got there.
    expect(screen.getByText("Akun Kas/Bank").parentElement).toHaveTextContent(
      "1101 Kas · lewat Kas Laci",
    );
    expect(screen.getByText("Back office")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /INV\/CBS\/2609\/0012/ }),
    ).toHaveAttribute("href", "/dashboard/sales/inv1");
    // The journal is reached from the ≡ menu now, not from a card of its own —
    // see "opens the journal in a dialog" below.
    expect(
      screen.queryByRole("link", { name: "JE-2026-09-0001" }),
    ).not.toBeInTheDocument();
    // No MDR on a cash receipt, so no net line either.
    expect(screen.queryByText("Masuk bersih")).not.toBeInTheDocument();
  });

  it("falls back to the kind and amount for migrated history with no number", async () => {
    asMock(cashTransactionService.getById).mockResolvedValue(
      cashTx({ number: null }),
    );

    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Uang masuk – Penerimaan piutang Rp 150.000" }),
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

    await screen.findByText("Detail transaksi");
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
            allocationId: null,
            allocationName: null,
            memo: "Agustus",
          },
        ],
      }),
    );

    renderPage();

    expect(await screen.findByText("Beban Listrik")).toBeInTheDocument();
    expect(screen.getByText("Agustus")).toBeInTheDocument();
    // Once in the row, and once more as the header's summary of the rows.
    expect(screen.getAllByText("Bersama (HQ)")).toHaveLength(2);
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

/**
 * Batalkan moved into the ≡ menu with the mockup (20 September 2026), where the
 * mockup itself says "Hapus Transaksi" — the one word this system will not use,
 * because the row is reversed and kept, never removed.
 */
async function openActions(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Tindakan lain" }),
  );
  return screen.findByRole("menu");
}

describe("CashTransactionDetail — Ubah and Batalkan", () => {
  it("offers both to a role holding both grants", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();

    // A LINK, not a button: Ubah opens a page of its own now.
    expect(await screen.findByRole("link", { name: "Ubah" })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/kas-bank/transaksi/ct1/edit",
    );

    await openActions(user);
    expect(
      screen.getByRole("menuitem", { name: /Batalkan transaksi/ }),
    ).toBeInTheDocument();
    // Never the mockup's word — see the component's header.
    expect(screen.queryByText(/Hapus/)).not.toBeInTheDocument();
  });

  /**
   * THE ENTRY IS READ WITHOUT LEAVING THE PAGE — four lines and a total answer
   * "did this land on the right accounts", and the number is the way through to
   * the rest of it.
   */
  it("opens the journal in a dialog, with the number linking out", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage();
    await openActions(user);

    await user.click(
      screen.getByRole("menuitem", { name: /Lihat jurnal terkait/ }),
    );

    const dialog = within(await screen.findByRole("dialog"));
    expect(
      await dialog.findByRole("link", { name: "JE-2026-09-0001" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/journal-entries/je1");

    // Both sides, named from the chart, and a balanced total.
    expect(dialog.getByText("Kas")).toBeInTheDocument();
    expect(dialog.getByText("Piutang Usaha")).toBeInTheDocument();
    expect(dialog.getAllByText("Rp 150.000")).toHaveLength(4);
    expect(journalEntryService.getById).toHaveBeenCalledWith("je1");
  });

  /**
   * DISABLED, NOT ABSENT, for a reader who may change the transaction but not
   * open the ledger — a menu that changes shape per role is one people have to
   * read every time.
   */
  it("disables the journal item for a reader who may not open the ledger", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage({
      isSuperAdmin: false,
      permissions: [
        { feature: "cashTransactions", actions: ["read", "update", "void"] },
      ],
    });

    await openActions(user);

    expect(
      screen.getByRole("menuitem", { name: /Lihat jurnal terkait/ }),
    ).toHaveAttribute("aria-disabled", "true");
    // The one it may still do is there and enabled.
    expect(
      screen.getByRole("menuitem", { name: /Batalkan transaksi/ }),
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("offers neither to a role that may only read", async () => {
    renderPage({
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });

    const user = userEvent.setup({ pointerEventsCheck: 0 });
    await screen.findByRole("heading", { name: "Uang masuk – BKM/CBS/2609/0001" });
    expect(screen.queryByRole("link", { name: "Ubah" })).not.toBeInTheDocument();

    // The menu still opens — the journal is not gated on writing — and carries
    // nothing that would change the transaction.
    await openActions(user);
    expect(
      screen.queryByRole("menuitem", { name: /Batalkan transaksi/ }),
    ).not.toBeInTheDocument();
  });

  it("gates each on its own grant", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderPage({
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read", "update"] }],
    });

    expect(await screen.findByRole("link", { name: "Ubah" })).toBeInTheDocument();
    await openActions(user);
    expect(
      screen.queryByRole("menuitem", { name: /Batalkan transaksi/ }),
    ).not.toBeInTheDocument();
  });

  it.each([
    ["a cancelled transaction", { status: "void" as const, isVoided: true }],
    ["migrated history", { legacy: true }],
    ["a till refund", { kind: "pos_refund" as const, direction: "out" as const }],
  ])("hides both on %s", async (_label, overrides) => {
    asMock(cashTransactionService.getById).mockResolvedValue(cashTx(overrides));

    renderPage();

    // The refund case flips the direction, so the heading is matched on the
    // number rather than the whole of it.
    await screen.findByRole("heading", { name: /BKM\/CBS\/2609\/0001/ });
    expect(screen.queryByRole("link", { name: "Ubah" })).not.toBeInTheDocument();
    // Locked: the whole action area is gone, menu included.
    expect(
      screen.queryByRole("button", { name: "Tindakan lain" }),
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
    await openActions(user);
    await user.click(
      screen.getByRole("menuitem", { name: /Batalkan transaksi/ }),
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
