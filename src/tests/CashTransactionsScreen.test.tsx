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
 * A stat tile by its caption. `getByText` alone is ambiguous since the Tipe
 * pills took the cards' own words ("Uang masuk"/"Uang keluar") — deliberately,
 * so one screen names one thing one way. The card draws its caption in a `<p>`;
 * the pill is a `<button>`.
 */
const statTile = (label: string) =>
  screen
    .getAllByText(label)
    .find((node) => node.tagName === "P")!.parentElement!;

/**
 * TRANSAKSI KEUANGAN — the list, now the first sub-tab of KAS & BANK. What it
 * guards: money lands in the column of its direction, the cards are the server's
 * whole-filter totals, every filter lives behind the one Filter button,
 * cancelled rows are asked out of the list by default and still render when
 * asked back in, and the empty state offers the next step.
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
   * Kas/Bank · Sumber. One signed amount column, not two, and NO Status: it went
   * on 20 September 2026 with the cancelled rows it labelled.
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
    // Seven cells, and the last of them is Sumber.
    expect(inCells).toHaveLength(7);
    // A posted row wears no chip at all — "Tercatat" on every row is the noise
    // the column was dropped to be rid of.
    expect(within(inRow).queryByText("Tercatat")).not.toBeInTheDocument();

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

    // The shared `ListFooter` reads "Tampilkan [50] / halaman": the captions are
    // the footer's, so the option itself is the bare number.
    await user.click(screen.getByLabelText("Baris per halaman"));
    await user.click(await screen.findByRole("option", { name: "50" }));

    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ limit: 50, page: 1 }),
      ),
    );
  });

  /*
    THE FOOTER IS SHARED WITH FAKTUR PENJUALAN (`ListFooter`). What is worth
    guarding here is the pair of rules the two old footers disagreed about: the
    position line never goes away, and the pager does when there is one page.
  */
  it("states the range and hides the pager when everything fits on one page", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    expect(
      await screen.findByText("Menampilkan 1–2 dari 2 transaksi"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Baris per halaman")).toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Paginasi" }),
    ).not.toBeInTheDocument();
  });

  it("numbers the pages, and does not stop at Sebelumnya/Berikutnya", async () => {
    const base = cashPage([receipt, expense]);
    asMock(cashTransactionService.list).mockResolvedValue({
      ...base,
      pagination: { page: 2, limit: 10, total: 44, totalPages: 5 },
    });

    renderWithAuth(<KasBankScreen now={NOW} />);

    const pager = await screen.findByRole("navigation", { name: "Paginasi" });
    expect(within(pager).getByText("Sebelumnya")).toBeInTheDocument();
    expect(within(pager).getByText("Berikutnya")).toBeInTheDocument();
    // Five pages fit inside `getPageItems`' uncollapsed window, so all five are
    // there — the windowing itself is `Pagination`'s to guard, not this footer's.
    for (const page of [1, 2, 3, 4, 5]) {
      expect(
        within(pager).getByRole("button", { name: `Halaman ${page}` }),
      ).toBeInTheDocument();
    }
    expect(
      within(pager).getByRole("button", { name: "Halaman 2" }),
    ).toHaveAttribute("aria-current", "page");
  });

  /*
    A SIZE THE MENU DOES NOT NAME still has to be offered back, or picking any
    option is a one-way door out of the size the list started in. 25/50/100 are
    the menu; 20 can still arrive from a stored query or a deep link.
  */
  it("offers the size it started on, even though the list does not name it", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    renderWithAuth(<KasBankScreen now={NOW} initialQuery={{ limit: 20 }} />);
    await screen.findByText("BKM/CBS/2609/0001");

    await user.click(screen.getByLabelText("Baris per halaman"));

    expect(
      await screen.findByRole("option", { name: "20" }),
    ).toBeInTheDocument();
  });

  it("shows the server's totals for the whole filter, not a sum of the page", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([receipt], {
        in: { amount: "2500000.0000", count: 31 },
        out: { amount: "900000.0000", count: 12 },
      }),
    );

    renderWithAuth(<KasBankScreen now={NOW} />);

    await screen.findAllByText("Uang masuk");
    const inTile = statTile("Uang masuk");
    expect(await within(inTile).findByText("Rp 2.500.000")).toBeInTheDocument();
    expect(within(inTile).getByText(/31 transaksi/)).toBeInTheDocument();

    const outTile = statTile("Uang keluar");
    expect(within(outTile).getByText("Rp 900.000")).toBeInTheDocument();
  });

  /*
    THE LIST ASKS THE SERVER FOR POSTED ROWS and does not sift them itself: the
    pager and the two cards come from the same response, so a row hidden in the
    client would be a row the pager still counted.
  */
  it("leaves the cancelled rows out of the list by default", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("BKM/CBS/2609/0001");

    expect(cashTransactionService.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: "posted" }),
    );
    // And the default costs nothing on the Filter button — it narrows nothing
    // somebody chose.
    expect(screen.getByRole("button", { name: "Filter" })).not.toHaveTextContent(
      "(",
    );
  });

  it("draws a cancelled row struck through when one is asked for", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([cashTx({ status: "void", isVoided: true, recordedVia: "pos" })]),
    );

    renderWithAuth(<KasBankScreen now={NOW} initialQuery={{ status: "void" }} />);

    const row = (await screen.findByText("BKM/CBS/2609/0001")).closest("tr")!;
    // Both chips moved into Deskripsi when the Status column went: the row is
    // struck through, and §1.3 wants the WORD beside it either way.
    const cells = within(row).getAllByRole("cell");
    expect(within(cells[1]).getByText("Dibatalkan")).toBeInTheDocument();
    expect(within(cells[1]).getByText("Kasir")).toBeInTheDocument();
    expect(cells[4]).toHaveClass("line-through");
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
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
  /*
    TIPE IS IN THE PANEL since 20 September 2026 — it was a pill row above the
    table. Two things follow and both are guarded here: it waits for Terapkan
    like every other field in a panel, and it is COUNTED on the trigger, which a
    pill row was exempt from because it concealed nothing.
  */
  it("applies Tipe from the panel, and counts it on the Filter button", async () => {
    const user = userEvent.setup();
    renderWithAuth(<KasBankScreen now={NOW} />);
    await screen.findByText("BKM/CBS/2609/0001");

    expect(
      screen.queryByRole("group", { name: "Tipe" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByLabelText("Filter tipe"));
    await user.click(await screen.findByRole("option", { name: "Uang keluar" }));

    // A panel's fields wait for Terapkan — picking one sends nothing yet.
    expect(cashTransactionService.list).not.toHaveBeenCalledWith(
      expect.objectContaining({ direction: "out" }),
    );

    await user.click(screen.getByRole("button", { name: "Terapkan" }));

    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ direction: "out", page: 1 }),
      ),
    );
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
    expect(
      screen.getByRole("button", { name: "Hapus filter Uang keluar" }),
    ).toBeInTheDocument();
  });

  /*
    SUMBER IS A GROUP OF KINDS, and the server still filters by kind — so what
    the request carries is the expansion, not the word on the control.
  */
  it("expands the chosen Sumber into the kinds the server filters by", async () => {
    renderWithAuth(<KasBankScreen now={NOW} initialQuery={{ source: "manual" }} />);

    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenCalledWith(
        expect.objectContaining({ kind: ["expense", "other_income"] }),
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Hapus filter Manual" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  /*
    TRANSFER IS DRAWN BY THE MOCKUP AND DOES NOT EXIST HERE. Asking for it must
    answer "none" — never "all", which is what an absent `kind` means to the API.
  */
  it("answers Transfer with an empty list, without asking the server", async () => {
    renderWithAuth(<KasBankScreen now={NOW} initialQuery={{ source: "transfer" }} />);

    expect(
      await screen.findByText("Tidak ada transaksi di filter ini."),
    ).toBeInTheDocument();
    expect(cashTransactionService.list).not.toHaveBeenCalled();
    // The cards state a fact rather than a leftover from the last filter.
    const inTile = statTile("Uang masuk");
    expect(within(inTile).getByText("Rp 0")).toBeInTheDocument();
  });

  it("starts from a deep link's kind, as a chip and a counted filter", async () => {
    renderWithAuth(
      <KasBankScreen
        now={NOW}
        initialQuery={{ source: "commission" }} />,
    );

    await waitFor(() =>
      expect(cashTransactionService.list).toHaveBeenCalledWith(
        expect.objectContaining({ kind: ["commission_payment"] }),
      ),
    );
    // The chip's own remove button, not the bare word: "Komisi" is also the
    // module nav's tab for the commission recap.
    expect(
      await screen.findByRole("button", { name: "Hapus filter Komisi" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filter" })).toHaveTextContent(
      "Filter (1)",
    );
  });

  it("reads only what it recognises from the URL", () => {
    // A legacy `?kind=` still lands on the Sumber that contains it — the komisi
    // recap links here that way, and those links are in people's histories.
    expect(
      cashTransactionsQueryFromParams({
        kind: "commission_payment,bogus",
        direction: "sideways",
        status: "void",
        documentId: "not-an-id",
      }),
    ).toEqual({ source: "commission", status: "void" });

    expect(cashTransactionsQueryFromParams({ source: "manual" })).toEqual({
      source: "manual",
    });
    expect(cashTransactionsQueryFromParams({ source: "bogus" })).toEqual({});

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

    await user.click(screen.getByRole("button", { name: "Filter" }));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByLabelText("Filter tipe"));
    await user.click(await screen.findByRole("option", { name: "Uang masuk" }));
    await user.click(screen.getByRole("button", { name: "Terapkan" }));

    expect(
      await screen.findByText("Tidak ada transaksi di filter ini."),
    ).toBeInTheDocument();
  });

  /*
    IT SITS ON THE SEARCH ROW, level with `Filter (n)` — not above it, which is
    where an `items-start` flex used to pin it when a pill row led the toolbar.
  */
  it("puts Tambah transaksi on the same row as the Filter button", async () => {
    renderWithAuth(<KasBankScreen now={NOW} />);

    const filter = await screen.findByRole("button", { name: "Filter" });
    // `FilterTrigger` is a direct child of the bar's row, so the row is its parent.
    const row = filter.parentElement!;

    expect(
      within(row).getByRole("link", { name: /Tambah transaksi/ }),
    ).toBeInTheDocument();
    expect(within(row).getByLabelText("Cari transaksi")).toBeInTheDocument();
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
