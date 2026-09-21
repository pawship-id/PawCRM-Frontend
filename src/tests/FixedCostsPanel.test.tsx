import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { KasBankScreen } from "@/features/accounting";
import { branchService } from "@/services/branch.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { fixedCostService } from "@/services/fixedCost.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { paymentChannelService } from "@/services/paymentChannel.service";
import type { FixedCost } from "@/types/accounting";

import { cashPage, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/fixedCost.service");
// The repo's convention: sweetalert is not exercised in jsdom.
jest.mock("@/lib/swal", () => ({ swalToast: jest.fn() }));
jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/journalEntry.service");

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/dashboard/keuangan/kas-bank/biaya-tetap",
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * BIAYA TETAP — the second half of Kas & Bank.
 *
 * What these guard: the mockup's columns, that a template is never drawn as
 * money that has moved, that the backlog is stated as a COUNT rather than a
 * yes/no, and that Catat is a confirmed act gated by its own permission.
 */
const NOW = "2026-09-21T04:00:00.000Z";

const fixedCost = (overrides: Partial<FixedCost> = {}): FixedCost => ({
  _id: "fc1",
  name: "Sewa Toko Pusat",
  kind: "expense",
  direction: "out",
  branchId: "b1",
  branchName: "Pusat",
  accountId: "a1",
  accountName: "1102 · Bank BCA",
  counterAccounts: [{ id: "a2", code: "6-1002", name: "Beban Sewa" }],
  amount: "3500000.0000",
  lines: [
    {
      accountId: "a2",
      amount: "3500000.0000",
      businessLineId: null,
      allocationId: null,
      memo: "Beban Sewa",
    },
  ],
  partyType: null,
  partyId: null,
  partyName: "Pemilik Ruko",
  cashflowType: "operating",
  ref: null,
  note: null,
  interval: "monthly",
  startDate: "2026-09-01T00:00:00.000Z",
  nextDueAt: "2026-10-01T00:00:00.000Z",
  postedCount: 1,
  lastPostedAt: "2026-09-01T00:00:00.000Z",
  lastTransactionId: "ct1",
  isActive: true,
  dueCount: 0,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  ...overrides,
});

const fixedCostPage = (items: FixedCost[]) => ({
  items,
  pagination: { page: 1, limit: 25, total: items.length, totalPages: 1 },
  totals: {
    in: { amount: "1200000.0000", count: 1 },
    out: { amount: "18850000.0000", count: 3 },
  },
});

beforeEach(() => {
  jest.clearAllMocks();

  asMock(fixedCostService.list).mockResolvedValue(
    fixedCostPage([fixedCost()]) as never,
  );
  asMock(cashTransactionService.list).mockResolvedValue(cashPage([]) as never);
  asMock(branchService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  } as never);
  asMock(paymentChannelService.list).mockResolvedValue(channelPage([]) as never);
  asMock(chartOfAccountsService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  } as never);
  /*
    The account table above both sub-tabs folds balances and movement out of the
    ledger. It is not this file's subject — answered empty so the panel below it
    is what the assertions are about.
  */
  asMock(journalEntryService.balances).mockResolvedValue({
    asOf: null,
    timezone: "Asia/Jakarta",
    accounts: [],
  } as never);
  asMock(journalEntryService.movement).mockResolvedValue({
    period: { dateFrom: null, dateTo: null, timezone: "Asia/Jakarta" },
    accounts: [],
  } as never);
});

const openTab = () =>
  renderWithAuth(<KasBankScreen now={NOW} section="biaya-tetap" />);

describe("Biaya Tetap — the table", () => {
  it("lays a row out in the mockup's columns", async () => {
    openTab();

    const row = (await screen.findByText("Sewa Toko Pusat")).closest("tr")!;
    const cells = within(row).getAllByRole("cell");

    expect(cells).toHaveLength(7);
    expect(cells[0]).toHaveTextContent("Keluar");
    expect(cells[1]).toHaveTextContent("Sewa Toko Pusat");
    // The interval and the party under the name, as the Transaksi table does.
    expect(cells[1]).toHaveTextContent("Bulanan");
    expect(cells[1]).toHaveTextContent("Pemilik Ruko");
    expect(cells[2]).toHaveTextContent("Beban Sewa");
    expect(cells[3]).toHaveTextContent("Rp 3.500.000");
    expect(cells[4]).toHaveTextContent("1 Okt 2026");
    expect(cells[5]).toHaveTextContent("1102 · Bank BCA");
    expect(cells[6]).toHaveTextContent("Aktif");
  });

  /*
    NOTHING HERE HAS MOVED. A signed amount would read as money that went out,
    and this column is "how much it will be".
  */
  it("draws the amount unsigned, unlike the transactions table", async () => {
    openTab();

    const row = (await screen.findByText("Sewa Toko Pusat")).closest("tr")!;
    const amount = within(row).getAllByRole("cell")[3];

    expect(amount).toHaveTextContent("Rp 3.500.000");
    expect(amount.textContent).not.toMatch(/[+−-]/);
  });

  /* One is named; several are counted, or a cell misfiles the rest. */
  it("counts the categories when a schedule names more than one", async () => {
    asMock(fixedCostService.list).mockResolvedValue(
      fixedCostPage([
        fixedCost({
          counterAccounts: [
            { id: "a2", code: "6-1001", name: "Beban Gaji" },
            { id: "a3", code: "6-1006", name: "Beban Admin" },
          ],
        }),
      ]) as never,
    );
    openTab();

    const row = (await screen.findByText("Sewa Toko Pusat")).closest("tr")!;
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("2 akun");
  });

  it("mutes a paused schedule and offers it no Catat button", async () => {
    asMock(fixedCostService.list).mockResolvedValue(
      fixedCostPage([
        fixedCost({ isActive: false, dueCount: 0 }),
      ]) as never,
    );
    openTab();

    const row = (await screen.findByText("Sewa Toko Pusat")).closest("tr")!;
    expect(within(row).getByText("Nonaktif")).toBeInTheDocument();
    expect(
      within(row).queryByRole("button", { name: "Catat" }),
    ).not.toBeInTheDocument();
  });
});

