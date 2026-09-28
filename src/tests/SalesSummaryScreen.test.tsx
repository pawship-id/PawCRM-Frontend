import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SalesSummaryScreen } from "@/features/sales";
import { customerInvoiceService } from "@/services/customerInvoice.service";
import type {
  CustomerInvoiceListSummary,
  RevenueBreakdown,
  RevenueBreakdownAxis,
} from "@/types/api";

import { renderWithAuth } from "./helpers/renderWithAuth";

jest.mock("@/services/customerInvoice.service");

jest.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/sales",
}));

const mocked = customerInvoiceService as jest.Mocked<
  typeof customerInvoiceService
>;

const figure = (amount: string, invoiceCount: number) => ({
  amount,
  invoiceCount,
});

const PERIOD = {
  from: "2026-09-01T00:00:00.000Z",
  to: "2026-09-30T23:59:59.999Z",
  fromDate: "2026-09-01",
  toDate: "2026-09-30",
};

function summary(): CustomerInvoiceListSummary {
  return {
    asOf: "2026-09-28T00:00:00.000Z",
    period: PERIOD,
    revenue: figure("12500000.0000", 34),
    collected: figure("9000000.0000", 28),
    outstanding: figure("3500000.0000", 6),
    overdue: figure("1200000.0000", 2),
  };
}

/** The two line axes: bars that add up to LESS than the omzet, and say so. */
function lineBreakdown(axis: RevenueBreakdownAxis): RevenueBreakdown {
  const named =
    axis === "category"
      ? { id: "cat1", name: "Makanan" }
      : { id: "line1", name: "Retail" };

  return {
    asOf: "2026-09-28T00:00:00.000Z",
    period: PERIOD,
    axis,
    basis: "line",
    total: "12000000.0000",
    groups: [
      { ...named, amount: "9000000.0000", lineCount: 40, invoiceCount: null },
      // The unnamed bucket — a service with no category, or a catalogue row with
      // no lini. The API leaves it unlabelled on purpose.
      {
        id: null,
        name: null,
        amount: "3000000.0000",
        lineCount: 5,
        invoiceCount: null,
      },
    ],
  };
}

/** The customer axis: invoice totals, which reconcile with the omzet exactly. */
function customerBreakdown(): RevenueBreakdown {
  return {
    asOf: "2026-09-28T00:00:00.000Z",
    period: PERIOD,
    axis: "customerType",
    basis: "invoice",
    total: "12500000.0000",
    groups: [
      {
        id: "type1",
        name: "B2B",
        amount: "12500000.0000",
        lineCount: null,
        invoiceCount: 34,
      },
    ],
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mocked.summary.mockResolvedValue(summary());
  mocked.revenueBreakdown.mockImplementation(async (axis) =>
    axis === "customerType" ? customerBreakdown() : lineBreakdown(axis),
  );
  mocked.filterOptions.mockResolvedValue({
    branches: [{ _id: "b1", name: "Cabang Pusat" }],
    warehouses: [],
    creators: [],
  });
});

/**
 * The Ringkasan tab: the period's omzet and the three answers to what it was
 * made of — two counted per line, one per invoice.
 */
