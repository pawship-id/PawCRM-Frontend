import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { KasBankScreen } from "@/features/accounting";
import { branchService } from "@/services/branch.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { paymentChannelService } from "@/services/paymentChannel.service";

import type { ChartOfAccount } from "@/types/accounting";

import { cashPage, channel, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/journalEntry.service");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
  usePathname: () => "/dashboard/keuangan/kas-bank",
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * KAS & BANK — the half of the page above the sub-tabs: three cards, the ACCOUNT
 * table, and one context bar driving all of it.
 *
 * THE TABLE LISTS LEDGER ACCOUNTS AS OF 20 SEPTEMBER 2026, not payment channels.
 * The assertions that used to cover the shared-balance rule are gone with the
 * problem: two channels could point at one account, so a saldo had to be printed
 * once and cross-referenced on the rest. Rows that are accounts each carry their
 * own, which is why this suite now asserts the opposite — that the column adds
 * up, and that an account nothing moved through still gets a row.
 *
 * WHAT IS WORTH ASSERTING here rather than in the transaction list's own suite
 * (CashTransactionsScreen.test.tsx): that the money figures come from the
 * server's aggregates rather than a sum of the rows, and that one period drives
 * every read on the page.
 */
const NOW = "2026-09-16T04:00:00.000Z";

/**
 * Three accounts filed under Kas & Bank, one of which had a quiet month.
 *
 * TWO CHANNELS STILL POINT AT 1101 in the fixture below — that has not stopped
 * being true, it has stopped being the table's problem. The channels are here
 * only because the transaction panel's own filter reads them.
 */
const account = (
  over: Partial<ChartOfAccount> & Pick<ChartOfAccount, "_id" | "code" | "name">,
): ChartOfAccount =>
  ({
    accountType: "asset",
    accountCategory: "cash_bank",
    parentAccountId: null,
    allocations: [],
    isDefault: true,
    isActive: true,
    ...over,
  }) as ChartOfAccount;

const ACC_KAS = account({ _id: "acc-1101", code: "1101", name: "Kas" });
const ACC_BANK = account({ _id: "acc-1102", code: "1102", name: "Bank" });
/** Opened this month and not used yet — the row a ledger fold cannot produce. */
const ACC_QRIS = account({
  _id: "acc-1103",
  code: "1103",
  name: "QRIS Settlement",
});

const KAS_PUSAT = channel({
  _id: "ch-kas-pusat",
  name: "Kas Pusat",
  type: "cash",
  accountId: "acc-1101",
  branchId: "b1",
});
const KAS_BARAT = channel({
  _id: "ch-kas-barat",
  name: "Kas Cabang Barat",
  type: "cash",
  accountId: "acc-1101",
  branchId: "b2",
});
const BANK = channel({
  _id: "ch-bank",
  name: "Bank BCA",
  type: "transfer",
  accountId: "acc-1102",
});

const TOTALS = {
  in: { amount: "166300000.0000", count: 70 },
  out: { amount: "111200000.0000", count: 38 },
};

/** A trial-balance row: only `balance` is read, the rest is contract. */
const balanceRow = (accountId: string, balance: string) => ({
  accountId,
  code: "",
  name: "",
  accountType: "asset" as const,
  accountCategory: "cash_bank" as const,
  normalBalance: "debit" as const,
  debit: "0",
  credit: "0",
  balance,
});

/** A movement row — `masuk`/`keluar` are what the table prints. */
const movementRow = (accountId: string, masuk: string, keluar: string) => ({
  ...balanceRow(accountId, "0"),
  debit: masuk,
  credit: keluar,
  masuk,
  keluar,
});

beforeEach(() => {
  jest.clearAllMocks();

  asMock(cashTransactionService.list).mockResolvedValue(cashPage([], TOTALS));
  asMock(paymentChannelService.list).mockResolvedValue(
    channelPage([KAS_PUSAT, KAS_BARAT, BANK]),
  );
  asMock(journalEntryService.balances).mockResolvedValue({
    asOf: null,
    timezone: "Asia/Jakarta",
    accounts: [
      balanceRow("acc-1101", "62400000.0000"),
      balanceRow("acc-1102", "84900000.0000"),
      // acc-1103 is ABSENT — nothing has ever posted to it.
    ],
  });
  asMock(journalEntryService.movement).mockResolvedValue({
    period: { dateFrom: null, dateTo: null, timezone: "Asia/Jakarta" },
    accounts: [
      movementRow("acc-1101", "48200000.0000", "31900000.0000"),
      movementRow("acc-1102", "72400000.0000", "41800000.0000"),
      // acc-1103 again — an account with no line in the period has nothing to
      // fold, which a caller reads as zero rather than as missing.
    ],
  });
  asMock(chartOfAccountsService.list).mockResolvedValue({
    items: [ACC_KAS, ACC_BANK, ACC_QRIS],
    pagination: { page: 1, limit: 100, total: 3, totalPages: 1 },
  });
  asMock(branchService.list).mockResolvedValue({
    items: [
      { _id: "b1", name: "Cabang Pusat" },
      { _id: "b2", name: "Cabang Barat" },
    ] as never,
    pagination: { page: 1, limit: 100, total: 2, totalPages: 1 },
  });
});

/** The table paints after its three reads settle, so every lookup awaits it. */
const rowFor = async (name: string) =>
  within((await screen.findByText(name)).closest("tr")!);

describe("Kas & Bank — the cards", () => {
  it("shows the server's whole-filter totals and the net between them", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    expect(await screen.findByText("Rp 166.300.000")).toBeInTheDocument();
    expect(screen.getByText("Rp 111.200.000")).toBeInTheDocument();
    // Derived from the two aggregates, never summed over the rows on the page.
    expect(screen.getByText("Rp 55.100.000")).toBeInTheDocument();
  });
});

