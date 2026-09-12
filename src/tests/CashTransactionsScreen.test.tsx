import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import {
  CashTransactionsScreen,
  cashTransactionsQueryFromParams,
} from "@/features/cash-transactions";
import { branchService } from "@/services/branch.service";
import { cashTransactionService } from "@/services/cashTransaction.service";
import { paymentChannelService } from "@/services/paymentChannel.service";

import { cashPage, cashTx, channelPage } from "./helpers/cashTransactionFixture";
import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/cashTransaction.service");
jest.mock("@/services/branch.service");
jest.mock("@/services/paymentChannel.service");

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (href: string) => mockPush(href) }),
  usePathname: () => "/dashboard/keuangan/transaksi",
}));

const asMock = <T extends (...args: never[]) => unknown>(fn: T) =>
  fn as jest.MockedFunction<T>;

/**
 * TRANSAKSI KEUANGAN — the list. What it guards: money lands in the column of
 * its direction, the cards are the server's whole-filter totals, the Arah lens
 * applies on click outside the panel, a cancelled row stays visible, and the
 * empty state offers the next step.
 */
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
});

describe("CashTransactionsScreen — rows and totals", () => {
  it("puts each amount in the column of its direction", async () => {
    renderWithAuth(<CashTransactionsScreen />);

    const inRow = (await screen.findByText("BKM/CBS/2609/0001")).closest("tr")!;
    const inCells = within(inRow).getAllByRole("cell");
    expect(inCells[2]).toHaveTextContent("Penerimaan piutang");
    expect(inCells[3]).toHaveTextContent("Bu Sari");
    expect(inCells[3]).toHaveTextContent("INV/CBS/2609/0012");
    expect(inCells[4]).toHaveTextContent("Kas Laci");
    expect(inCells[5]).toHaveTextContent("Rp 150.000");
    expect(inCells[6]).toHaveTextContent("");
    expect(inCells[7]).toHaveTextContent("Tercatat");

    const outRow = screen.getByText("BKK/CBS/2609/0003").closest("tr")!;
    const outCells = within(outRow).getAllByRole("cell");
    expect(outCells[2]).toHaveTextContent("Pengeluaran");
    expect(outCells[3]).toHaveTextContent("Listrik Agustus");
    expect(outCells[5]).toHaveTextContent("");
    expect(outCells[6]).toHaveTextContent("Rp 75.000");
  });

  it("shows the server's totals for the whole filter, not a sum of the page", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([receipt], {
        in: { amount: "2500000.0000", count: 31 },
        out: { amount: "900000.0000", count: 12 },
      }),
    );

    renderWithAuth(<CashTransactionsScreen />);

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

    renderWithAuth(<CashTransactionsScreen />);

    const row = (await screen.findByText("BKM/CBS/2609/0001")).closest("tr")!;
    expect(within(row).getByText("Dibatalkan")).toBeInTheDocument();
    expect(within(row).getByText("Kasir")).toBeInTheDocument();
    expect(within(row).getByText("Rp 150.000")).toHaveClass("line-through");
  });

  it("opens the detail when a row is clicked", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionsScreen />);

    await user.click(await screen.findByText("Bu Sari"));

    expect(mockPush).toHaveBeenCalledWith("/dashboard/keuangan/transaksi/ct1");
  });
});

describe("CashTransactionsScreen — filters", () => {
  it("applies the Arah pill on click, and does not count it on the Filter button", async () => {
    const user = userEvent.setup();
    renderWithAuth(<CashTransactionsScreen />);
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
      <CashTransactionsScreen initialQuery={{ kinds: ["commission_payment"] }} />,
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

describe("CashTransactionsScreen — empty and gated", () => {
  it("says there is nothing yet and offers the first one", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(cashPage([]));

    renderWithAuth(<CashTransactionsScreen />);

    expect(
      await screen.findByText("Belum ada transaksi keuangan."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Catat yang pertama →" }),
    ).toHaveAttribute("href", "/dashboard/keuangan/transaksi/new");
  });

  it("tells a filtered empty list apart from an empty book", async () => {
    const user = userEvent.setup();
    asMock(cashTransactionService.list).mockResolvedValue(cashPage([]));

    renderWithAuth(<CashTransactionsScreen />);
    await screen.findByText("Belum ada transaksi keuangan.");

    await user.click(screen.getByRole("button", { name: "Masuk" }));

    expect(
      await screen.findByText("Tidak ada transaksi di filter ini."),
    ).toBeInTheDocument();
  });

  it("offers Catat transaksi only to a role that may create one", async () => {
    const { unmount } = renderWithAuth(<CashTransactionsScreen />);
    expect(
      await screen.findByRole("link", { name: /Catat transaksi/ }),
    ).toHaveAttribute("href", "/dashboard/keuangan/transaksi/new");
    unmount();

    renderWithAuth(<CashTransactionsScreen />, {
      isSuperAdmin: false,
      permissions: [{ feature: "cashTransactions", actions: ["read"] }],
    });
    await screen.findByText("BKM/CBS/2609/0001");
    expect(
      screen.queryByRole("link", { name: /Catat transaksi/ }),
    ).not.toBeInTheDocument();
  });
});

describe("CashTransactionsScreen — search highlight", () => {
  it("marks nothing while there is no search term", async () => {
    const { container } = renderWithAuth(<CashTransactionsScreen />);
    await screen.findByText("BKM/CBS/2609/0001");

    expect(container.querySelector("mark")).toBeNull();
  });

  it("marks the part of the number that matched", async () => {
    renderWithAuth(<CashTransactionsScreen initialQuery={{ search: "0001" }} />);

    const hit = await screen.findByText("0001", { selector: "mark" });
    expect(hit.closest("a")).toHaveTextContent("BKM/CBS/2609/0001");
  });

  it("shows and marks a reference the columns would otherwise hide", async () => {
    asMock(cashTransactionService.list).mockResolvedValue(
      cashPage([cashTx({ ref: "TRF-7788" })], TOTALS),
    );

    renderWithAuth(<CashTransactionsScreen initialQuery={{ search: "7788" }} />);

    const hit = await screen.findByText("7788", { selector: "mark" });
    expect(hit.closest("p")).toHaveTextContent("Ref. TRF-7788");
  });
});