describe("Biaya Tetap — what is due", () => {
  /*
    THE BACKLOG IS A COUNT, not a flag. A rent entered three months late owes
    three payments, and a row reading only "jatuh tempo" would let two of them
    disappear the moment the first was recorded.
  */
  it("says how many occurrences are waiting, not merely that one is", async () => {
    asMock(fixedCostService.list).mockResolvedValue(
      fixedCostPage([fixedCost({ dueCount: 3 })]) as never,
    );
    openTab();

    const row = (await screen.findByText("Sewa Toko Pusat")).closest("tr")!;
    expect(within(row).getByText("3× belum dicatat")).toBeInTheDocument();
  });

  it("says jatuh tempo for a single outstanding occurrence", async () => {
    asMock(fixedCostService.list).mockResolvedValue(
      fixedCostPage([fixedCost({ dueCount: 1 })]) as never,
    );
    openTab();

    const row = (await screen.findByText("Sewa Toko Pusat")).closest("tr")!;
    expect(within(row).getByText("Jatuh tempo")).toBeInTheDocument();
  });

  /* A button that can only be pressed to be refused is worse than no button. */
  it("offers no Catat button while nothing is due", async () => {
    openTab();

    const row = (await screen.findByText("Sewa Toko Pusat")).closest("tr")!;
    expect(
      within(row).queryByRole("button", { name: "Catat" }),
    ).not.toBeInTheDocument();
  });
});

describe("Biaya Tetap — recording an occurrence", () => {
  beforeEach(() => {
    asMock(fixedCostService.list).mockResolvedValue(
      fixedCostPage([fixedCost({ dueCount: 1 })]) as never,
    );
    asMock(fixedCostService.post).mockResolvedValue({
      fixedCost: fixedCost({ dueCount: 0, postedCount: 2 }),
      transaction: { _id: "ct9", number: "BBK/CBS/2610/0001" },
    } as never);
  });

  /*
    A CONFIRM, NOT A ONE-CLICK BUTTON. This writes a numbered transaction with
    a journal entry behind it and cannot be undone from this screen.
  */
  it("states the amount and the date before recording anything", async () => {
    const user = userEvent.setup();
    openTab();

    await user.click(await screen.findByRole("button", { name: "Catat" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Rp 3.500.000");
    expect(dialog).toHaveTextContent("1 Okt 2026");
    expect(fixedCostService.post).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Catat sekarang" }),
    );

    await waitFor(() =>
      expect(fixedCostService.post).toHaveBeenCalledWith("fc1"),
    );
  });

  /* One press records ONE occurrence — a shop three months behind must not be
     left thinking the button cleared all three. */
  it("warns that a backlog takes more than one press", async () => {
    asMock(fixedCostService.list).mockResolvedValue(
      fixedCostPage([fixedCost({ dueCount: 3 })]) as never,
    );
    const user = userEvent.setup();
    openTab();

    await user.click(await screen.findByRole("button", { name: "Catat" }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Ada 3 jatuh tempo yang belum dicatat",
    );
  });

  it("keeps the dialog open and says why when the server refuses", async () => {
    asMock(fixedCostService.post).mockRejectedValue(
      new Error("Occurrence already recorded"),
    );
    const user = userEvent.setup();
    openTab();

    await user.click(await screen.findByRole("button", { name: "Catat" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Catat sekarang" }),
    );

    expect(
      await within(dialog).findByText(/Gagal mencatat biaya tetap/),
    ).toBeInTheDocument();
  });
});

describe("Biaya Tetap — grants", () => {
  /*
    `post` IS ITS OWN GRANT. Everything else edits a plan; this writes a real
    transaction, and a bookkeeper may keep the schedule without being the
    person who pays from it.
  */
  it("withholds Catat from a reader who may not post", async () => {
    asMock(fixedCostService.list).mockResolvedValue(
      fixedCostPage([fixedCost({ dueCount: 1 })]) as never,
    );

    renderWithAuth(<KasBankScreen now={NOW} section="biaya-tetap" />, {
      isSuperAdmin: false,
      permissions: [
        { feature: "fixedCosts", actions: ["read"] },
        { feature: "cashTransactions", actions: ["read"] },
      ],
    });

    await screen.findByText("Sewa Toko Pusat");
    expect(
      screen.queryByRole("button", { name: "Catat" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Tambah biaya tetap/ }),
    ).not.toBeInTheDocument();
  });

  it("tells a role with no grant at all where to ask", async () => {
    renderWithAuth(<KasBankScreen now={NOW} section="biaya-tetap" />, {
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });

    expect(
      await screen.findByText(/belum punya akses ke daftar biaya tetap/i),
    ).toBeInTheDocument();
    expect(fixedCostService.list).not.toHaveBeenCalled();
  });
});