describe("Kas & Bank — the account table", () => {
  it("puts each account's movement beside its balance", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    const row = await rowFor("Kas");
    expect(row.getByText("1101")).toBeInTheDocument();
    expect(row.getByText("Rp 48.200.000")).toBeInTheDocument();
    expect(row.getByText("Rp 31.900.000")).toBeInTheDocument();
    expect(row.getByText("Rp 62.400.000")).toBeInTheDocument();
  });

  /**
   * WHICH ACCOUNTS APPEAR IS A CATEGORY QUESTION, not a list of codes. A tenant
   * that opens a third bank account files it under Kas & Bank and it is here —
   * the hardcoded `["1101", "1102"]` this replaces left such an account's money
   * silently out of the figure the shop reads first.
   */
  it("asks the chart for the cash & bank category, not for named codes", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await rowFor("Kas");

    expect(chartOfAccountsService.list).toHaveBeenCalledWith(
      expect.objectContaining({ accountCategory: "cash_bank" }),
    );
  });

  /**
   * THE JOIN'S DIRECTION, and the reason the chart is the row source. A ledger
   * fold returns accounts that MOVED; an account with a quiet month has no line
   * to fold and would simply vanish from a table built the other way round.
   */
  it("keeps an account nothing moved through, and reads it as zero", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    const row = await rowFor("QRIS Settlement");
    // Masuk, keluar and saldo — all three.
    expect(row.getAllByText("Rp 0")).toHaveLength(3);
  });

  /**
   * THE THING THE CHANNEL TABLE COULD NOT DO. Two channels pointing at one
   * account meant a saldo column that gave twice the shop's cash if you added it
   * up, so it was printed once and cross-referenced. Rows that are accounts add
   * up, and the footer is the proof.
   */
  it("totals every column, because no account is on the page twice", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await rowFor("Kas");

    const footer = within(
      screen.getByText("Total").closest("tr")!,
    );
    expect(footer.getByText("Rp 120.600.000")).toBeInTheDocument();
    expect(footer.getByText("Rp 73.700.000")).toBeInTheDocument();
    expect(footer.getByText("Rp 147.300.000")).toBeInTheDocument();
  });

  /**
   * The channels are a settings screen now. A link is left because the person
   * who came here looking for "Channel baru" has to be told where it went.
   */
  it("points at Pengaturan for the channels rather than listing them", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await rowFor("Kas");

    expect(screen.queryByText("Kas Pusat")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Channel pembayaran" }),
    ).toHaveAttribute("href", "/dashboard/pengaturan/channel-pembayaran");
  });
});