describe("SalesSummaryScreen", () => {
  it("asks every endpoint one question — the list's own filter, opened on this month", async () => {
    renderWithAuth(<SalesSummaryScreen />);

    await waitFor(() => expect(mocked.revenueBreakdown).toHaveBeenCalledTimes(3));

    expect(mocked.summary.mock.calls[0][0]).toEqual({ period: "month" });
    // The card and every bar under it must never be asked different questions.
    expect(mocked.revenueBreakdown.mock.calls.map((call) => call[0])).toEqual([
      "category",
      "businessLine",
      "customerType",
    ]);
    mocked.revenueBreakdown.mock.calls.forEach((call) => {
      expect(call[1]).toEqual({ period: "month" });
    });
  });

  /*
    NO SEARCH BOX AND NO `Filter` BUTTON (29 September 2026, on request) — the
    row is a cabang dropdown and five chips, applying on click, the same one
    Pembelian › Ringkasan wears.
  */
  it("draws the scope row outright, with no search and no Filter button", async () => {
    renderWithAuth(<SalesSummaryScreen />);

    const scope = await screen.findByLabelText("Lingkup data");
    expect(within(scope).getByRole("button", { name: "Cabang" })).toHaveTextContent(
      "Semua cabang",
    );
    expect(within(scope).getByRole("button", { name: "Bulan ini" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("button", { name: /^Filter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("re-asks both endpoints when a chip or the cabang changes", async () => {
    const user = userEvent.setup();
    renderWithAuth(<SalesSummaryScreen />);

    await waitFor(() => expect(mocked.revenueBreakdown).toHaveBeenCalledTimes(3));

    await user.click(screen.getByRole("button", { name: "Hari ini" }));

    // The card and every bar under it move together — one filter, four requests.
    await waitFor(() =>
      expect(mocked.summary).toHaveBeenLastCalledWith({ period: "today" }),
    );
    expect(mocked.revenueBreakdown).toHaveBeenLastCalledWith("customerType", {
      period: "today",
    });

    await user.click(screen.getByRole("button", { name: "Cabang" }));
    await user.click(await screen.findByRole("option", { name: "Cabang Pusat" }));

    await waitFor(() =>
      expect(mocked.summary).toHaveBeenLastCalledWith({
        branchIds: ["b1"],
        period: "today",
      }),
    );
  });

  it("shows the server's omzet, not a sum of rows", async () => {
    renderWithAuth(<SalesSummaryScreen />);

    expect(await screen.findByText("Rp 12.500.000")).toBeInTheDocument();
    // Twice: the card's caption, and the customer-type row that counted the
    // same 34 documents.
    expect(await screen.findAllByText("34 faktur")).toHaveLength(2);
  });

  it("draws all three breakdowns, each naming its own unnamed bucket", async () => {
    renderWithAuth(<SalesSummaryScreen />);

    expect(
      await screen.findByRole("heading", { name: "Omzet per kategori produk" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Omzet per layanan" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Omzet per kategori pelanggan" }),
    ).toBeInTheDocument();

    // Dropping an unnamed group would make the bars add up to less than the
    // panel's own total with nothing on screen saying why.
    expect(screen.getByText(/Tanpa kategori/)).toBeInTheDocument();
    expect(screen.getByText(/Tanpa lini usaha/)).toBeInTheDocument();
  });

  it("says where each panel's figures come from", async () => {
    renderWithAuth(<SalesSummaryScreen />);

    // Each note names the master list the field lives on, and links to it — the
    // whole point being that a reader can go and check the grouping.
    expect(
      await screen.findByRole("link", { name: "Produk & Varian" }),
    ).toHaveAttribute("href", "/dashboard/inventory/products");
    expect(
      screen.getByRole("link", { name: "Pengaturan › Lini bisnis" }),
    ).toHaveAttribute("href", "/dashboard/pengaturan/lini-bisnis");
    expect(
      screen.getByRole("link", { name: "Pengaturan › Kategori pelanggan" }),
    ).toHaveAttribute("href", "/dashboard/pengaturan/tipe-pelanggan");
    // The two line axes say so; the customer one says where it reads from.
    expect(screen.getAllByText(/dibaca per baris faktur/)).toHaveLength(2);
    expect(
      screen.getByText(/Dibaca dari register hari ini/),
    ).toBeInTheDocument();
  });

  it("reconciles a line-based panel with the omzet, and says the customer one needs no allocation", async () => {
    renderWithAuth(<SalesSummaryScreen />);

    // Two panels are short of the omzet; both print the gap rather than hide it.
    expect(
      await screen.findAllByText(
        /Total nilai baris Rp 12\.000\.000 dari omzet Rp 12\.500\.000/,
      ),
    ).toHaveLength(2);
    expect(
      screen.getByText(/Total Rp 12\.500\.000 — sama dengan omzet periode/),
    ).toBeInTheDocument();
  });

  it("counts lines on the line axes and faktur on the customer one", async () => {
    renderWithAuth(<SalesSummaryScreen />);

    expect(await screen.findAllByText("40 baris")).toHaveLength(2);
    expect(screen.getAllByText("34 faktur")).toHaveLength(2);
  });

  it("fails one panel at a time, keeping the answers it did get", async () => {
    mocked.revenueBreakdown.mockImplementation(async (axis) => {
      if (axis === "businessLine") throw new Error("boom");
      return axis === "customerType" ? customerBreakdown() : lineBreakdown(axis);
    });

    renderWithAuth(<SalesSummaryScreen />);

    expect(
      await screen.findByText(/Rincian ini tidak bisa dimuat/),
    ).toBeInTheDocument();
    expect(screen.getByText("Rp 12.500.000")).toBeInTheDocument();
    expect(screen.getByText(/Tanpa kategori/)).toBeInTheDocument();
  });

  it("shows a dash rather than Rp 0 when the summary fails", async () => {
    mocked.summary.mockRejectedValue(new Error("boom"));
    renderWithAuth(<SalesSummaryScreen />);

    expect(await screen.findByText("gagal dimuat")).toBeInTheDocument();
    expect(screen.queryByText("Rp 0")).not.toBeInTheDocument();
  });
});
