import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { cashTransactionsQueryFromParams } from "@/features/cash-transactions";
import { KasBankScreen } from "@/features/accounting";
import { branchService } from "@/services/branch.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { chartOfAccountsService } from "@/services/chartOfAccounts.service";
import { journalEntryService } from "@/services/journalEntry.service";
import { paymentChannelService } from "@/services/paymentChannel.service";

import { cashPage, cashTx, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");
jest.mock("@/services/chartOfAccounts.service");
jest.mock("@/services/journalEntry.service");

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
  usePathname: () => "/dashboard/keuangan/kas-bank",
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * TRANSAKSI KEUANGAN — the list, now the first sub-tab of KAS & BANK. What it
 * guards: money lands in the column of its direction, the cards are the server's
 * whole-filter totals, the Arah lens applies on click outside the panel, a
 * cancelled row stays visible, and the empty state offers the next step.
 *
 * DRIVEN THROUGH `KasBankScreen`, which is the screen the route renders — the
 * panel no longer owns its own state, and testing it with a hand-made one would
 * test a wiring nothing does.
 */
const NOW = "2026-09-16T04:00:00.000Z";
const receipt = cashTx();
const expense = cashTx({
  _id: "ct2",
  number: "BKK/CBS/2609/0003",
  direction: "out",
  kind: "expense",
  amount: "75000.0000",
  netAmount: "75000.0000",
  document: null,
  party: null,
  note: "Listrik Agustus",
});

const TOTALS = {
  in: { amount: "150000.0000", count: 1 },
  out: { amount: "75000.0000", count: 1 },
};

beforeEach(() => {
  jest.clearAllMocks();
  asMock(cashTransactionService.list).mockResolvedValue(
    cashPage([receipt, expense], TOTALS),
  );
  asMock(branchService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  asMock(paymentChannelService.list).mockResolvedValue(channelPage([]));
  // The Kas & Bank half of the page — the account table. Empty is fine: these
  // tests are about the list below it, and the table has a suite of its own.
  asMock(chartOfAccountsService.list).mockResolvedValue({
    items: [],
    pagination: { page: 1, limit: 100, total: 0, totalPages: 0 },
  });
  asMock(journalEntryService.movement).mockResolvedValue({
    period: { dateFrom: null, dateTo: null, timezone: "Asia/Jakarta" },
    accounts: [],
  });
  asMock(journalEntryService.balances).mockResolvedValue({
    asOf: null,
    timezone: "Asia/Jakarta",
    accounts: [],
  });
});

describe("Kas & Bank — transaksi: rows and totals", () => {
  /**
   * THE MOCKUP'S COLUMNS — Tanggal · Deskripsi · Akun · Cabang · Jumlah · Akun
   * Kas/Bank · Sumber · Status. One signed amount column, not two.
   */
  it("lays each row out in the mockup's columns", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    const inRow = (await screen.findByText("BKM/CBS/2609/0001")).closest("tr")!;
    const inCells = within(inRow).getAllByRole("cell");
    // Deskripsi falls back to the document it settled, with the bukti number
    // and the party underneath it.
    expect(inCells[1]).toHaveTextContent("INV/CBS/2609/0012");
    expect(inCells[1]).toHaveTextContent("BKM/CBS/2609/0001");
    expect(inCells[1]).toHaveTextContent("Bu Sari");
    expect(inCells[2]).toHaveTextContent("Piutang Usaha");
    expect(inCells[3]).toHaveTextContent("Cabang Pusat");
    expect(inCells[4]).toHaveTextContent("+ Rp 150.000");
    expect(inCells[5]).toHaveTextContent("Kas");
    expect(inCells[6]).toHaveTextContent("Pembayaran");
    expect(inCells[7]).toHaveTextContent("Tercatat");

    const outRow = screen.getByText("BKK/CBS/2609/0003").closest("tr")!;
    const outCells = within(outRow).getAllByRole("cell");
    expect(outCells[1]).toHaveTextContent("Listrik Agustus");
    expect(outCells[4]).toHaveTextContent("− Rp 75.000");
    // Typed by hand, so it says so — and carries the pencil that edits it.
    expect(outCells[6]).toHaveTextContent("Manual");
    expect(
      within(outRow).getByRole("button", { name: /Ubah BKK/ }),
    ).toBeInTheDocument();
  });

  /** Several lines cannot be named in one cell, so they are counted. */
  it("counts the accounts when an expense names more than one", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([
        cashTx({
          ...expense,
          counterAccounts: [
            { id: "a1", code: "6103", name: "Beban Utilitas" },
            { id: "a2", code: "6102", name: "Beban Sewa" },
          ],
        }),
      ]),
    );

    renderWithAuth(<KasBankScreen now={NOW} />);

    const row = (await screen.findByText("BKK/CBS/2609/0003")).closest("tr")!;
    expect(within(row).getAllByRole("cell")[2]).toHaveTextContent("2 akun");
  });

  /** Only the three the server can order correctly — see `SORTABLE`. */
  it("orders from the column headers it can order by", async () => {
    const user = userEvent.setup();
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("BKM/CBS/2609/0001");

    await user.click(screen.getByRole("button", { name: /Cabang/ }));
    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "branchDesc", page: 1 }),
      ),
    );

    // A second click on the same column flips it.
    await user.click(screen.getByRole("button", { name: /Cabang/ }));
    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: "branchAsc" }),
      ),
    );

    // Deskripsi and Akun are plain headers — the server has no ordering for
    // what those cells actually show.
    expect(
      screen.queryByRole("button", { name: /Deskripsi/ }),
    ).not.toBeInTheDocument();
  });

  it("asks for a bigger page when the size is changed", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("BKM/CBS/2609/0001");

    await user.click(screen.getByLabelText("Baris per halaman"));
    await user.click(await screen.findByRole("option", { name: "50 / halaman" }));

    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, page: 1 }),
      ),
    );
  });

  it("shows the server's totals for the whole filter, not a sum of the page", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([receipt], {
        in: { amount: "2500000.0000", count: 31 },
        out: { amount: "900000.0000", count: 12 },
      }),
    );

    renderWithAuth(<KasBankScreen now={NOW} />);

    const inTile = (await screen.findByText("Uang masuk")).parentElement!;
    expect(await within(inTile).findByText("Rp 2.500.000")).toBeInTheDocument();
    expect(within(inTile).getByText(/31 transaksi/)).toBeInTheDocument();

    const outTile = screen.getByText("Uang keluar").parentElement!;
    expect(within(outTile).getByText("Rp 900.000")).toBeInTheDocument();
  });

  it("keeps a cancelled row, struck through and labelled", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([cashTx({ status: "void", isVoided: true, recordedVia: "pos" })]),
    );

    renderWithAuth(<KasBankScreen now={NOW} />);

    const row = (await screen.findByText("BKM/CBS/2609/0001")).closest("tr")!;
    expect(within(row).getByText("Dibatalkan")).toBeInTheDocument();
    expect(within(row).getByText("Kasir")).toBeInTheDocument();
    expect(within(row).getAllByRole("cell")[4]).toHaveClass("line-through");
  });

  it("opens the detail when a row is clicked", async () => {
    const user = userEvent.setup();
    renderWithAuth(<KasBankScreen now={NOW} />);

    // Any cell opens it; the description is the one somebody reads first.
    await user.click(await screen.findByText("INV/CBS/2609/0012"));

    expect(mockPush).toHaveBeenCalledWith("/dashboard/keuangan/kas-bank/transaksi/ct1");
  });
});