describe("Kas & Bank — one period for the whole page", () => {
  /**
   * THE CARDS, THE TABLE AND THE ROWS MUST BE ABOUT ONE MONTH. They come from
   * three different reads, so the context bar has to reach all three — a period
   * that moved the cards and not the table would be worse than no filter.
   *
   * `summaryByChannel` IS NO LONGER ONE OF THEM. It folded the period per
   * CHANNEL, which is what the old table's Masuk and Keluar columns were; the
   * account table asks the ledger for the same period folded per account
   * instead.
   */
  it("sends the period to the list, the movement and the balances", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("Rp 166.300.000");

    await userEvent.click(screen.getByRole("button", { name: "Bulan ini" }));

    // A movement is defined by its BOUNDS…
    await waitFor(() =>
      expect(journalEntryService.movement).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: "2026-09-01",
          dateTo: "2026-09-30",
        }),
      ),
    );
    expect(cashTransactionService.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ dateFrom: "2026-09-01", dateTo: "2026-09-30" }),
    );
    // …and a balance is a POSITION as of a date, so it takes the END of it.
    expect(journalEntryService.balances).toHaveBeenLastCalledWith(
      expect.objectContaining({ asOf: "2026-09-30" }),
    );
  });

  /**
   * NO LINI BISNIS. A rupiah in the till belongs to the shop, not to grooming or
   * retail — the control is left out rather than disabled, because one that
   * cannot narrow anything is worse than one that is not there.
   */
  it("offers no business-line filter", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("Rp 166.300.000");

    expect(screen.queryByLabelText("Filter lini bisnis")).not.toBeInTheDocument();
  });
});

describe("Kas & Bank — the sub-tabs", () => {
  it("offers Transaksi and Biaya Tetap, and opens on Transaksi", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    expect(
      await screen.findByRole("link", { name: "Transaksi" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/kas-bank");
    expect(screen.getByRole("link", { name: "Biaya Tetap" })).toHaveAttribute(
      "href",
      "/dashboard/keuangan/kas-bank/biaya-tetap",
    );
    // The list's own controls, which only the first sub-tab carries.
    expect(screen.getByLabelText("Cari transaksi")).toBeInTheDocument();
  });

  /**
   * The mockup counts the active recurring costs and names the next one due.
   * Nothing executes `recurring` yet, so every one of those figures would be
   * invented — and an invented figure on a finance screen is indistinguishable
   * from a real one.
   */
  it("badges Biaya Tetap as pending rather than inventing its figures", async () => {
    renderWithAuth(<KasBankScreen now={NOW} section="biaya-tetap" />);

    expect(await screen.findByText("Segera")).toBeInTheDocument();
    expect(screen.queryByLabelText("Cari transaksi")).not.toBeInTheDocument();
    // The cards and the table are the page's subject, so they stay on both.
    expect(screen.getByText("Rp 166.300.000")).toBeInTheDocument();
  });
});

describe("Kas & Bank — grants", () => {
  /**
   * THE MOVE MUST NOT TAKE THE LIST AWAY FROM ANYBODY. A role that could read
   * transactions and not channels used to have a tab of its own; now it shares
   * this page, and it must still get its half.
   */
  it("gives a transactions-only role the list without the account table", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });

    expect(await screen.findByLabelText("Cari transaksi")).toBeInTheDocument();
    expect(screen.queryByText("Akun Kas & Bank")).not.toBeInTheDocument();
    /*
      The TABLE's reads are the ones that do not fire. `/payment-channels` still
      does — the transaction panel's own Channel filter needs the options, and
      that request is made by `useCashTransactions`, not by the table.
    */
    expect(journalEntryService.movement).not.toHaveBeenCalled();
  });

  /**
   * THE GRANT MOVED WITH THE ROWS. This table reads the chart of accounts now,
   * so `chartOfAccounts:read` is what opens it — a role that could see channels
   * and nothing else no longer has a table here to see.
   */
  it("gives an accounts-only role the table without the cards or the list", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "chartOfAccounts", actions: ["read"] }],
    });

    expect(await screen.findByText("QRIS Settlement")).toBeInTheDocument();
    expect(screen.queryByText("Rp 166.300.000")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cari transaksi")).not.toBeInTheDocument();
  });
});