describe("Kas & Bank — transaksi: filters", () => {
  it("applies the Arah pill on click, and does not count it on the Filter button", async () => {
    const user = userEvent.setup();
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("BKM/CBS/2609/0001");

    await user.click(screen.getByRole("button", { name: "Keluar" }));

    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ direction: "out", page: 1 }),
      ),
    );
    expect(screen.getByRole("button", { name: "Keluar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Filter" })).not.toHaveTextContent(
      "(",
    );
  });

  it("starts from a deep link's kind, as a chip and a counted filter", async () => {
    renderWithAuth(
      <KasBankScreen
        now={NOW}
        initialQuery={{ kinds: ["commission_payment"] }} />,
    );

    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenCalledWith(
        expect.objectContaining({ kind: ["commission_payment"] }),
      ),
    );
    expect(await screen.findByText("Pembayaran komisi")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  it("reads only what it recognises from the URL", () => {
    expect(
      cashTransactionsQueryFromParams({
        kind: "commission_payment,bogus",
        direction: "sideways",
        status: "void",
        documentId: "not-an-id",
      }),
    ).toEqual({ kinds: ["commission_payment"], status: "void" });

    expect(
      cashTransactionsQueryFromParams({ documentId: "64b7f0c2a1b2c3d4e5f60718" }),
    ).toEqual({ documentId: "64b7f0c2a1b2c3d4e5f60718" });
  });
});

describe("Kas & Bank — transaksi: empty and gated", () => {
  it("says there is nothing yet and offers the first one", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(cashPage([]));

    renderWithAuth(<KasBankScreen now={NOW} />);

    expect(
      await screen.findByText("Belum ada transaksi keuangan."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Catat yang pertama →" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/kas-bank/transaksi/new");
  });

  it("tells a filtered empty list apart from an empty book", async () => {
    const user = userEvent.setup();
    asMock(cashTransactionService.list).mockResolvedValue(cashPage([]));

    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("Belum ada transaksi keuangan.");

    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(
      await screen.findByText("Tidak ada transaksi di filter ini."),
    ).toBeInTheDocument();
  });

  it("offers Tambah transaksi only to a role that may create one", async () => {
    const { unmount } = renderWithAuth(<KasBankScreen now={NOW} />);
    expect(
      await screen.findByRole("link", { name: /Tambah transaksi/ }),
    ).toHaveAttribute("href", "/dashboard/keuangan/kas-bank/transaksi/new");
    unmount();

    renderWithAuth(<KasBankScreen now={NOW} />, {
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });
    await screen.findByText("BKM/CBS/2609/0001");
    expect(
      screen.queryByRole("link", { name: /Tambah transaksi/ }),
    ).not.toBeInTheDocument();
  });
});

describe("Kas & Bank — transaksi: search highlight", () => {
  it("marks nothing while there is no search term", async () => {
    const { container } = renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("BKM/CBS/2609/0001");

    expect(container.querySelector("mark")).toBeNull();
  });

  it("marks the part of the number that matched", async () => {
    renderWithAuth(<KasBankScreen
        now={NOW}
        initialQuery={{ search: "0001" }} />);

    const hit = await screen.findByText("0001", { selector: "mark" });
    expect(hit.closest("a")).toHaveTextContent("BKM/CBS/2609/0001");
  });

  it("shows and marks a reference the columns would otherwise hide", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([cashTx({ ref: "TRF-7788" })], TOTALS),
    );

    renderWithAuth(<KasBankScreen
        now={NOW}
        initialQuery={{ search: "7788" }} />);

    const hit = await screen.findByText("7788", { selector: "mark" });
    expect(hit.closest("p")).toHaveTextContent("Ref. TRF-7788");
  });
});
